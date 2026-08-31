/**
 * GET /api/salud — comprobación de vida.
 *
 * Existe por el riesgo 8 de §17 (caída de infraestructura durante el piloto):
 * si el sistema se cae un martes al mediodía y nadie se entera hasta el jueves,
 * se pierden dos días de datos irrecuperables.
 *
 * Comprueba la base de verdad, con una consulta real. Un endpoint que devuelve
 * "ok" sin tocar nada da tranquilidad falsa: el proceso puede estar vivo y la
 * base inalcanzable, que es justamente el modo de fallo que importa.
 *
 * No requiere sesión —un monitor externo no la tiene— pero tampoco revela nada:
 * ni versiones, ni cadenas de conexión, ni conteos que sirvan para inferir el
 * tamaño de la cohorte.
 */
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { estado: "ok", baseMs: Math.round(performance.now() - t0) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    // Sin detalle del error: un mensaje de PostgreSQL puede incluir el host y
    // el nombre de la base.
    return Response.json(
      { estado: "degradado", baseMs: Math.round(performance.now() - t0) },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
