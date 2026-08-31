/**
 * GET /api/estado-servicio — lo que el estudiante necesita saber antes de pedir
 *
 * Alimenta el banner global (§37). Es deliberadamente flaco: nombres de
 * comercios que no están recibiendo pedidos, y nada más.
 *
 * **Es público y sin sesión a propósito.** Un invitado que abre TURNO tiene el
 * mismo derecho a enterarse de que la cafetería no está recibiendo pedidos que
 * alguien identificado; esconderle esa información solo consigue que camine
 * hasta allá igual.
 *
 * No expone salud interna —latencia, colas, errores—. Eso es para quien opera:
 * al estudiante decirle "la base va lenta" no le sirve para decidir nada, y
 * convierte un problema técnico en desconfianza.
 */
import { prisma } from "@/lib/db";
import { manejarError, ok } from "@/lib/http";

export async function GET() {
  try {
    const comercios = await prisma.comercio.findMany({
      where: { activo: true, estadoOperacion: { not: "ABIERTO" } },
      select: { nombre: true, estadoOperacion: true },
      orderBy: { nombre: "asc" },
    });

    return ok({
      // Pausado y cerrado no se mezclan: uno significa "esperá un rato" y el
      // otro "hoy no". Tratarlos igual haría que alguien deje de esperar algo
      // que iba a volver en diez minutos.
      pausados: comercios
        .filter((c) => c.estadoOperacion === "PAUSADO")
        .map((c) => c.nombre),
    });
  } catch (e) {
    return manejarError(e);
  }
}
