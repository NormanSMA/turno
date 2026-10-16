/**
 * Productos agotados al cancelar un pedido desde la cocina.
 *
 * La cocina marca cuáles productos del pedido quedan `disponible=false`. El
 * servidor no confía en la lista: cada id debe ser un producto de ESE pedido y
 * de ese comercio, y solo comercio o admin pueden pedirlo.
 *
 * El apagado reutiliza `actualizarProducto`, que ya audita el cambio. Ese
 * camino abre su propia conexión, así que no cabe en la transacción de
 * `cambiarEstado`: la ruta valida primero, apaga y cancela después.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/core/ciclo-vida";
import { actualizarProducto } from "./comercio";

export class ErrorAgotados extends Error {
  constructor(
    readonly codigo: "AGOTADOS_NO_PERMITIDOS" | "AGOTADOS_INVALIDOS",
    readonly status: 400 | 403,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorAgotados";
  }
}

/**
 * Valida la lista y devuelve los ids sin repetir. Lanza `ErrorAgotados` si el
 * actor no puede, si el estado no es CANCELADO o si algún id no pertenece al
 * pedido y al comercio.
 */
export async function validarAgotados(
  db: Pick<PrismaClient, "itemPedido">,
  datos: {
    ids: string[];
    estado: string;
    actor: Actor;
    pedidoId: string;
    comercioId: string;
  },
): Promise<string[]> {
  const ids = [...new Set(datos.ids)];
  if (ids.length === 0) return [];

  if (datos.actor !== "COMERCIO" && datos.actor !== "ADMIN") {
    throw new ErrorAgotados(
      "AGOTADOS_NO_PERMITIDOS",
      403,
      "Solo el comercio puede marcar productos agotados",
    );
  }
  if (datos.estado !== "CANCELADO") {
    throw new ErrorAgotados(
      "AGOTADOS_INVALIDOS",
      400,
      "Los productos agotados solo se marcan al cancelar",
    );
  }

  const items = await db.itemPedido.findMany({
    where: {
      pedidoId: datos.pedidoId,
      productoId: { in: ids },
      producto: { comercioId: datos.comercioId },
    },
    select: { productoId: true },
  });
  const validos = new Set(items.map((i) => i.productoId));
  if (ids.some((id) => !validos.has(id))) {
    throw new ErrorAgotados(
      "AGOTADOS_INVALIDOS",
      400,
      "Hay productos que no son de este pedido",
    );
  }
  return ids;
}

/** Deja `disponible=false` cada producto, con la auditoría de `comercio.ts`. */
export async function apagarAgotados(
  comercioId: string,
  actorId: string,
  ids: string[],
) {
  for (const id of ids) {
    await actualizarProducto(comercioId, id, actorId, { disponible: false });
  }
}
