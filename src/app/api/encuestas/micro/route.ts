/**
 * GET  /api/encuestas/micro?pedidoId=… — la pregunta del día, si corresponde.
 * POST /api/encuestas/micro — guarda la respuesta.
 *
 * Solo se ofrece sobre pedidos RETIRADOS y propios: preguntar por un pedido que
 * el usuario no retiró mide otra cosa.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { cuerpo, fallo, manejarError, ok } from "@/lib/http";
import { PREGUNTAS_MICRO, preguntaDelDia } from "@/core/encuestas";

export async function GET(req: Request) {
  try {
    const sesion = await exigirSesion();
    const pedidoId = new URL(req.url).searchParams.get("pedidoId");
    if (!pedidoId) return fallo("FALTA_PEDIDO", "Falta pedidoId", 400);

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { usuarioId: true, estado: true },
    });
    // Mismo 404 para ajeno e inexistente: no hay que confirmar qué pedidos hay.
    if (!pedido || pedido.usuarioId !== sesion.usuarioId) {
      return fallo("NO_ENCONTRADO", "Pedido inexistente", 404);
    }
    if (pedido.estado !== "RETIRADO") return ok({ pregunta: null });

    const yaRespondio = await prisma.respuesta.findFirst({
      where: { pedidoId, tipo: "MICRO" },
      select: { id: true },
    });
    // Preguntar dos veces por lo mismo sesga la respuesta y molesta.
    if (yaRespondio) return ok({ pregunta: null });

    return ok({ pregunta: preguntaDelDia() });
  } catch (e) {
    return manejarError(e);
  }
}

const esquema = z.object({
  pedidoId: z.uuid(),
  pregunta: z.string().min(1).max(60),
  opcion: z.string().min(1).max(40),
});

export async function POST(req: Request) {
  try {
    const sesion = await exigirSesion();
    const datos = await cuerpo(req, esquema);

    const pregunta = PREGUNTAS_MICRO.find((p) => p.id === datos.pregunta);
    if (!pregunta || !pregunta.opciones.some((o) => o.valor === datos.opcion)) {
      // El cliente no decide qué preguntas ni qué opciones existen: si lo
      // hiciera, el análisis tendría categorías inventadas.
      return fallo("RESPUESTA_INVALIDA", "Pregunta u opción desconocida", 422);
    }

    const pedido = await prisma.pedido.findUnique({
      where: { id: datos.pedidoId },
      select: { usuarioId: true, estado: true },
    });
    if (!pedido || pedido.usuarioId !== sesion.usuarioId) {
      return fallo("NO_ENCONTRADO", "Pedido inexistente", 404);
    }
    if (pedido.estado !== "RETIRADO") {
      return fallo("PEDIDO_NO_RETIRADO", "Todavía no se retiró", 409);
    }

    await prisma.respuesta.upsert({
      where: { pedidoId_tipo: { pedidoId: datos.pedidoId, tipo: "MICRO" } },
      update: {},
      create: {
        usuarioId: sesion.usuarioId,
        pedidoId: datos.pedidoId,
        tipo: "MICRO",
        pregunta: datos.pregunta,
        valores: { opcion: datos.opcion },
      },
    });

    return ok({ registrada: true });
  } catch (e) {
    return manejarError(e);
  }
}
