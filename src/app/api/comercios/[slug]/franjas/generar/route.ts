/** POST /api/comercios/:slug/franjas/generar — abre franjas para un rango. */
import { exigirComercioPorSlug } from "@/lib/auth";
import { generarFranjasComercio } from "@/lib/comercio";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaGenerarFranjas } from "@/lib/esquemas";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const { sesion, comercio } = await exigirComercioPorSlug(slug);

    const datos = await cuerpo(req, esquemaGenerarFranjas);
    const r = await generarFranjasComercio(comercio.id, sesion.usuarioId, datos);
    // Se informa cuántas se crearon Y cuántos días se recorrieron: si el
    // operador regenera un rango ya existente, "0 creadas" no es un fallo.
    return ok(r);
  } catch (e) {
    return manejarError(e, req);
  }
}
