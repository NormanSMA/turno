/**
 * PATCH /api/pedidos/:id/estado — única puerta de cambio de estado.
 *
 * La autorización es por ACCIÓN, no solo por pertenencia: el dueño del pedido
 * puede cancelarlo, pero no puede marcarlo LISTO — eso sería declarar cumplida
 * la promesa que el sistema está midiendo.
 */
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { exigirAccesoPedido, NoAutorizado } from "@/lib/auth";
import { cambiarEstado, type Actor } from "@/core/ciclo-vida";
import { puedeOperarPedido } from "@/core/autorizacion";
import { mismoCodigo } from "@/core/codigo-retiro";
import { cuerpo, fallo, manejarError, ok } from "@/lib/http";
import {
  apagarAgotados,
  ErrorAgotados,
  validarAgotados,
} from "@/lib/agotados";
import { esquemaCambioEstado } from "@/lib/esquemas";
import { entregarPushDePedido } from "@/lib/push";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const { sesion, pedido } = await exigirAccesoPedido(id);
    const { estado, nota, agotados, codigo, sinCodigo } = await cuerpo(
      req,
      esquemaCambioEstado,
    );

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

    // Entregar exige el código del pedido: es lo que evita marcar como retirado
    // el pedido equivocado cuando hay varios en el mostrador. El comercio puede
    // entregar sin verificarlo (se le cayó el teléfono al estudiante), pero lo
    // declara y queda en el historial (ADR-26). El ADMIN no opera pedidos.
    let notaEntrega: string | undefined;
    if (estado === "RETIRADO" && actor === "COMERCIO") {
      if (codigo !== undefined) {
        if (!mismoCodigo(pedido.codigo, codigo)) {
          return fallo(
            "CODIGO_INCORRECTO",
            "El código no corresponde a este pedido",
            403,
          );
        }
      } else if (sinCodigo) {
        notaEntrega = nota ?? "Entregado sin verificar el código";
      } else {
        return fallo(
          "CODIGO_REQUERIDO",
          "Entregar un pedido exige su código de retiro",
          400,
        );
      }
    }

    // Se valida ANTES de cancelar: una lista inválida no debe dejar el pedido
    // cancelado a medias.
    const agotadosValidos = await validarAgotados(prisma, {
      ids: agotados ?? [],
      estado,
      actor,
      pedidoId: id,
      comercioId: contexto.comercioId,
    });

    // `cambiarEstado` abre su propia transacción y no acepta un cliente ajeno,
    // así que no hay una sola transacción. Se apaga ANTES de cancelar: que el
    // producto esté agotado es verdad aunque la cancelación falle (por ejemplo,
    // el estudiante canceló al mismo tiempo), y repetirlo es inocuo. Al revés,
    // un fallo dejaría el pedido cancelado y el producto a la venta.
    await apagarAgotados(
      contexto.comercioId,
      sesion.usuarioId,
      agotadosValidos,
    );

    const r = await cambiarEstado(prisma, {
      pedidoId: id,
      hacia: estado,
      actor,
      actorId: sesion.usuarioId,
      nota: notaEntrega ?? nota,
    });

    // Entrega inmediata del aviso, ya con la transacción confirmada (ADR-14).
    // La bandeja sola no alcanza acá: el cron corre cada varios minutos y un
    // "tu pedido está listo" que llega tarde es peor que no llegar, porque el
    // estudiante ya caminó hasta el mostrador. `entregarPushDePedido` nunca
    // lanza — que el servicio de push esté caído no puede impedir que la
    // cocina marque un pedido. Corre con `after`: la respuesta no espera el envío.
    if (r.hacia === "LISTO") {
      after(() => entregarPushDePedido(prisma, id, "PEDIDO_LISTO"));
    }

    return ok({
      pedidoId: r.pedidoId,
      desde: r.desde,
      estado: r.hacia,
      cumplimiento: r.cumplimiento,
      capacidadLiberadaMin: r.capacidadLiberadaMin,
    });
  } catch (e) {
    if (e instanceof ErrorAgotados) return fallo(e.codigo, e.message, e.status);
    return manejarError(e, req);
  }
}
