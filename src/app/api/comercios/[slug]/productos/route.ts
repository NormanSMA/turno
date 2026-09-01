/** POST /api/comercios/:slug/productos — alta de producto. */
import { exigirComercioPorSlug } from "@/lib/auth";
import { crearProducto } from "@/lib/comercio";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaProductoNuevo } from "@/lib/esquemas";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const { sesion, comercio } = await exigirComercioPorSlug(slug);

    const datos = await cuerpo(req, esquemaProductoNuevo);
    const p = await crearProducto(comercio.id, sesion.usuarioId, datos);
    return ok({ id: p.id, nombre: p.nombre }, 201);
  } catch (e) {
    return manejarError(e, req);
  }
}
