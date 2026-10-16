/**
 * Avance en lote de los pedidos de una franja.
 *
 * No escribe estados: cada pedido pasa por `cambiarEstado`, que toma su lock y
 * valida la transición. El lote solo elige quiénes y cuenta el resultado. Un
 * pedido que cambió en paralelo (cancelado, o avanzado desde su tarjeta) se
 * omite: no es un fallo del lote.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { NoAutorizado } from "@/lib/auth";
import { cambiarEstado } from "@/core/ciclo-vida";
import { TransicionInvalida, type EstadoPedido } from "@/core/estados";

export type DestinoLote = "EN_PREPARACION" | "LISTO";

const ESTADO_PREVIO: Record<DestinoLote, EstadoPedido> = {
  EN_PREPARACION: "RECIBIDO",
  LISTO: "EN_PREPARACION",
};

export interface ResultadoLote {
  avanzados: string[];
  omitidos: string[];
}

export async function avanzarFranja(
  prisma: PrismaClient,
  datos: {
    franjaId: string;
    comercioId: string;
    hacia: DestinoLote;
    actorId: string;
  },
): Promise<ResultadoLote> {
  const franja = await prisma.franja.findUnique({
    where: { id: datos.franjaId },
    select: { comercioId: true },
  });
  if (!franja || franja.comercioId !== datos.comercioId) {
    throw new NoAutorizado("Esta franja no pertenece a este comercio");
  }

  const pedidos = await prisma.pedido.findMany({
    where: { franjaId: datos.franjaId, estado: ESTADO_PREVIO[datos.hacia] },
    orderBy: { creadoEn: "asc" },
    select: { id: true },
  });

  const resultado: ResultadoLote = { avanzados: [], omitidos: [] };
  for (const { id } of pedidos) {
    try {
      await cambiarEstado(prisma, {
        pedidoId: id,
        hacia: datos.hacia,
        actor: "COMERCIO",
        actorId: datos.actorId,
        nota: "Avance en lote de la franja",
      });
      resultado.avanzados.push(id);
    } catch (e) {
      if (!(e instanceof TransicionInvalida)) throw e;
      resultado.omitidos.push(id);
    }
  }
  return resultado;
}
