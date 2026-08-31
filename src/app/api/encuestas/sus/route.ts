/**
 * GET  /api/encuestas/sus — los diez ítems, si al usuario le corresponde.
 * POST /api/encuestas/sus — guarda las respuestas y calcula el puntaje.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { cuerpo, fallo, manejarError, ok } from "@/lib/http";
import { ITEMS_SUS, puntajeSus } from "@/core/encuestas";

export async function GET() {
  try {
    const sesion = await exigirSesion();

    // El SUS va solo a quienes hicieron al menos un pedido: preguntarle por la
    // usabilidad a quien nunca usó el sistema no mide usabilidad.
    const pedidos = await prisma.pedido.count({
      where: { usuarioId: sesion.usuarioId },
    });
    const yaRespondio = await prisma.respuesta.findFirst({
      where: { usuarioId: sesion.usuarioId, tipo: "SUS" },
      select: { id: true },
    });

    return ok({
      corresponde: pedidos > 0 && !yaRespondio,
      pedidos,
      yaRespondio: !!yaRespondio,
      items: ITEMS_SUS.map((i) => i.texto),
    });
  } catch (e) {
    return manejarError(e);
  }
}

const esquema = z.object({
  respuestas: z.array(z.number().int().min(1).max(5)).length(10),
});

export async function POST(req: Request) {
  try {
    const sesion = await exigirSesion();
    const { respuestas } = await cuerpo(req, esquema);

    const pedidos = await prisma.pedido.count({
      where: { usuarioId: sesion.usuarioId },
    });
    if (pedidos === 0) {
      return fallo("SIN_PEDIDOS", "El SUS es para quienes usaron el sistema", 409);
    }

    const puntaje = puntajeSus(respuestas);

    const existente = await prisma.respuesta.findFirst({
      where: { usuarioId: sesion.usuarioId, tipo: "SUS" },
    });
    if (existente) {
      return fallo("YA_RESPONDIDO", "Ya respondiste el cuestionario", 409);
    }

    await prisma.respuesta.create({
      data: {
        usuarioId: sesion.usuarioId,
        tipo: "SUS",
        pregunta: "sus",
        // Se guardan los diez ítems crudos, no solo el puntaje: recalcularlo
        // desde el dato original es lo que permite auditar el cálculo.
        valores: { items: respuestas, puntaje },
      },
    });

    return ok({ puntaje });
  } catch (e) {
    return manejarError(e);
  }
}
