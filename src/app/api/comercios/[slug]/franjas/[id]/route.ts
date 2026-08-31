/** PATCH /api/comercios/:slug/franjas/:id — capacidad o apertura de una franja. */
import { exigirComercioPorSlug } from "@/lib/auth";
import { actualizarFranja } from "@/lib/comercio";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaFranjaCambio } from "@/lib/esquemas";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await ctx.params;
    const { sesion, comercio } = await exigirComercioPorSlug(slug);

    const datos = await cuerpo(req, esquemaFranjaCambio);
    const f = await actualizarFranja(comercio.id, id, sesion.usuarioId, datos);
    return ok({
      id: f.id,
      capacidadMinutos: f.capacidadMinutos,
      abierta: f.abierta,
    });
  } catch (e) {
    return manejarError(e);
  }
}
