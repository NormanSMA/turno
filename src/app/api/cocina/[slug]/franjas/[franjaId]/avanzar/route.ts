/**
 * POST /api/cocina/:slug/franjas/:franjaId/avanzar — la cocina avanza de una
 * vez todos los pedidos de una franja al siguiente estado.
 *
 * Solo el COMERCIO de ese slug. Cada pedido pasa por `cambiarEstado`, así que
 * no hay saltos de estado: un pedido que ya cambió se cuenta como omitido.
 */
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol, NoAutorizado } from "@/lib/auth";
import { puedeVerCocina } from "@/core/autorizacion";
import { cuerpo, fallo, manejarError, ok } from "@/lib/http";
import { esquemaAvanceFranja } from "@/lib/esquemas";
import { avanzarFranja } from "@/lib/lote-franja";
import { entregarPushDePedido } from "@/lib/push";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string; franjaId: string }> },
) {
  try {
    const { slug, franjaId } = await ctx.params;
    const sesion = await exigirRol("COMERCIO");
    const { hacia } = await cuerpo(req, esquemaAvanceFranja);
    const id = z.string().uuid().parse(franjaId);

    const comercio = await prisma.comercio.findUnique({ where: { slug } });
    if (!comercio) return fallo("NO_ENCONTRADO", "Comercio inexistente", 404);
    if (!puedeVerCocina(sesion, comercio.id)) {
      throw new NoAutorizado("Esta cuenta no opera este comercio");
    }

    const r = await avanzarFranja(prisma, {
      franjaId: id,
      comercioId: comercio.id,
      hacia,
      actorId: sesion.usuarioId,
    });

    // Igual que en la ruta de estado: el aviso sale con la transacción ya
    // confirmada y `entregarPushDePedido` nunca lanza.
    if (hacia === "LISTO") {
      for (const pedidoId of r.avanzados) {
        after(() => entregarPushDePedido(prisma, pedidoId, "PEDIDO_LISTO"));
      }
    }

    return ok({ avanzados: r.avanzados.length, omitidos: r.omitidos.length });
  } catch (e) {
    return manejarError(e, req);
  }
}
