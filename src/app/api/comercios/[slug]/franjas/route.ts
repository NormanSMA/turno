/**
 * POST /api/comercios/:slug/franjas — franjas ofrecidas para un carrito.
 *
 * Es POST y no GET porque la respuesta depende del carrito completo: la carga
 * w(i) determina qué franjas caben. Meter el carrito en la query string sería
 * frágil y además expondría el pedido en los logs del proxy.
 */
import { franjasPara } from "@/lib/catalogo";
import { sesionActual } from "@/lib/auth";
import { cuerpo, fallo, manejarError, ok } from "@/lib/http";
import { z } from "zod";

const esquema = z.object({
  items: z
    .array(
      z.object({
        productoId: z.uuid(),
        cantidad: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(15),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const { items } = await cuerpo(req, esquema);

    // La condición sale de la sesión (servidor), nunca del cliente. Sin sesión
    // se muestra la variante A: no se orienta la elección de un anónimo.
    const sesion = await sesionActual();
    const condicion = sesion?.condicionExperimental ?? "A";

    const r = await franjasPara({ slug, items, condicion });
    if (!r) return fallo("NO_ENCONTRADO", "Comercio inexistente", 404);
    return ok(r);
  } catch (e) {
    return manejarError(e);
  }
}
