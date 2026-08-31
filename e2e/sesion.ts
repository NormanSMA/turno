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
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
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

/** El mismo hash que producción: la sesión que se crea acá es una sesión real. */
function hash(t: string) {
  return createHash("sha256").update(t).digest("hex");
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

  const token = randomBytes(32).toString("base64url");
  await consultar(
    `INSERT INTO sesion (id, "usuarioId", "tokenHash", "expiraEn", "creadaEn")
     VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day', now())`,
    [usuario.id, hash(token)],
  );

  await ctx.addCookies([
    {
      name: "turno_sesion",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return usuario;
}
