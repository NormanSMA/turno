/**
 * POST /api/push/suscripcion   — registra este dispositivo
 * DELETE /api/push/suscripcion — lo da de baja
 *
 * Exige sesión: un aviso de "tu pedido está listo" va dirigido a una persona,
 * así que la suscripción se ata al usuario autenticado y nunca a lo que el
 * cuerpo de la petición diga que es.
 *
 * El `endpoint` es único global (lo emite el servicio de push del navegador),
 * y eso importa para un caso real: si un teléfono se presta o dos personas
 * comparten un dispositivo, el `upsert` REASIGNA la suscripción al usuario que
 * acaba de iniciar sesión en vez de dejar que el anterior siga recibiendo sus
 * pedidos. Un endpoint pertenece a quien está usando el aparato ahora.
 */
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaBajaPush, esquemaSuscripcionPush } from "@/lib/esquemas";
import { pushConfigurado } from "@/lib/push";

export async function POST(req: Request) {
  try {
    const sesion = await exigirSesion();
    const { endpoint, p256dh, auth } = await cuerpo(req, esquemaSuscripcionPush);

    // El navegador guarda su lado de la suscripción aunque el servidor no
    // pueda usarla. Decirlo explícitamente evita el fallo más difícil de
    // diagnosticar: todo "funciona" y ningún aviso llega nunca.
    if (!pushConfigurado()) {
      return ok({ registrada: false, motivo: "PUSH_NO_CONFIGURADO" }, 202);
    }

    await prisma.suscripcionPush.upsert({
      where: { endpoint },
      update: {
        usuarioId: sesion.usuarioId,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        // Un registro nuevo limpia el historial de fallos: el dispositivo
        // acaba de demostrar que está vivo.
        fallos: 0,
      },
      create: {
        usuarioId: sesion.usuarioId,
        endpoint,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
    });

    return ok({ registrada: true }, 201);
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const sesion = await exigirSesion();
    const { endpoint } = await cuerpo(req, esquemaBajaPush);

    // `deleteMany` con el usuario en el filtro, no `delete` por endpoint: así
    // nadie puede dar de baja el dispositivo de otra persona conociendo su
    // endpoint. Y borrar cero filas es un resultado válido, no un 404 — el
    // objetivo es que después de esto no haya suscripción, y no la hay.
    const { count } = await prisma.suscripcionPush.deleteMany({
      where: { endpoint, usuarioId: sesion.usuarioId },
    });

    return ok({ dadaDeBaja: count > 0 });
  } catch (e) {
    return manejarError(e);
  }
}
