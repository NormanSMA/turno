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

/** Envoltorio HTML mínimo. Sin imágenes ni CSS externo: los clientes de correo
 *  los bloquean y el mensaje tiene que leerse igual. */
function envolver(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f7fafa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#071316">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #dde9ea;border-radius:12px;padding:28px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>
<td style="width:34px;height:34px;background:#009ca6;border-radius:10px;color:#fff;font-size:18px;font-weight:800;text-align:center;line-height:34px;font-family:system-ui,sans-serif">T</td>
<td style="padding-left:10px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#60636b">TURNO · Campus UAM</td>
</tr></table>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.2">${titulo}</h1>
${cuerpo}
</div>
<p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#60636b">Recibís este correo porque usás TURNO en el campus de la UAM. No se procesan pagos en la plataforma.</p>
</body></html>`;
}

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
    html: envolver(
      "Entrá a TURNO",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Tocá el botón para entrar. No hace falta contraseña.</p>
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#009ca6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600">Entrar a TURNO</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#60636b">El enlace vence en 15 minutos y sirve una sola vez.</p>
<p style="margin:0;font-size:13px;color:#60636b">Si no lo pediste vos, ignorá este correo: nadie entró a tu cuenta.</p>`,
    ),
  };
}

export function correoPedidoConfirmado(
  para: string,
  datos: { codigo: string; hora: string; comercio: string; total: string },
): Correo {
  return {
    para,
    asunto: `Tu turno en ${datos.comercio}: ${datos.hora}`,
    texto: [
      `Reservaste tu pedido en ${datos.comercio}.`,
      `Hora de retiro: ${datos.hora}`,
      `Código: ${datos.codigo}`,
      `Total: ${datos.total} (se paga al retirar)`,
    ].join("\n"),
    html: envolver(
      `Listo a las ${datos.hora}`,
      `<p style="margin:0 0 16px;font-size:15px">Reservaste tu pedido en <strong>${datos.comercio}</strong>.</p>
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#60636b">Código de retiro</p>
<p style="margin:0 0 16px;font-family:ui-monospace,monospace;font-size:30px;font-weight:700;letter-spacing:.1em">${datos.codigo}</p>
<p style="margin:0;font-size:14px;color:#60636b">${datos.total} · se paga al retirar</p>`,
    ),
  };
}

export function correoPedidoListo(
  para: string,
  datos: { codigo: string; comercio: string },
): Correo {
  return {
    para,
    asunto: `Tu pedido ${datos.codigo} está listo`,
    texto: [
      `Tu pedido está listo en ${datos.comercio}.`,
      `Mostrá el código ${datos.codigo} en el mostrador.`,
    ].join("\n"),
    html: envolver(
      "Tu pedido está listo",
      `<p style="margin:0 0 16px;font-size:15px">Pasá a retirarlo en <strong>${datos.comercio}</strong>.</p>
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#60636b">Código de retiro</p>
<p style="margin:0;font-family:ui-monospace,monospace;font-size:30px;font-weight:700;letter-spacing:.1em">${datos.codigo}</p>`,
    ),
  };
}

// --------------------------------------------------- Vaciado de la bandeja ---

const MAX_INTENTOS = 5;

/**
 * Envía las notificaciones pendientes. Idempotente y seguro de correr en
 * paralelo con otra ejecución: cada fila se marca ENVIADA o FALLIDA, y el
 * UNIQUE (pedidoId, tipo) impide que se cree una segunda del mismo tipo.
 */
export async function vaciarBandeja(
  prisma: PrismaClient,
  limite = 25,
): Promise<{ enviadas: number; fallidas: number; pendientes: number }> {
  const pendientes = await prisma.notificacion.findMany({
    // `canal: CORREO` no es decorativo: desde el ADR-14 la misma tabla lleva
    // las entregas por push, y sin este filtro esta función intentaría
    // "enviar por correo" una fila destinada al teléfono.
    where: { estado: "PENDIENTE", canal: "CORREO", intentos: { lt: MAX_INTENTOS } },
    orderBy: { creadaEn: "asc" },
    take: limite,
    include: {
      pedido: {
        include: { franja: { include: { comercio: true } } },
      },
    },
  });

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

function componer(n: FilaNotificacion): Correo | null {
  if (n.tipo === "ENLACE_ACCESO") return null; // se envía en el momento
  if (!n.pedido) return null;

  const hora = n.pedido.franja.fin.toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Managua",
  });
  const comercio = n.pedido.franja.comercio.nombre;

  if (n.tipo === "PEDIDO_CONFIRMADO") {
    return correoPedidoConfirmado(n.destinatario, {
      codigo: n.pedido.codigo,
      hora,
      comercio,
      total: `C$ ${Number(n.pedido.total).toFixed(2)}`,
    });
  }
  if (n.tipo === "PEDIDO_LISTO") {
    return correoPedidoListo(n.destinatario, {
      codigo: n.pedido.codigo,
      comercio,
    });
  }
  return null;
}
