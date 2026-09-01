/**
 * PATCH /api/pedidos/:id/estado — única puerta de cambio de estado.
 *
 * La autorización es por ACCIÓN, no solo por pertenencia: el dueño del pedido
 * puede cancelarlo, pero no puede marcarlo LISTO — eso sería declarar cumplida
 * la promesa que el sistema está midiendo.
 */
import { prisma } from "@/lib/db";
import { exigirAccesoPedido, NoAutorizado } from "@/lib/auth";
import { cambiarEstado, type Actor } from "@/core/ciclo-vida";
import { puedeOperarPedido } from "@/core/autorizacion";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaCambioEstado } from "@/lib/esquemas";
import { entregarPushDePedido } from "@/lib/push";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const { sesion, pedido } = await exigirAccesoPedido(id);
    const { estado, nota } = await cuerpo(req, esquemaCambioEstado);

    const contexto = {
      usuarioId: pedido.usuarioId,
      comercioId: pedido.franja.comercioId,
    };
    const operador = puedeOperarPedido(sesion, contexto);

    // Un estudiante solo puede CANCELAR su propio pedido. Nada más.
    if (!operador && estado !== "CANCELADO") {
      throw new NoAutorizado(
        "Solo el comercio puede cambiar el estado de preparación",
      );
    }

    const actor: Actor =
      sesion.rol === "ADMIN"
        ? "ADMIN"
        : sesion.rol === "COMERCIO"
          ? "COMERCIO"
          : "USUARIO";

    const r = await cambiarEstado(prisma, {
      pedidoId: id,
      hacia: estado,
      actor,
      actorId: sesion.usuarioId,
      nota,
    });

    // Entrega inmediata del aviso, ya con la transacción confirmada (ADR-14).
    // La bandeja sola no alcanza acá: el cron corre cada varios minutos y un
    // "tu pedido está listo" que llega tarde es peor que no llegar, porque el
    // estudiante ya caminó hasta el mostrador. `entregarPushDePedido` nunca
    // lanza — que el servicio de push esté caído no puede impedir que la
    // cocina marque un pedido.
    if (r.hacia === "LISTO") {
      await entregarPushDePedido(prisma, id, "PEDIDO_LISTO");
    }

    return ok({
      pedidoId: r.pedidoId,
      desde: r.desde,
      estado: r.hacia,
      cumplimiento: r.cumplimiento,
      capacidadLiberadaMin: r.capacidadLiberadaMin,
    });
  } catch (e) {
    return manejarError(e, req);
  }
}
