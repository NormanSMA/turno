/**
 * TURNO — Utilidades HTTP compartidas por las rutas de API.
 *
 * Objetivo: que cada `route.ts` contenga la política del endpoint y nada más —
 * ni parseo, ni traducción de errores, ni formato de respuesta. Cuando eso se
 * repite en cada archivo, tarde o temprano uno de ellos filtra un stack trace o
 * responde 500 donde debía responder 403.
 */

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { NoAutenticado, NoAutorizado } from "./auth";
import { TransicionInvalida } from "@/core/estados";
import { CancelacionNoPermitida } from "@/core/ciclo-vida";
import { consumirLimite, type AccionLimitada } from "@/core/limites";
import { CambioRechazado } from "./comercio";
import { prisma } from "./db";

export interface ErrorApi {
  error: string;
  codigo: string;
  detalle?: unknown;
}

export function ok<T>(datos: T, status = 200) {
  return NextResponse.json(datos, { status });
}

/**
 * Respuesta con validador de frescura (ADR-14).
 *
 * El sondeo que queda —el de la pestaña visible— pide el mismo pedido cada diez
 * segundos y casi siempre recibe exactamente lo mismo. Con un validador, la
 * ruta puede cortar ANTES de armar la consulta pesada (items, eventos, franja,
 * comercio), que es donde está el gasto de CPU que el ADR-18 midió.
 *
 * Quien manda el `If-None-Match` es el service worker, no el navegador: la API
 * va con `Cache-Control: no-store` (ver `next.config.ts`), así que el navegador
 * no revalida por su cuenta. Los dos lados tienen que existir.
 */
export function okConEtag<T>(datos: T, etag: string) {
  return NextResponse.json(datos, { status: 200, headers: { ETag: etag } });
}

/** Cabecera con la que el worker reconoce "no cambió nada". */
export const CABECERA_SIN_CAMBIOS = "X-Turno-Sin-Cambios";

/**
 * "No cambió nada": el equivalente semántico de un 304, no un 304 real.
 *
 * En Next 16.3.2 un `NextResponse` con estado 304 desde un Route Handler no
 * llega al cliente — el framework lo reemplaza por un 200 con cuerpo completo.
 * Verificado en producción: el handler construye el 304 y el navegador registra
 * un 200 de 783 bytes.
 *
 * Como los dos extremos son nuestros (esta ruta y `public/sw.js`) se responde
 * 200 con cuerpo mínimo y una cabecera que el worker entiende. El ahorro se
 * conserva: la consulta pesada igual no se ejecuta.
 */
export function sinCambios(etag: string) {
  return NextResponse.json(
    { sinCambios: true },
    { status: 200, headers: { ETag: etag, [CABECERA_SIN_CAMBIOS]: "1" } },
  );
}

/** ¿El cliente ya tiene esta versión? Compara con la lista de `If-None-Match`. */
export function coincideEtag(req: Request, etag: string): boolean {
  const enviado = req.headers.get("if-none-match");
  if (!enviado) return false;
  return enviado
    .split(",")
    .map((s) => s.trim())
    .includes(etag);
}

export function fallo(
  codigo: string,
  mensaje: string,
  status: number,
  detalle?: unknown,
) {
  return NextResponse.json<ErrorApi>(
    { error: mensaje, codigo, detalle },
    { status },
  );
}

/**
 * Traduce excepciones del dominio a respuestas HTTP.
 *
 * Cualquier error no previsto sale como 500 genérico: el mensaje interno se
 * registra en el servidor pero NO se devuelve al cliente, porque un stack trace
 * en la respuesta es información gratis para quien esté sondeando.
 */
export function manejarError(e: unknown) {
  if (e instanceof ZodError) {
    return fallo("DATOS_INVALIDOS", "La solicitud no es válida", 422, e.issues);
  }
  if (e instanceof NoAutenticado) {
    return fallo("NO_AUTENTICADO", e.message, 401);
  }
  if (e instanceof NoAutorizado) {
    return fallo("NO_AUTORIZADO", e.message, 403);
  }
  if (e instanceof TransicionInvalida) {
    return fallo("TRANSICION_INVALIDA", e.message, 409);
  }
  if (e instanceof CancelacionNoPermitida) {
    return fallo("CANCELACION_NO_PERMITIDA", e.message, 409);
  }
  if (e instanceof CambioRechazado) {
    // 422 y no 400: la solicitud está bien formada, pero aplicarla dejaría el
    // sistema en un estado que el modelo declara imposible.
    return fallo("CAMBIO_RECHAZADO", e.message, 422, e.violaciones);
  }
  console.error("[turno] error no controlado:", e);
  return fallo("ERROR_INTERNO", "Ocurrió un error inesperado", 500);
}

/** Parsea y valida el cuerpo. El cliente nunca decide precios ni cargas. */
export async function cuerpo<T>(req: Request, esquema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ZodError([
      { code: "custom", path: [], message: "Cuerpo JSON inválido" },
    ]);
  }
  return esquema.parse(json);
}

/**
 * Identificador de cliente para el rate limiting. Detrás de un proxy, la IP
 * real viene en `x-forwarded-for`; se toma el primer salto, que es el único que
 * el proxio de confianza escribe.
 */
export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
}

/** Aplica un límite y devuelve 429 con `Retry-After` si se excedió. */
export async function exigirLimite(
  accion: AccionLimitada,
  identificador: string,
) {
  const r = await consumirLimite(prisma, accion, identificador);
  if (r.permitido) return null;
  const segundos = Math.max(
    1,
    Math.ceil((r.reiniciaEn.getTime() - Date.now()) / 1000),
  );
  return NextResponse.json<ErrorApi>(
    {
      error: "Demasiadas solicitudes. Intentá de nuevo en un momento.",
      codigo: "LIMITE_EXCEDIDO",
    },
    { status: 429, headers: { "Retry-After": String(segundos) } },
  );
}
