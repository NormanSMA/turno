/**
 * TURNO — Sesión y autorización, resueltas SIEMPRE en el servidor.
 *
 * Ocultar un botón en React no es autorización: el usuario puede llamar la API
 * directamente. Todo endpoint protegido pasa por `exigirSesion` / `exigirRol`,
 * y toda lectura de un pedido pasa por `puedeVerPedido` — que es la defensa
 * contra IDOR (cambiar el id en la URL para leer el pedido de otro).
 */

import { cookies } from "next/headers";
import { prisma } from "./db";
import {
  asignarCondicion,
  esCorreoInstitucional,
  evaluarSesion,
  evaluarToken,
  expiracionEnlace,
  expiracionSesion,
  generarToken,
  hashToken,
  normalizarCorreo,
} from "@/core/identidad";
import {
  puedeVerPedido,
  type RolUsuario,
  type SesionActiva,
} from "@/core/autorizacion";
import {
  hashPassword,
  usaPassword,
  validarPassword,
  verificarPassword,
} from "@/core/credenciales";

export type { SesionActiva, RolUsuario };

export const COOKIE_SESION = "turno_sesion";

/** Atributos de la cookie. `httpOnly` la hace inaccesible a JavaScript, así que
 *  un XSS no puede robar la sesión; `sameSite: lax` corta el CSRF de escritura
 *  desde otro sitio; `secure` fuera de desarrollo. */
export function opcionesCookie(expiraEn: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiraEn,
  };
}

export class NoAutenticado extends Error {
  readonly status = 401;
  constructor() {
    super("Se requiere iniciar sesión");
    this.name = "NoAutenticado";
  }
}

export class NoAutorizado extends Error {
  readonly status = 403;
  constructor(detalle = "No tiene permiso para esta operación") {
    super(detalle);
    this.name = "NoAutorizado";
  }
}

/** Lee la sesión del request. Devuelve null si no hay o si ya no vale. */
export async function sesionActual(): Promise<SesionActiva | null> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (!token) return null;

  const sesion = await prisma.sesion.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: true },
  });
  if (!evaluarSesion(sesion).valido || !sesion) return null;

  return {
    sesionId: sesion.id,
    usuarioId: sesion.usuario.id,
    correo: sesion.usuario.correo,
    nombre: sesion.usuario.nombre,
    rol: sesion.usuario.rol,
    comercioId: sesion.usuario.comercioId,
    condicionExperimental: sesion.usuario.condicionExperimental,
  };
}

export async function exigirSesion(): Promise<SesionActiva> {
  const s = await sesionActual();
  if (!s) throw new NoAutenticado();
  return s;
}

export async function exigirRol(
  ...roles: RolUsuario[]
): Promise<SesionActiva> {
  const s = await exigirSesion();
  if (!roles.includes(s.rol)) {
    throw new NoAutorizado(`Requiere rol ${roles.join(" o ")}`);
  }
  return s;
}

/** El operador solo manda sobre SU comercio. Un COMERCIO no puede tocar otro. */
export async function exigirComercio(comercioId: string): Promise<SesionActiva> {
  const s = await exigirRol("COMERCIO");
  if (s.comercioId !== comercioId) {
    throw new NoAutorizado("Esta cuenta no opera este comercio");
  }
  return s;
}

/**
 * Resuelve el comercio del slug y comprueba que la sesión lo opere.
 *
 * Reemplaza un preámbulo que estaba copiado en cinco rutas —buscar el comercio,
 * 404 si no existe, `exigirComercio`— y cambia dos cosas de ese preámbulo:
 *
 *   1. **Autentica antes de responder.** El 404 salía antes de `exigirComercio`,
 *      así que un anónimo distinguía un slug que existe (403) de uno que no
 *      (404). Acá los slugs ya son públicos y no había nada que enumerar, pero
 *      el orden "responder antes de autenticar" no conviene normalizarlo: la
 *      próxima ruta que lo copie puede no tener un recurso público.
 *   2. **Un solo error para las dos causas**, como ya hacían
 *      `exigirAccesoPedido` y la subida de imágenes. "No existe" y "no es tuyo"
 *      se responden igual.
 *
 * Cinco copias también eran cinco lugares donde la guarda podía divergir sin
 * que nada avisara.
 */
export async function exigirComercioPorSlug(slug: string) {
  const sesion = await exigirRol("COMERCIO");
  const comercio = await prisma.comercio.findUnique({ where: { slug } });
  if (!comercio || sesion.comercioId !== comercio.id) {
    throw new NoAutorizado("Comercio inexistente o ajeno");
  }
  return { sesion, comercio };
}

export async function exigirAccesoPedido(pedidoId: string) {
  const sesion = await exigirSesion();
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { franja: { select: { comercioId: true } } },
  });
  // Mismo error para "no existe" y "no es tuyo": responder distinto convertiría
  // el endpoint en un oráculo para enumerar qué pedidos existen.
  if (
    !pedido ||
    !puedeVerPedido(sesion, {
      usuarioId: pedido.usuarioId,
      comercioId: pedido.franja.comercioId,
    })
  ) {
    throw new NoAutorizado("Pedido inexistente o ajeno");
  }
  return { sesion, pedido };
}

// --------------------------------------------------------------- Registro ---

export interface DatosRegistro {
  facultad?: string | null;
  carrera?: string | null;
  anio?: number | null;
  frecuenciaCompraPrevia?: string | null;
  consentimiento?: boolean;
  canalCaptacion?: string | null;
}

/**
 * Crea (o recupera) el usuario y emite un enlace mágico.
 * Devuelve el token EN CLARO una sola vez para que el llamador lo envíe por
 * correo. No se registra en logs ni se vuelve a poder recuperar.
 */
export async function emitirEnlace(
  correoBruto: string,
  datos: DatosRegistro = {},
): Promise<{ token: string; usuarioId: string; nuevo: boolean }> {
  const correo = normalizarCorreo(correoBruto);
  if (!esCorreoInstitucional(correo)) {
    throw new NoAutorizado("Se requiere un correo institucional de la UAM");
  }

  const existente = await prisma.usuario.findUnique({ where: { correo } });

  // Las cuentas de operación NO entran por enlace mágico (ADR-08). Si se
  // permitiera, la contraseña dejaría de ser el control de acceso: bastaría con
  // tener el buzón. Y en la práctica el operador terminaría dependiendo de un
  // correo personal para desbloquear una pantalla compartida.
  if (existente && usaPassword(existente.rol)) {
    throw new NoAutorizado(
      "Esta cuenta es de operación: entrá con tu usuario y contraseña",
    );
  }

  const usuario =
    existente ??
    (await prisma.usuario.create({
      data: {
        correo,
        // Asignación aleatoria server-side, una sola vez en la vida del usuario.
        condicionExperimental: asignarCondicion(),
        facultad: datos.facultad ?? null,
        carrera: datos.carrera ?? null,
        anio: datos.anio ?? null,
        frecuenciaCompraPrevia: datos.frecuenciaCompraPrevia ?? null,
        consentimiento: datos.consentimiento ?? false,
        canalCaptacion: datos.canalCaptacion ?? null,
      },
    }));

  const token = generarToken();
  await prisma.tokenAcceso.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: hashToken(token),
      expiraEn: expiracionEnlace(),
    },
  });

  await prisma.notificacion.create({
    data: {
      destinatario: correo,
      tipo: "ENLACE_ACCESO",
      payload: { usuarioId: usuario.id },
    },
  });

  return { token, usuarioId: usuario.id, nuevo: !existente };
}

export type MotivoCanjeFallido = "INEXISTENTE" | "EXPIRADO" | "YA_USADO";

/**
 * Canjea el enlace mágico por una sesión. El token se marca usado dentro de la
 * misma transacción que crea la sesión: dos clics sobre el mismo enlace no
 * producen dos sesiones.
 */
export async function canjearEnlace(
  token: string,
  userAgent?: string | null,
): Promise<
  | { ok: true; token: string; expiraEn: Date; usuarioId: string }
  | { ok: false; motivo: MotivoCanjeFallido }
> {
  const hash = hashToken(token);

  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<
      { id: string; usuarioId: string; expiraEn: Date; usadoEn: Date | null }[]
    >`
      SELECT id, "usuarioId", "expiraEn", "usadoEn"
      FROM token_acceso WHERE "tokenHash" = ${hash}
      FOR UPDATE
    `;
    const registro = filas[0] ?? null;
    const estado = evaluarToken(registro);
    if (!estado.valido || !registro) {
      return { ok: false as const, motivo: estado.motivo as MotivoCanjeFallido };
    }

    await tx.tokenAcceso.update({
      where: { id: registro.id },
      data: { usadoEn: new Date() },
    });

    const tokenSesion = generarToken();
    const expiraEn = expiracionSesion();
    await tx.sesion.create({
      data: {
        usuarioId: registro.usuarioId,
        tokenHash: hashToken(tokenSesion),
        expiraEn,
        userAgent: userAgent ?? null,
      },
    });

    return {
      ok: true as const,
      token: tokenSesion,
      expiraEn,
      usuarioId: registro.usuarioId,
    };
  });
}

export async function cerrarSesion(sesionId: string): Promise<void> {
  await prisma.sesion.update({
    where: { id: sesionId },
    data: { revocadaEn: new Date() },
  });
}

// ---------------------------------------------------- Acceso con credenciales ---

export type MotivoAccesoFallido =
  | "CREDENCIALES_INVALIDAS"
  | "CUENTA_SIN_PASSWORD";

/**
 * Acceso para cuentas de operación (COMERCIO / ADMIN).
 *
 * Un principio y una consecuencia:
 *
 *   - Nunca se distingue "el correo no existe" de "la contraseña está mal". La
 *     respuesta es la misma, y la verificación se ejecuta igual aunque el
 *     usuario no exista, para que el TIEMPO de respuesta tampoco lo delate.
 *   - Una cuenta de ESTUDIANTE no puede entrar por acá aunque alguien le ponga
 *     un hash: el rol decide el método, no al revés.
 */
export async function accederConCredenciales(
  correoBruto: string,
  password: string,
  userAgent?: string | null,
): Promise<
  | { ok: true; token: string; expiraEn: Date; rol: RolUsuario; debeCambiarPassword: boolean }
  | { ok: false; motivo: MotivoAccesoFallido }
> {
  const correo = normalizarCorreo(correoBruto);
  const usuario = await prisma.usuario.findUnique({ where: { correo } });

  // Hash señuelo: se verifica siempre, exista o no la cuenta, para que el
  // tiempo de respuesta no revele qué correos están registrados.
  const hash =
    usuario && usaPassword(usuario.rol) ? usuario.passwordHash : SENUELO;

  const coincide = await verificarPassword(password, hash);

  if (!usuario || !usaPassword(usuario.rol) || !usuario.passwordHash || !coincide) {
    return { ok: false as const, motivo: "CREDENCIALES_INVALIDAS" };
  }

  const tokenSesion = generarToken();
  const expiraEn = expiracionSesion();
  await prisma.$transaction([
    prisma.sesion.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: hashToken(tokenSesion),
        expiraEn,
        userAgent: userAgent ?? null,
      },
    }),
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAccesoEn: new Date() },
    }),
  ]);

  return {
    ok: true as const,
    token: tokenSesion,
    expiraEn,
    rol: usuario.rol,
    debeCambiarPassword: usuario.debeCambiarPassword,
  };
}

/** Hash de una contraseña que nadie conoce. Solo sirve para gastar el mismo
 *  tiempo de cómputo cuando la cuenta no existe. */
const SENUELO =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * Cambio de contraseña por el propio usuario. Exige la actual: sin eso, una
 * sesión robada se convertiría en toma permanente de la cuenta.
 */
export async function cambiarPassword(
  usuarioId: string,
  actual: string,
  nueva: string,
  sesionActualId?: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
  });
  if (!usaPassword(usuario.rol)) {
    return { ok: false, motivo: "Esta cuenta no usa contraseña" };
  }
  if (!(await verificarPassword(actual, usuario.passwordHash))) {
    return { ok: false, motivo: "La contraseña actual no es correcta" };
  }
  const v = validarPassword(nueva);
  if (!v.valida) return { ok: false, motivo: v.motivo };

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      passwordHash: await hashPassword(nueva),
      debeCambiarPassword: false,
    },
  });

  // Se revocan las OTRAS sesiones: cambiar la contraseña tiene que expulsar a
  // quien la haya estado usando. La actual se conserva — expulsar también a
  // quien acaba de demostrar que sabe la contraseña vieja y eligió una nueva
  // no agrega seguridad y convierte el cambio obligatorio del primer acceso en
  // un rebote hasta la pantalla de login.
  await prisma.sesion.updateMany({
    where: {
      usuarioId,
      revocadaEn: null,
      ...(sesionActualId ? { id: { not: sesionActualId } } : {}),
    },
    data: { revocadaEn: new Date() },
  });

  return { ok: true };
}
