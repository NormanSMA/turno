/**
 * Sesiones reales para las pruebas de handler.
 *
 * No se falsea la sesión: se crea con el mismo motor que usa producción
 * (`crearSesionParaPrueba`, de la fachada) y se pone la cookie firmada. Así lo
 * que se prueba es el camino completo —cookie → firma → fila → vigencia →
 * rol—, que es justamente el que `core/autorizacion.ts` no cubre porque ya
 * recibe la sesión resuelta.
 */

import { COOKIE_SESION, crearSesionParaPrueba } from "@/lib/auth";
import type { PrismaClient } from "@/generated/prisma/client";
import { limpiarCookies, ponerCookie } from "./cookies";

/** Crea una sesión vigente y la deja puesta como la del llamador. */
export async function entrarComo(
  prisma: PrismaClient,
  usuarioId: string,
  opts: { expiraEn?: Date; revocadaEn?: Date | null } = {},
): Promise<string> {
  const { token } = await crearSesionParaPrueba(usuarioId, {
    expiraEn: opts.expiraEn,
  });
  // Una sesión revocada es una fila que ya no existe.
  if (opts.revocadaEn) {
    await prisma.session.deleteMany({ where: { userId: usuarioId } });
  }
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
