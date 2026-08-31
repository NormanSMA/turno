/**
 * Web Push (RFC 8030 / 8291).
 *
 * La Notification API solo avisa con la página cargada, y el caso real es el
 * contrario: se confirma el pedido, se guarda el teléfono y se camina. Además,
 * por ADR-18, el sondeo era dos tercios del cómputo del plan gratuito — push no
 * es una mejora de experiencia, es lo que hace que el despliegue quepa.
 *
 * Reutiliza la bandeja de salida del correo: un hecho genera una fila por
 * canal, y el UNIQUE (pedidoId, tipo, canal) impide duplicados. Pero la bandeja
 * sola no alcanza —un "está listo" diez minutos tarde es peor que no llegar—,
 * así que hay dos caminos:
 *
 *   1. `entregarPushDePedido`: intento inmediato tras confirmar la transacción.
 *   2. `vaciarBandejaPush`: red de seguridad del cron.
 *
 * El inmediato nunca puede hacer fallar a quien lo dispara: que el servicio de
 * push esté caído no puede impedir que la cocina marque un pedido.
 */

import webpush, { WebPushError } from "web-push";
import type { PrismaClient } from "@/generated/prisma/client";

/** Lo que viaja cifrado hasta el dispositivo. Lo lee `public/sw.js`. */
export interface CargaPush {
  titulo: string;
  cuerpo: string;
  /** A dónde lleva el toque. Ruta relativa: la abre el propio origen. */
  url: string;
  /**
   * Identidad del aviso. Dos entregas con el mismo `tag` se reemplazan en vez
   * de apilarse — nadie quiere cuatro notificaciones del mismo pedido.
   */
  tag: string;
}

export interface ResultadoPush {
  enviado: boolean;
  error?: string;
  /** true si reintentar tiene sentido (red, 5xx, límite del servicio). */
  reintentable?: boolean;
  /**
   * true si el dispositivo ya no existe (404/410). No es un fallo: es una
   * suscripción muerta —la aplicación se desinstaló, el navegador rotó el
   * endpoint— y hay que borrarla, no reintentarla.
   */
  caducada?: boolean;
}

// ------------------------------------------------------------ Configuración ---

/**
 * La clave pública es la MISMA variable que usa el navegador
 * (`NEXT_PUBLIC_...`), a propósito. Tenerla duplicada en dos variables permite
 * que se desincronicen, y el síntoma de eso es horrible de diagnosticar: las
 * suscripciones se crean bien y todos los envíos fallan con 403.
 */
export function clavePublica(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

export function pushConfigurado(): boolean {
  return Boolean(clavePublica() && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Se lee el entorno en cada llamada, no una vez al importar el módulo. En
 * serverless el módulo puede evaluarse antes de que las variables estén
 * disponibles, y una constante capturada en ese momento deja el push apagado
 * en toda la instancia sin ningún error visible.
 */
let vapidConfiguradoCon: string | null = null;

function prepararVapid(): void {
  const publica = clavePublica();
  if (vapidConfiguradoCon === publica) return;
  webpush.setVapidDetails(
    // El sujeto identifica a quién contactar si esta aplicación abusa del
    // servicio de push. Tiene que ser mailto: o https:.
    process.env.VAPID_SUBJECT ?? "mailto:turno@uamv.edu.ni",
    publica,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidConfiguradoCon = publica;
}

// ----------------------------------------------------------------- Envío ---

interface SuscripcionMinima {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envía a UN dispositivo. No toca la base: quien llama decide qué hacer. */
export async function enviarPush(
  sus: SuscripcionMinima,
  carga: CargaPush,
): Promise<ResultadoPush> {
  if (!pushConfigurado()) {
    // Sin claves no se envía nada y no es un error: es el modo por defecto en
    // desarrollo, igual que el controlador `consola` del correo.
    console.log(
      `[turno] push NO enviado (sin VAPID configurado): ${carga.titulo} — ${carga.cuerpo}`,
    );
    return { enviado: true };
  }

  try {
    prepararVapid();
    await webpush.sendNotification(
      {
        endpoint: sus.endpoint,
        keys: { p256dh: sus.p256dh, auth: sus.auth },
      },
      JSON.stringify(carga),
      // TTL corto a propósito: si el servicio de push no logró entregarlo en
      // diez minutos, el pedido ya se retiró o ya no importa. Un aviso viejo
      // que aparece a media tarde solo confunde.
      { TTL: 600, urgency: "high" },
    );
    return { enviado: true };
  } catch (e) {
    if (e instanceof WebPushError) {
      const s = e.statusCode;
      // 404: el endpoint nunca existió. 410 Gone: el navegador lo revocó.
      if (s === 404 || s === 410) {
        return { enviado: false, error: `${s} suscripción caducada`, caducada: true };
      }
      return {
        enviado: false,
        error: `${s} ${String(e.body ?? e.message).slice(0, 300)}`,
        // 429 y 5xx son del servicio y pasan; 400/403 son configuración
        // (clave VAPID equivocada) y reintentarlos solo gasta intentos.
        reintentable: s === 429 || s >= 500,
      };
    }
    return {
      enviado: false,
      error: e instanceof Error ? e.message : String(e),
      reintentable: true,
    };
  }
}

/**
 * Envía a TODOS los dispositivos de un usuario y limpia los muertos.
 *
 * Devuelve cuántos recibieron el aviso. Cero significa que el usuario no tiene
 * ningún dispositivo suscrito — que es lo normal para quien no instaló la
 * aplicación, y la razón por la que el correo sigue siendo el respaldo.
 */
export async function enviarPushAUsuario(
  prisma: PrismaClient,
  usuarioId: string,
  carga: CargaPush,
): Promise<{ entregados: number; caducadas: number; fallidos: number }> {
  const suscripciones = await prisma.suscripcionPush.findMany({
    where: { usuarioId },
  });

  let entregados = 0;
  let caducadas = 0;
  let fallidos = 0;

  for (const s of suscripciones) {
    const r = await enviarPush(s, carga);

    if (r.enviado) {
      entregados++;
      await prisma.suscripcionPush.update({
        where: { id: s.id },
        data: { ultimoEnvioEn: new Date(), fallos: 0 },
      });
      continue;
    }

    if (r.caducada) {
      caducadas++;
      // Borrado inmediato: conservar un endpoint muerto solo garantiza que
      // cada aviso futuro gaste una petición HTTP para volver a fallar.
      await prisma.suscripcionPush
        .delete({ where: { id: s.id } })
        .catch(() => undefined);
      continue;
    }

    fallidos++;
    const fallos = s.fallos + 1;
    if (fallos >= 5) {
      // Cinco fallos consecutivos sin ser un 410 explícito: el dispositivo no
      // vuelve. Se descarta para que la bandeja no lo arrastre para siempre.
      await prisma.suscripcionPush
        .delete({ where: { id: s.id } })
        .catch(() => undefined);
    } else {
      await prisma.suscripcionPush.update({
        where: { id: s.id },
        data: { fallos },
      });
    }
  }

  return { entregados, caducadas, fallidos };
}

// ------------------------------------------------------------ Composición ---

type FilaPush = {
  tipo: string;
  pedido: {
    id: string;
    codigo: string;
    usuarioId: string;
    franja: { fin: Date; comercio: { nombre: string } };
  } | null;
};

/**
 * Traduce una fila de la bandeja a lo que ve el usuario en la pantalla de
 * bloqueo. El código de retiro va en el CUERPO, no solo en la pantalla de
 * destino: mucha gente lee el aviso y no lo abre, y con el código a la vista ya
 * puede llegar al mostrador.
 */
export function componerPush(n: FilaPush): CargaPush | null {
  if (!n.pedido) return null;

  const comercio = n.pedido.franja.comercio.nombre;
  const codigo = n.pedido.codigo;
  const url = `/pedido/${n.pedido.id}`;

  if (n.tipo === "PEDIDO_LISTO") {
    return {
      titulo: "Tu pedido está listo",
      cuerpo: `${comercio} · mostrá el código ${codigo}`,
      url,
      tag: `turno-listo-${codigo}`,
    };
  }

  if (n.tipo === "PEDIDO_CONFIRMADO") {
    const hora = n.pedido.franja.fin.toLocaleTimeString("es-NI", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Managua",
    });
    return {
      titulo: `Tu turno en ${comercio}: ${hora}`,
      cuerpo: `Código ${codigo} · te avisamos cuando esté listo`,
      url,
      tag: `turno-confirmado-${codigo}`,
    };
  }

  // ENLACE_ACCESO no va por push: quien pide un enlace para entrar todavía no
  // tiene sesión, y por lo tanto tampoco tiene ningún dispositivo suscrito.
  return null;
}

const MAX_INTENTOS = 5;

const INCLUIR_PEDIDO = {
  pedido: {
    include: { franja: { include: { comercio: true } } },
  },
} as const;

/**
 * Marca una fila de la bandeja según el resultado del envío.
 *
 * `entregados === 0` sin error NO es un fallo: significa que el usuario no
 * tiene dispositivos suscritos. Se marca ENVIADA para que el cron no la
 * reintente eternamente; el correo ya cubre a esa persona.
 */
async function cerrarFila(
  prisma: PrismaClient,
  fila: { id: string; intentos: number },
  r: { entregados: number; fallidos: number },
): Promise<boolean> {
  if (r.fallidos === 0) {
    await prisma.notificacion.update({
      where: { id: fila.id },
      data: {
        estado: "ENVIADA",
        enviadaEn: new Date(),
        intentos: { increment: 1 },
        ultimoError: r.entregados === 0 ? "Sin dispositivos suscritos" : null,
      },
    });
    return true;
  }

  const intentos = fila.intentos + 1;
  await prisma.notificacion.update({
    where: { id: fila.id },
    data: {
      intentos,
      ultimoError: `${r.fallidos} dispositivo(s) fallaron`,
      estado: intentos >= MAX_INTENTOS ? "FALLIDA" : "PENDIENTE",
    },
  });
  return false;
}

/**
 * Sin fila = todo activado: nadie tiene que pasar por preferencias para que le
 * avisen. Se consulta en la ENTREGA y no al encolar — la preferencia apaga el
 * mensaje, nunca el registro del hecho.
 */
async function quiereRecibir(
  prisma: PrismaClient,
  usuarioId: string,
  tipo: string,
): Promise<boolean> {
  const p = await prisma.preferenciaAviso.findUnique({ where: { usuarioId } });
  if (!p) return true;
  if (tipo === "PEDIDO_LISTO") return p.listo;
  if (tipo === "PEDIDO_CONFIRMADO") return p.confirmacion;
  return true;
}

/**
 * ENVIADA y no FALLIDA: no falló nada. PENDIENTE la reintentaría para siempre;
 * FALLIDA ensuciaría las métricas con decisiones del usuario.
 */
async function omitirPorPreferencia(
  prisma: PrismaClient,
  id: string,
): Promise<void> {
  await prisma.notificacion.update({
    where: { id },
    data: { estado: "ENVIADA", ultimoError: "Omitida por preferencia del usuario" },
  });
}

/**
 * Intento inmediato para un pedido concreto.
 *
 * Se llama justo después de que la transacción confirma, desde la ruta que
 * cambió el estado. Nunca lanza: un fallo del servicio de push no puede
 * impedir que la cocina marque un pedido como listo.
 */
export async function entregarPushDePedido(
  prisma: PrismaClient,
  pedidoId: string,
  tipo: "PEDIDO_CONFIRMADO" | "PEDIDO_LISTO",
): Promise<{ entregados: number }> {
  try {
    const fila = await prisma.notificacion.findUnique({
      where: { pedidoId_tipo_canal: { pedidoId, tipo, canal: "PUSH" } },
      include: INCLUIR_PEDIDO,
    });
    // Ya entregada por otra vía, o nunca encolada: no hay nada que hacer y no
    // es un error. La idempotencia acá es lo que permite que el cron y esta
    // llamada convivan sin duplicar avisos.
    if (!fila || fila.estado !== "PENDIENTE") return { entregados: 0 };

    const carga = componerPush(fila);
    if (!carga) return { entregados: 0 };

    if (!(await quiereRecibir(prisma, fila.pedido!.usuarioId, fila.tipo))) {
      await omitirPorPreferencia(prisma, fila.id);
      return { entregados: 0 };
    }

    const r = await enviarPushAUsuario(prisma, fila.pedido!.usuarioId, carga);
    await cerrarFila(prisma, fila, r);
    return { entregados: r.entregados };
  } catch (e) {
    console.error("[turno] fallo en la entrega inmediata de push:", e);
    return { entregados: 0 };
  }
}

/**
 * Red de seguridad del cron: entrega lo que el intento inmediato no logró.
 *
 * Idempotente y seguro de correr en paralelo con otra ejecución, igual que
 * `vaciarBandeja` para el correo.
 */
export async function vaciarBandejaPush(
  prisma: PrismaClient,
  limite = 25,
): Promise<{ entregadas: number; fallidas: number; pendientes: number }> {
  const pendientes = await prisma.notificacion.findMany({
    where: { estado: "PENDIENTE", canal: "PUSH", intentos: { lt: MAX_INTENTOS } },
    orderBy: { creadaEn: "asc" },
    take: limite,
    include: INCLUIR_PEDIDO,
  });

  let entregadas = 0;
  let fallidas = 0;

  for (const n of pendientes) {
    const carga = componerPush(n);
    if (!carga || !n.pedido) {
      await prisma.notificacion.update({
        where: { id: n.id },
        data: { estado: "FALLIDA", ultimoError: "No se pudo componer el aviso" },
      });
      fallidas++;
      continue;
    }

    if (!(await quiereRecibir(prisma, n.pedido.usuarioId, n.tipo))) {
      await omitirPorPreferencia(prisma, n.id);
      continue;
    }

    const r = await enviarPushAUsuario(prisma, n.pedido.usuarioId, carga);
    if (await cerrarFila(prisma, n, r)) entregadas++;
    else fallidas++;
  }

  const restantes = await prisma.notificacion.count({
    where: { estado: "PENDIENTE", canal: "PUSH", intentos: { lt: MAX_INTENTOS } },
  });

  return { entregadas, fallidas, pendientes: restantes };
}
