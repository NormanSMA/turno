/**
 * Sesión de estudiante y consultas de apoyo para el E2E.
 *
 * No se pasa por el enlace mágico a propósito: eso probaría el buzón, no la
 * aplicación, y ataría la suite a un servidor SMTP. El flujo de acceso tiene su
 * propia cobertura en `tests/api-sesion.test.ts`, que sí lo recorre entero.
 *
 * Se usa `pg` y no el cliente de Prisma porque el cliente generado es ESM y el
 * cargador de Playwright no lo resuelve. Da igual para lo que hace falta acá
 * —leer un usuario, insertar una fila de sesión— y de paso deja el E2E
 * independiente del ORM: si mañana se cambia, esta suite no se entera.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createHmac, randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";

const CADENA =
  process.env.DATABASE_URL ??
  "postgresql://turno:turno@localhost:55432/turno?schema=public";

/** Abre, consulta y cierra. Las pruebas no comparten conexión. */
export async function consultar<T = Record<string, unknown>>(
  sql: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const c = new Client({ connectionString: CADENA });
  await c.connect();
  try {
    const r = await c.query(sql, valores);
    return r.rows as T[];
  } finally {
    await c.end();
  }
}

/**
 * Better Auth guarda el token tal cual y la cookie lleva `token.firma`, con la
 * firma HMAC-SHA256 en base64 sobre el secreto de la aplicación (ADR-24). La
 * sesión que se crea acá es una sesión real, no un doble.
 */
function cookieFirmada(token: string) {
  // Se lee de `.env` sin cargarlo en el entorno: cargarlo pisaría `APP_URL`,
  // que `playwright.config.ts` usa para decidir a qué servidor apuntar.
  let secreto = process.env.BETTER_AUTH_SECRET;
  if (!secreto) {
    try {
      const linea = readFileSync(".env", "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith("BETTER_AUTH_SECRET="));
      secreto = linea?.slice("BETTER_AUTH_SECRET=".length).replace(/^"|"$/g, "");
    } catch {
      /* se informa abajo */
    }
  }
  if (!secreto) throw new Error("Falta BETTER_AUTH_SECRET para firmar la cookie");
  const firma = createHmac("sha256", secreto).update(token).digest("base64");
  return encodeURIComponent(`${token}.${firma}`);
}

export async function entrar(
  ctx: BrowserContext,
  correo: string,
): Promise<{ id: string; correo: string }> {
  const [usuario] = await consultar<{ id: string; correo: string }>(
    `SELECT id, correo FROM usuario WHERE correo = $1`,
    [correo],
  );
  if (!usuario) throw new Error(`No existe el usuario ${correo} en la base demo`);

  const token = randomBytes(24).toString("base64url");
  await consultar(
    `INSERT INTO session (id, token, "expiresAt", "userId", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, now() + interval '1 day', $2, now(), now())`,
    [token, usuario.id],
  );

  await ctx.addCookies([
    {
      name: "turno_sesion",
      value: cookieFirmada(token),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return usuario;
}
