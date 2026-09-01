/**
 * Política de retención — qué se borra de la base y qué no.
 *
 * La regla que estas pruebas fijan no es de rendimiento, es de criterio:
 * **lo operativo se purga, la evidencia se conserva.** Una notificación
 * entregada hace tres meses no le sirve a nadie; un pedido de hace tres meses
 * es el dato con el que se defiende el piloto.
 *
 * Sin esta distinción escrita en una prueba, la próxima persona que vea la
 * base crecer va a borrar lo que más pesa, que es exactamente lo que no se
 * puede borrar.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { purgarNotificaciones } from "@/core/limites";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";

const prisma = crearPrismaTest();

const HACE_100_DIAS = new Date(Date.now() - 100 * 86_400_000);
const HACE_10_DIAS = new Date(Date.now() - 10 * 86_400_000);

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea una notificación suelta con estado y antigüedad a medida. */
async function aviso(
  estado: "PENDIENTE" | "ENVIANDO" | "ENVIADA" | "FALLIDA",
  creadaEn: Date,
) {
  return prisma.notificacion.create({
    data: {
      destinatario: "quien@uam.edu.ni",
      tipo: "PEDIDO_CONFIRMADO",
      canal: "CORREO",
      estado,
      creadaEn,
    },
  });
}

describe("purga de notificaciones resueltas", () => {
  it("borra las entregadas hace más de noventa días", async () => {
    await aviso("ENVIADA", HACE_100_DIAS);
    await aviso("FALLIDA", HACE_100_DIAS);

    expect(await purgarNotificaciones(prisma)).toBe(2);
    expect(await prisma.notificacion.count()).toBe(0);
  });

  it("no toca las recientes", async () => {
    await aviso("ENVIADA", HACE_10_DIAS);

    expect(await purgarNotificaciones(prisma)).toBe(0);
    expect(await prisma.notificacion.count()).toBe(1);
  });

  it("no toca las que todavía tienen trabajo por delante", async () => {
    // Vieja pero sin resolver: puede ser un aviso que falló y espera reintento,
    // o una fila que un worker reclamó y no llegó a marcar. Borrarla sería
    // perder el aviso en silencio, que es peor que conservar la fila.
    await aviso("PENDIENTE", HACE_100_DIAS);
    await aviso("ENVIANDO", HACE_100_DIAS);

    expect(await purgarNotificaciones(prisma)).toBe(0);
    expect(await prisma.notificacion.count()).toBe(2);
  });

  it("el umbral se puede ajustar sin tocar el código", async () => {
    await aviso("ENVIADA", HACE_10_DIAS);
    expect(await purgarNotificaciones(prisma, new Date(), 5)).toBe(1);
  });
});

describe("la evidencia del piloto no se purga", () => {
  it("un pedido viejo y ya retirado sigue estando", async () => {
    /*
     * Esta prueba existe para que falle el día que alguien agregue una purga
     * de pedidos "para liberar espacio". `pedido` y `evento_pedido` son las
     * dos tablas que más pesan y son, exactamente, sobre las que se calculan
     * la comparación A/B, el cumplimiento por día y la carga por franja. El
     * panel exporta su CSV crudo para que un tercero rehaga las cuentas.
     *
     * Cuando el volumen apriete, lo que corresponde es archivar fuera de la
     * base. Nunca eliminar.
     */
    const { franjas, usuarios } = await montarEscenario(prisma, {
      cantidadUsuarios: 1,
    });

    // El comercio no va suelto: el pedido llega a él por su franja.
    const viejo = await prisma.pedido.create({
      data: {
        usuarioId: usuarios[0]!.id,
        franjaId: franjas[0]!.id,
        codigo: "XXX-999",
        estado: "RETIRADO",
        total: "120.00",
        cargaEstimadaMin: 10,
        condicionExperimental: "A",
        idempotencyKey: crypto.randomUUID(),
        creadoEn: HACE_100_DIAS,
      },
    });

    await purgarNotificaciones(prisma);

    expect(
      await prisma.pedido.findUnique({ where: { id: viejo.id } }),
    ).not.toBeNull();
  });
});
