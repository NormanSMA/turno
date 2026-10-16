/**
 * TURNO — Sesión y autorización, resueltas SIEMPRE en el servidor.
 *
 * Ocultar un botón en React no es autorización: el usuario puede llamar la API
 * directamente. Todo endpoint protegido pasa por `exigirSesion` / `exigirRol`,
 * y toda lectura de un pedido pasa por `puedeVerPedido` — que es la defensa
 * contra IDOR (cambiar el id en la URL para leer el pedido de otro).
 *
 * Esta es la FACHADA (ADR-24): los 27 archivos que autentican importan solo
 * de acá. El motor de sesiones y el acceso con Google son Better Auth
 * (`auth-motor.ts`); las reglas de TURNO —quién puede entrar y por cuál
 * método— siguen en este archivo.
 */

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { auth, COOKIE_SESION } from "./auth-motor";
import {
  asignarCondicion,
  CONDICION_VIGENTE,
  esCorreoInstitucional,
  evaluarToken,
  expiracionEnlace,
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

export { COOKIE_SESION };

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

// ------------------------------------------------------------------ Cookie ---

/**
 * Valor de la cookie para un token de sesión: `token.firma`, con la firma
 * HMAC-SHA256 en base64 que Better Auth verifica. Devuelve el valor SIN
 * codificar; quien lo ponga en una respuesta de Next lo codifica ahí.
 */
async function valorCookie(token: string): Promise<string> {
  const { secret } = await auth.$context;
  const firma = createHmac("sha256", secret).update(token).digest("base64");
  return `${token}.${firma}`;
}

/** Cabeceras con solo la cookie de sesión, que es lo que Better Auth necesita. */
async function cabecerasDeSesion(): Promise<Headers | null> {
  const almacen = await cookies();
  const bruto = almacen.get(COOKIE_SESION)?.value;
  if (!bruto) return null;
  let valor = bruto;
  if (valor.includes("%")) {
    try {
      valor = decodeURIComponent(valor);
    } catch {
      return null;
    }
  }
  return new Headers({ cookie: `${COOKIE_SESION}=${encodeURIComponent(valor)}` });
}

/** Crea la sesión en Better Auth y devuelve lo que el llamador pone en la cookie. */
async function abrirSesion(
  usuarioId: string,
  userAgent?: string | null,
): Promise<{ token: string; expiraEn: Date }> {
  const ctx = await auth.$context;
  const sesion = await ctx.internalAdapter.createSession(usuarioId, false, {
    userAgent: userAgent ?? "",
  });
  return { token: await valorCookie(sesion.token), expiraEn: sesion.expiresAt };
}

/**
 * Sesión para pruebas y para `scripts/sesion-dev.ts`. Se niega en producción:
 * saltarse el enlace mágico solo tiene sentido con datos de mentira.
 */
export async function crearSesionParaPrueba(
  usuarioId: string,
  opciones: { expiraEn?: Date } = {},
): Promise<{ token: string; expiraEn: Date }> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("crearSesionParaPrueba no existe en producción");
  }
  const ctx = await auth.$context;
  const sesion = await ctx.internalAdapter.createSession(usuarioId, false);
  // `createSession` ignora un `expiresAt` impuesto: se fija después.
  if (opciones.expiraEn) {
    await prisma.session.update({
      where: { id: sesion.id },
      data: { expiresAt: opciones.expiraEn },
    });
  }
  return {
    token: await valorCookie(sesion.token),
    expiraEn: opciones.expiraEn ?? sesion.expiresAt,
  };
}

/** Lee la sesión del request. Devuelve null si no hay o si ya no vale. */
export async function sesionActual(): Promise<SesionActiva | null> {
  const headers = await cabecerasDeSesion();
  if (!headers) return null;

  const datos = await auth.api.getSession({ headers });
  if (!datos) return null;

  const { session, user } = datos;
  const extra = user as typeof user & {
    rol?: RolUsuario;
    comercioId?: string | null;
    condicionExperimental?: "A" | "B";
  };
  if (!extra.rol || !extra.condicionExperimental) return null;

  /*
   * Se trae también el slug del comercio, no solo su id.
   *
   * El id no sirve para construir una dirección, así que cada pantalla que
   * necesitaba enlazar a "mi cocina" lo resolvía por su cuenta — y una lo
   * hacía tomando el PRIMER comercio de la lista, que para un operador de
   * Subway apuntaba a otro local. Con el slug en la sesión hay una sola
   * respuesta a "cuál es mi comercio", y es la del servidor.
   */
  const comercio = extra.comercioId
    ? await prisma.comercio.findUnique({
        where: { id: extra.comercioId },
        select: { slug: true },
      })
    : null;

  return {
    sesionId: session.id,
    usuarioId: user.id,
    correo: user.email,
    nombre: user.name || null,
    rol: extra.rol,
    comercioId: extra.comercioId ?? null,
    comercioSlug: comercio?.slug ?? null,
    // Experimento apagado (ADR-27): también los usuarios que quedaron en A
    // operan como B. La columna guarda su asignación original.
    condicionExperimental: CONDICION_VIGENTE,
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
  const existente = await prisma.usuario.findUnique({ where: { correo } });

  // Un correo ajeno al dominio entra solo si el equipo creó antes su cuenta
  // demo (reclutadores, ADR-24). No se registra a nadie por su cuenta.
  if (!esCorreoInstitucional(correo) && !existente?.esDemo) {
    throw new NoAutorizado("Se requiere un correo institucional de la UAM");
  }

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
 * Canjea el enlace mágico por una sesión. El token se marca usado con un
 * bloqueo de fila: dos clics sobre el mismo enlace no producen dos sesiones,
 * porque el segundo ve el token ya usado.
 */
export async function canjearEnlace(
  token: string,
  userAgent?: string | null,
): Promise<
  | { ok: true; token: string; expiraEn: Date; usuarioId: string }
  | { ok: false; motivo: MotivoCanjeFallido }
> {
  const hash = hashToken(token);

  const canje = await prisma.$transaction(async (tx) => {
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
    // Abrir el enlace prueba que la persona controla el buzón.
    await tx.usuario.update({
      where: { id: registro.usuarioId },
      data: { emailVerified: true },
    });
    return { ok: true as const, usuarioId: registro.usuarioId };
  });

  if (!canje.ok) return canje;

  const sesion = await abrirSesion(canje.usuarioId, userAgent);
  return { ok: true, usuarioId: canje.usuarioId, ...sesion };
}

export async function cerrarSesion(sesionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sesionId } });
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
  | {
      ok: true;
      token: string;
      expiraEn: Date;
      rol: RolUsuario;
      /** Slug del comercio que opera. `null` para el administrador. */
      comercioSlug: string | null;
      debeCambiarPassword: boolean;
    }
  | { ok: false; motivo: MotivoAccesoFallido }
> {
  const correo = normalizarCorreo(correoBruto);
  /*
   * Se trae el comercio junto al usuario, no en una consulta aparte: quien
   * acaba de entrar necesita saber a qué cocina va, y pedirlo después es un
   * viaje más en el momento en que la persona está esperando.
   */
  const usuario = await prisma.usuario.findUnique({
    where: { correo },
    include: { comercio: { select: { slug: true } } },
  });

  // Hash señuelo: se verifica siempre, exista o no la cuenta, para que el
  // tiempo de respuesta no revele qué correos están registrados.
  const hash =
    usuario && usaPassword(usuario.rol) ? usuario.passwordHash : SENUELO;

  const coincide = await verificarPassword(password, hash);

  if (!usuario || !usaPassword(usuario.rol) || !usuario.passwordHash || !coincide) {
    return { ok: false as const, motivo: "CREDENCIALES_INVALIDAS" };
  }

  const sesion = await abrirSesion(usuario.id, userAgent);
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAccesoEn: new Date() },
  });

  return {
    ok: true as const,
    ...sesion,
    rol: usuario.rol,
    comercioSlug: usuario.comercio?.slug ?? null,
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
  await prisma.session.deleteMany({
    where: {
      userId: usuarioId,
      ...(sesionActualId ? { id: { not: sesionActualId } } : {}),
    },
  });

  return { ok: true };
}
