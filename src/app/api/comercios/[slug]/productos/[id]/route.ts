/** PATCH /api/comercios/:slug/productos/:id — edición de producto. */
import { exigirComercioPorSlug } from "@/lib/auth";
import { actualizarProducto } from "@/lib/comercio";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaProductoCambio } from "@/lib/esquemas";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await ctx.params;
    const { sesion, comercio } = await exigirComercioPorSlug(slug);

    const datos = await cuerpo(req, esquemaProductoCambio);
    const p = await actualizarProducto(comercio.id, id, sesion.usuarioId, datos);
    return ok({
      id: p.id,
      nombre: p.nombre,
      disponible: p.disponible,
      anticipable: p.anticipable,
      archivado: p.archivado,
    });
  } catch (e) {
    return manejarError(e);
  }
}
