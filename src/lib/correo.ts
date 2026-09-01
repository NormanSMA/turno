/**
 * TURNO — Envío de correo.
 *
 * La creación del pedido NO puede depender de que el correo salga: eso metería
 * un servicio externo dentro de una transacción de base de datos, que es
 * imposible de hacer atómico. En su lugar, la transacción escribe en la tabla
 * `notificacion` y este módulo la vacía después. Consistencia eventual, con
 * reintento y sin duplicados gracias al UNIQUE (pedidoId, tipo).
 *
 * Tres controladores, en orden de precedencia:
 *
 *   - `smtp`    — cuenta de correo real con contraseña de aplicación. Es el
 *     camino corto para el piloto: al autenticarse COMO el buzón institucional,
 *     no hace falta verificar ningún dominio, que es justo el trámite que
 *     bloquea a un equipo que no es dueño de `uam.edu.ni`.
 *   - `resend`  — HTTP. Mejor para producción sostenida (entregabilidad,
 *     reintentos, métricas), pero exige un dominio propio verificado.
 *   - `consola` — imprime el correo en el log. Modo por defecto en desarrollo:
 *     permite probar el flujo completo sin proveedor ni credenciales.
 */

import nodemailer, { type Transporter } from "nodemailer";
import {
  aviso,
  boton,
  envolver,
  linea,
  parrafo,
  razones,
} from "./correo-plantilla";
import type { PrismaClient } from "@/generated/prisma/client";

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export interface ResultadoEnvio {
  enviado: boolean;
  error?: string;
  /** true si reintentar tiene sentido (fallo de red, 5xx, límite del proveedor) */
  reintentable?: boolean;
}

function remitente(): string {
  return process.env.CORREO_REMITENTE ?? "TURNO <onboarding@resend.dev>";
}

export function controladorActivo(): "smtp" | "resend" | "consola" {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return "smtp";
  }
  if (process.env.RESEND_API_KEY) return "resend";
  return "consola";
}

/** Transporte reutilizado entre envíos: abrir una conexión TLS por correo es
 *  lento y algunos proveedores lo penalizan como comportamiento anómalo. */
let transporte: Transporter | null = null;

function transporteSmtp(): Transporter {
  if (transporte) return transporte;
  const puerto = Number(process.env.SMTP_PORT ?? 465);
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    // 465 es TLS implícito; 587 arranca en claro y sube con STARTTLS.
    secure: puerto === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporte;
}

async function enviarPorSmtp(c: Correo): Promise<ResultadoEnvio> {
  try {
    await transporteSmtp().sendMail({
      // Con SMTP el remitente TIENE que ser la cuenta autenticada: la mayoría
      // de los proveedores reescribe o rechaza cualquier otra cosa.
      from: process.env.CORREO_REMITENTE ?? process.env.SMTP_USER!,
      to: c.para,
      subject: c.asunto,
      text: c.texto,
      html: c.html,
    });
    return { enviado: true };
  } catch (e) {
    const err = e as { responseCode?: number; message?: string };
    const codigo = err.responseCode ?? 0;
    return {
      enviado: false,
      error: `${codigo || "SMTP"} ${err.message ?? String(e)}`.slice(0, 400),
      // 4xx de SMTP es fallo temporal; 5xx es rechazo definitivo (credenciales
      // malas, destinatario inválido) y reintentarlo solo gasta intentos.
      reintentable: codigo === 0 || (codigo >= 400 && codigo < 500),
    };
  }
}

async function enviarPorResend(c: Correo): Promise<ResultadoEnvio> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: remitente(),
        to: [c.para],
        subject: c.asunto,
        text: c.texto,
        html: c.html,
      }),
    });

    if (res.ok) return { enviado: true };

    const detalle = await res.text();
    // 4xx es un problema de configuración (dominio sin verificar, destinatario
    // no permitido): reintentar no lo arregla y solo gasta cuota.
    return {
      enviado: false,
      error: `${res.status} ${detalle.slice(0, 300)}`,
      reintentable: res.status >= 500 || res.status === 429,
    };
  } catch (e) {
    return {
      enviado: false,
      error: e instanceof Error ? e.message : String(e),
      reintentable: true,
    };
  }
}

/**
 * Oculta los enlaces con token del texto que se va a registrar.
 *
 * El enlace mágico ES la credencial: quien lo lee entra como esa persona, sin
 * contraseña. Imprimirlo entero convierte el registro del servidor en un
 * llavero — y en Vercel los registros se guardan y los ve cualquiera con acceso
 * al panel.
 *
 * Se recorta el token y se deja el resto del enlace, que es lo que sirve para
 * depurar: que la URL base esté bien armada y que el destino sea el correcto.
 */
export function ocultarTokens(texto: string): string {
  return (
    texto
      // ?token=… o &t=… , hasta el siguiente espacio o &
      .replace(/([?&](?:token|t)=)[^\s&]+/gi, "$1[oculto]")
      // /acceso/<token> — largo y sin espacios
      .replace(/(\/(?:acceso|entrar|canjear)\/)[A-Za-z0-9._~-]{16,}/g, "$1[oculto]")
  );
}

function enviarPorConsola(c: Correo): ResultadoEnvio {
  /*
   * Este transporte es el de desarrollo, pero `controladorActivo()` cae acá
   * SIEMPRE que no haya SMTP ni Resend configurados — también en producción, y
   * `.env.example` los trae comentados por defecto. Un despliegue que se olvide
   * de las claves imprimiría cada enlace mágico entero en el registro.
   *
   * Por eso dos cosas: el texto va con los tokens ocultos, y en producción se
   * grita — llegar acá en producción significa que NADIE está recibiendo el
   * correo y el piloto está parado sin que salte ninguna alarma.
   */
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[turno] AVISO GRAVE: no hay transporte de correo configurado " +
        "(faltan SMTP_* o RESEND_API_KEY). Los enlaces de acceso NO se están " +
        "enviando a nadie. Configuralo antes de seguir.",
    );
  }

  console.log(
    [
      "",
      "──────── correo (modo consola) ────────",
      `Para:    ${c.para}`,
      `Asunto:  ${c.asunto}`,
      "",
      ocultarTokens(c.texto),
      "───────────────────────────────────────",
      "",
    ].join("\n"),
  );
  return { enviado: true };
}

/**
 * ¿Se le puede escribir a esta dirección desde este entorno?
 *
 * Existe por un accidente real: correr el cron sobre datos de demostración
 * envió veinte correos a direcciones de estudiantes inventadas del dominio de
 * la universidad. Rebotaron, y los rebotes contra un dominio real castigan la
 * reputación de la cuenta que envía — la misma que el piloto necesita para que
 * los enlaces mágicos lleguen.
 *
 * Regla: **fuera de producción solo se escribe a direcciones autorizadas.** Por
 * defecto, la propia cuenta remitente; `CORREO_PERMITIDOS` amplía la lista para
 * probar con el equipo. En producción no hay filtro, que es lo que corresponde.
 */
export function puedeEscribirA(destinatario: string): boolean {
  if (process.env.NODE_ENV === "production") return true;

  const permitidos = (process.env.CORREO_PERMITIDOS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const propia = process.env.SMTP_USER?.trim().toLowerCase();
  if (propia) permitidos.push(propia);

  // Sin cuenta ni lista configurada, el controlador es `consola` y no sale
  // nada de la máquina: no hace falta filtrar.
  if (permitidos.length === 0) return true;

  return permitidos.includes(destinatario.trim().toLowerCase());
}

export async function enviarCorreo(c: Correo): Promise<ResultadoEnvio> {
  if (!puedeEscribirA(c.para)) {
    console.log(
      `[turno] correo NO enviado a ${c.para}: fuera de producción solo se ` +
        `escribe a la cuenta remitente o a CORREO_PERMITIDOS.`,
    );
    // No es un fallo: es una decisión. Marcarlo como error llenaría la bandeja
    // de reintentos que nunca deberían ocurrir.
    return { enviado: true };
  }

  switch (controladorActivo()) {
    case "smtp":
      return enviarPorSmtp(c);
    case "resend":
      return enviarPorResend(c);
    default:
      return enviarPorConsola(c);
  }
}

/** Comprueba credenciales y conexión sin enviar nada. */
export async function verificarSmtp(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (controladorActivo() !== "smtp") {
    return { ok: false, error: "El controlador SMTP no está configurado" };
  }
  try {
    await transporteSmtp().verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------- Plantillas ---

function baseUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/**
 * El único correo que TURNO manda.
 *
 * Los avisos de pedido van por push (ADR-14): el correo queda para lo que no
 * puede ir por ahí, que es el enlace de acceso — hace falta ANTES de que exista
 * un navegador con permiso para notificar.
 *
 * Va con su versión en **texto plano** además del HTML. No es una formalidad:
 * hay quien lee el correo en un cliente que no muestra HTML, y los filtros de
 * spam puntúan peor un mensaje que solo trae la versión rica — y este correo,
 * de todos, es el que no se puede permitir caer en spam.
 */
export function correoEnlaceAcceso(para: string, token: string, volver?: string | null): Correo {
  const url = `${baseUrl()}/entrar?token=${encodeURIComponent(token)}${
    volver ? `&volver=${encodeURIComponent(volver)}` : ""
  }`;
  return {
    para,
    asunto: "Tu enlace para entrar a TURNO",
    texto: [
      "Tocá este enlace para entrar a TURNO:",
      url,
      "",
      "El enlace vence en 15 minutos y sirve una sola vez.",
      "Si no lo pediste vos, ignorá este correo: nadie entró a tu cuenta.",
    ].join("\n"),
    html: envolver({
      titulo: "Tu acceso está listo",
      cuerpo:
        parrafo(
          "Tocá el botón y quedás dentro. No hace falta contraseña ni recordar nada.",
        ) +
        boton(url, "Entrar a TURNO") +
        aviso(
          "El enlace <strong>vence en 15 minutos</strong> y sirve una sola vez. Si no lo pediste vos, ignorá este correo: nadie entró a tu cuenta.",
        ) +
        linea() +
        parrafo("Qué hacés con TURNO", true) +
        razones(),
      pie: "Recibís este correo porque alguien pidió un enlace de acceso con tu dirección. El pago de los pedidos se hace en el mostrador; TURNO no procesa pagos.",
    }),
  };
}

// --------------------------------------------------- Vaciado de la bandeja ---

const MAX_INTENTOS = 5;

/**
 * Envía las notificaciones pendientes. Idempotente y seguro de correr en
 * paralelo con otra ejecución: cada fila se marca ENVIADA o FALLIDA, y el
 * UNIQUE (pedidoId, tipo) impide que se cree una segunda del mismo tipo.
 */
/**
 * Reclama filas de la bandeja para esta ejecución, y solo para esta.
 *
 * **Por qué no basta con `SELECT … FOR UPDATE SKIP LOCKED`.** Un lock de
 * Postgres vive mientras vive su transacción. El envío es una llamada de red
 * que puede tardar segundos, y mantener una transacción abierta durante todo
 * ese rato ocupa una conexión por worker y convierte un problema de
 * duplicación en uno de agotamiento del pool. Por eso el reclamo se hace en un
 * único statement que **cambia el estado**: la exclusión sobrevive al commit,
 * que es justo lo que hace falta.
 *
 * `SKIP LOCKED` es lo que permite que dos ejecuciones se repartan el trabajo
 * en vez de que la segunda espere a la primera.
 *
 * También rescata las filas atascadas: si el proceso muere entre el reclamo y
 * la marca final, la fila queda en ENVIANDO y nadie la volvería a mirar. Pasado
 * `MINUTOS_RECLAMO_VENCIDO` vuelve a estar disponible.
 *
 * La garantía resultante es **al menos una vez**, no exactamente una: si un
 * worker envía y muere antes de marcar, el rescate reintentará. Exactamente-una
 * exigiría idempotencia del lado del proveedor, que no tenemos. Duplicar en ese
 * caso raro es preferible a perder el aviso, que es el fallo que de verdad le
 * importa al estudiante.
 */
async function reclamar(
  prisma: PrismaClient,
  limite: number,
): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE notificacion
       SET estado = 'ENVIANDO', "reclamadaEn" = now()
     WHERE id IN (
       SELECT id FROM notificacion
        WHERE canal = 'CORREO'
          AND intentos < ${MAX_INTENTOS}
          AND (
            estado = 'PENDIENTE'
            OR (
              estado = 'ENVIANDO'
              AND "reclamadaEn" < now() - make_interval(mins => ${MINUTOS_RECLAMO_VENCIDO})
            )
          )
        ORDER BY "creadaEn" ASC
        LIMIT ${limite}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id
  `;
  return filas.map((f) => f.id);
}

/**
 * Cuántos minutos se le dan a una ejecución para resolver lo que reclamó.
 *
 * Corto de más, dos workers se pisan igual; largo de más, un aviso perdido
 * tarda demasiado en reintentarse. Diez minutos es más que cualquier envío
 * razonable y menos que el intervalo con el que a alguien le importa el aviso.
 */
const MINUTOS_RECLAMO_VENCIDO = 10;

export async function vaciarBandeja(
  prisma: PrismaClient,
  limite = 25,
): Promise<{ enviadas: number; fallidas: number; pendientes: number }> {
  // El reclamo va primero y en un solo statement: sacarlas de PENDIENTE es lo
  // que impide que otra ejecución simultánea las tome también. Leer y después
  // marcar —que es lo que se hacía— deja una ventana en la que las dos leen lo
  // mismo y el estudiante recibe el aviso por duplicado.
  //
  // `canal: CORREO` no es decorativo: desde el ADR-14 la misma tabla lleva las
  // entregas por push, y sin ese filtro esta función intentaría "enviar por
  // correo" una fila destinada al teléfono.
  const reclamadas = await reclamar(prisma, limite);

  const pendientes = reclamadas.length
    ? await prisma.notificacion.findMany({
        where: { id: { in: reclamadas } },
        orderBy: { creadaEn: "asc" },
        include: {
          pedido: {
            include: { franja: { include: { comercio: true } } },
          },
        },
      })
    : [];

  let enviadas = 0;
  let fallidas = 0;

  for (const n of pendientes) {
    const correo = componer(n);
    if (!correo) {
      // Sin datos para componerla (por ejemplo el enlace mágico, que se envía
      // en el momento porque el token en claro no se persiste nunca).
      await prisma.notificacion.update({
        where: { id: n.id },
        data: {
          estado: "FALLIDA",
          ultimoError: "No hay datos suficientes para componer el correo",
        },
      });
      fallidas++;
      continue;
    }

    const r = await enviarCorreo(correo);
    if (r.enviado) {
      await prisma.notificacion.update({
        where: { id: n.id },
        data: { estado: "ENVIADA", enviadaEn: new Date(), intentos: { increment: 1 } },
      });
      enviadas++;
    } else {
      const intentos = n.intentos + 1;
      const agotado = !r.reintentable || intentos >= MAX_INTENTOS;
      await prisma.notificacion.update({
        where: { id: n.id },
        data: {
          intentos,
          ultimoError: r.error?.slice(0, 500),
          // Un fallo de configuración se marca FALLIDA de una: reintentarlo
          // cinco veces solo llena el log con el mismo error.
          estado: agotado ? "FALLIDA" : "PENDIENTE",
        },
      });
      fallidas++;
    }
  }

  const restantes = await prisma.notificacion.count({
    where: { estado: "PENDIENTE", canal: "CORREO", intentos: { lt: MAX_INTENTOS } },
  });

  return { enviadas, fallidas, pendientes: restantes };
}

type FilaNotificacion = {
  tipo: string;
  destinatario: string;
  pedido: {
    codigo: string;
    total: unknown;
    franja: { fin: Date; comercio: { nombre: string } };
  } | null;
};

/**
 * Qué correo corresponde a una fila de la bandeja.
 *
 * Hoy: **ninguna**. El enlace de acceso se envía en el momento —el token en
 * claro no se persiste nunca, así que no puede reconstruirse después— y los
 * avisos de pedido salen por push.
 *
 * La función se conserva porque la bandeja sigue existiendo para el canal de
 * correo y porque el día que haya un correo diferido (un resumen, un aviso de
 * vencimiento) este es su lugar. Devolver `null` hace que la fila se marque
 * como atendida sin intentar un envío que no tiene contenido.
 */
function componer(n: FilaNotificacion): Correo | null {
  void n;
  return null;
}

