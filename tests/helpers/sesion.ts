/**
 * Sesiones reales para las pruebas de handler.
 *
 * No se falsea la sesión: se inserta la fila en `sesion` con el mismo hash que
 * usa producción y se pone la cookie con el token en claro. Así lo que se prueba
 * es el camino completo —cookie → hash → fila → vigencia → rol—, que es
 * justamente el que `core/autorizacion.ts` no cubre porque ya recibe la sesión
 * resuelta.
 */

import { generarToken, hashToken } from "@/core/identidad";
import { COOKIE_SESION } from "@/lib/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { limpiarCookies, ponerCookie } from "./cookies";

/** Crea una sesión vigente y la deja puesta como la del llamador. */
export async function entrarComo(
  prisma: PrismaClient,
  usuarioId: string,
  opts: { expiraEn?: Date; revocadaEn?: Date | null } = {},
): Promise<string> {
  const token = generarToken();
  await prisma.sesion.create({
    data: {
      usuarioId,
      tokenHash: hashToken(token),
      expiraEn: opts.expiraEn ?? new Date(Date.now() + 86_400_000),
      revocadaEn: opts.revocadaEn ?? null,
    },
  });
  limpiarCookies();
  ponerCookie(COOKIE_SESION, token);
  return token;
}

/** Petición anónima. */
export function salir() {
  limpiarCookies();
}

/** Usuario de operación (COMERCIO o ADMIN) listo para entrar. */
export async function crearOperador(
  prisma: PrismaClient,
  rol: "COMERCIO" | "ADMIN",
  comercioId: string | null,
) {
  return prisma.usuario.create({
    data: {
      correo: `op.${rol.toLowerCase()}.${crypto.randomUUID()}@uamv.edu.ni`,
      rol,
      comercioId,
      condicionExperimental: "A",
      // Hash inerte: estas pruebas entran por sesión, no por contraseña. Lo que
      // se verifica acá es la autorización, no el acceso.
      passwordHash: "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA",
    },
  });
}

/** Petición JSON hacia un handler, con las cabeceras que el handler mira. */
export function peticion(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Request {
  return new Request(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Contexto de ruta dinámica: Next 16 los entrega como promesa. */
export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}
