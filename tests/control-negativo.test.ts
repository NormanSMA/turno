/**
 * Control negativo de la prueba de concurrencia.
 *
 * Una prueba que pasa siempre no demuestra nada. Acá se implementa la versión
 * INGENUA de la reserva — leer la carga, decidir, escribir; exactamente lo que
 * hace una herramienta no-code o un CRUD sin transacción — y se verifica que
 * bajo la misma carga concurrente SÍ sobrevende.
 *
 * Es la evidencia de que el control transaccional del ADR-03 es necesario, y no
 * una precaución decorativa: mismo escenario, dos implementaciones, resultados
 * distintos. Este archivo se cita en el Capítulo IV.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reservar } from "@/core/reserva";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Reserva SIN control de concurrencia: lee, piensa, escribe. */
async function reservarIngenuo(
  db: PrismaClient,
  franjaId: string,
  carga: number,
  alfa: number,
): Promise<boolean> {
  const franja = await db.franja.findUniqueOrThrow({ where: { id: franjaId } });
  // Ventana de carrera: entre esta lectura y la escritura, otro puede escribir.
  if (franja.cargaAsignada + carga > franja.capacidadMinutos * alfa) return false;
  await new Promise((r) => setTimeout(r, 5));
  await db.franja.update({
    where: { id: franjaId },
    data: { cargaAsignada: { increment: carga } },
  });
  return true;
}

describe("control negativo: la implementación ingenua sí sobrevende", () => {
  it("sin transacción, 20 solicitudes simultáneas rompen el invariante", async () => {
    const { franjas } = await montarEscenario(prisma, {
      capacidadMinutos: 100,
      factorSeguridad: 0.85,
      cantidadUsuarios: 1,
    });

    const admitidos = await Promise.all(
      Array.from({ length: 20 }, () =>
        reservarIngenuo(prisma, franjas[0].id, 10, 0.85),
      ),
    );

    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });

    // El límite era 85 minutos. La versión ingenua lo supera.
    expect(admitidos.filter(Boolean).length).toBeGreaterThan(8);
    expect(franja.cargaAsignada).toBeGreaterThan(85);
  });

  it("misma carga con el módulo de admisión: el invariante se sostiene", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { capacidadMinutos: 100, factorSeguridad: 0.85, cantidadUsuarios: 20 },
    );

    await Promise.all(
      usuarios.map((u) =>
        reservar(prisma, {
          usuarioId: u.id,
          comercioId: comercio.id,
          franjaSolicitadaId: franjas[0].id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );

    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBeLessThanOrEqual(85);
  });
});
