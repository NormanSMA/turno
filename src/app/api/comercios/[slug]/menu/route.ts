/** GET /api/comercios/:slug/menu — público, sin sesión (§11.3). */
import { menuDe } from "@/lib/catalogo";
import { fallo, manejarError, ok } from "@/lib/http";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const menu = await menuDe(slug);
    if (!menu) return fallo("NO_ENCONTRADO", "Comercio inexistente", 404);
    return ok(menu);
  } catch (e) {
    return manejarError(e);
  }
}
