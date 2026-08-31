/**
 * GET / PATCH /api/preferencias
 *
 * **Sin fila = todo activado**: nadie tiene que pasar por esta pantalla para
 * que le avisen que su comida está lista; la fila aparece al apagar algo.
 *
 * "Tu pedido está listo" se puede apagar —es una decisión legítima— pero se
 * advierte. Los avisos de sistema no aparecen como opción: no son preferencia,
 * son información para no cruzar el campus en vano.
 *
 * Apagar un aviso silencia el mensaje, nunca el hecho ni el historial.
 */
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { z } from "zod";

const esquema = z.object({
  confirmacion: z.boolean().optional(),
  listo: z.boolean().optional(),
  recordatorio: z.boolean().optional(),
  promociones: z.boolean().optional(),
});

/** Lo que rige cuando el usuario nunca tocó nada. */
export const POR_DEFECTO = {
  confirmacion: true,
  listo: true,
  recordatorio: true,
  promociones: false,
};

export async function GET() {
  try {
    const sesion = await exigirSesion();
    const fila = await prisma.preferenciaAviso.findUnique({
      where: { usuarioId: sesion.usuarioId },
    });

    return ok({
      preferencias: fila
        ? {
            confirmacion: fila.confirmacion,
            listo: fila.listo,
            recordatorio: fila.recordatorio,
            promociones: fila.promociones,
          }
        : POR_DEFECTO,
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const sesion = await exigirSesion();
    const cambios = await cuerpo(req, esquema);

    // El `create` parte de los valores por defecto y aplica encima el cambio:
    // si la fila no existía, todo lo demás tiene que quedar como estaba, no en
    // el default de la columna, que podría no coincidir.
    const fila = await prisma.preferenciaAviso.upsert({
      where: { usuarioId: sesion.usuarioId },
      create: { usuarioId: sesion.usuarioId, ...POR_DEFECTO, ...cambios },
      update: cambios,
    });

    return ok({
      preferencias: {
        confirmacion: fila.confirmacion,
        listo: fila.listo,
        recordatorio: fila.recordatorio,
        promociones: fila.promociones,
      },
    });
  } catch (e) {
    return manejarError(e);
  }
}
