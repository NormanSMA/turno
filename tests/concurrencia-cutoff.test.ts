/**
 * P0‑2 — El cut-off medido con un reloj viejo.
 *
 * `reservar` capturaba `ahora` al entrar, ochenta líneas **antes** de abrir la
 * transacción, y lo arrastraba hasta el cálculo del cut-off. Mientras tanto la
 * transacción podía quedarse esperando el `SELECT … FOR UPDATE` de una franja
 * que otra reserva tenía tomada.
 *
 * Cuando por fin entraba, decidía con la hora de cuando pidió el turno, no con
 * la de cuando le tocó. Y el cut-off es precisamente la regla que dice
 * *"ya no da tiempo de cocinarlo"*: evaluarla contra un reloj atrasado admite
 * pedidos que el propio sistema considera imposibles de cumplir.
 *
 * La espera se provoca reteniendo la franja desde otra transacción, que es lo
 * que hace una reserva real entre su lock y su commit — solo que acá dura lo
 * que la prueba necesita.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reservar } from "@/core/reserva";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";

const prisma = crearPrismaTest();

/** Lo que la cocina necesita: preparación + margen, en minutos. */
const PREPARACION_MIN = 10;
const MARGEN_MIN = 2;
const NECESARIO_MS = (PREPARACION_MIN + MARGEN_MIN) * 60_000;

/** Cuánto retiene la franja la transacción de al lado. */
const ESPERA_MS = 1_500;

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("una reserva que espera por el lock", () => {
  it("evalúa el cut-off con la hora en que entra, no con la de cuando pidió", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      {
        capacidadMinutos: 100,
        factorSeguridad: 0.85,
        tiempoPreparacionMin: PREPARACION_MIN,
        margenCutoffMin: MARGEN_MIN,
        cantidadFranjas: 1,
        cantidadUsuarios: 2,
      },
    );

    /*
     * La franja se coloca en el filo.
     *
     * Termina 400 ms después del último instante en que todavía da tiempo de
     * cocinar. O sea: **ahora mismo entra por 400 ms, y dentro de un segundo ya
     * no.** Esa es toda la ventana que necesita la prueba.
     */
    const ahora = Date.now();
    const fin = new Date(ahora + NECESARIO_MS + 400);
    const futura = franjas[0]!;
    await prisma.franja.update({
      where: { id: futura.id },
      data: { inicio: new Date(ahora + 60_000), fin },
    });

    let reserva!: Promise<{ admitido: boolean; motivo?: string }>;

    await prisma.$transaction(
      async (tx) => {
        // Tomar la franja. Cualquier reserva que la quiera queda esperando acá.
        await tx.$queryRaw`
          SELECT id FROM franja WHERE id = ${futura.id}::uuid FOR UPDATE
        `;

        // Sin `await` y sin `ahora` inyectado: tiene que usar el reloj real,
        // que es el punto de la prueba.
        reserva = reservar(prisma, {
          usuarioId: usuarios[0]!.id,
          comercioId: comercio.id,
          franjaSolicitadaId: futura.id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }) as typeof reserva;

        // Para cuando esto termine, el cut-off ya pasó.
        await new Promise((r) => setTimeout(r, ESPERA_MS));
      },
      { timeout: 20_000 },
    );

    const r = await reserva;

    // No da tiempo de cocinarlo: el sistema no puede prometerlo.
    expect(r.admitido).toBe(false);
    expect(r.motivo).toBe("FUERA_DE_CUTOFF");

    // Y no quedó carga comprometida en una franja que no se puede cumplir.
    const despues = await prisma.franja.findUniqueOrThrow({
      where: { id: futura.id },
    });
    expect(despues.cargaAsignada).toBe(0);
  });

  it("sigue admitiendo cuando el tiempo alcanza de sobra", async () => {
    // El contrapeso: rechazar todo lo que espere por un lock también pasaría la
    // prueba anterior. Una reserva que espera y **llega a tiempo** tiene que
    // entrar igual.
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      {
        capacidadMinutos: 100,
        factorSeguridad: 0.85,
        tiempoPreparacionMin: PREPARACION_MIN,
        margenCutoffMin: MARGEN_MIN,
        cantidadFranjas: 1,
        cantidadUsuarios: 2,
      },
    );

    const ahora = Date.now();
    const futura = franjas[0]!;
    await prisma.franja.update({
      where: { id: futura.id },
      // Una hora por delante: la espera de un segundo y medio no la mueve.
      data: {
        inicio: new Date(ahora + 30 * 60_000),
        fin: new Date(ahora + 60 * 60_000),
      },
    });

    let reserva!: Promise<{ admitido: boolean }>;

    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM franja WHERE id = ${futura.id}::uuid FOR UPDATE
        `;
        reserva = reservar(prisma, {
          usuarioId: usuarios[0]!.id,
          comercioId: comercio.id,
          franjaSolicitadaId: futura.id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }) as typeof reserva;
        await new Promise((r) => setTimeout(r, ESPERA_MS));
      },
      { timeout: 20_000 },
    );

    expect((await reserva).admitido).toBe(true);
  });
});
