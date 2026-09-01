/**
 * P0‑1 — Bajar α mientras entra un pedido.
 *
 * `actualizarParametros` lee las franjas, comprueba que ninguna quedaría
 * sobrevendida con el α nuevo, y recién entonces escribe. Entre la lectura y la
 * escritura no había ningún lock, así que una reserva concurrente podía subir
 * `cargaAsignada` en esa ventana y dejar el sistema con
 *
 *      carga_asignada(f)  >  α · C(f)
 *
 * que es exactamente el invariante que el producto existe para sostener. Una
 * franja sobrevendida significa una cocina que no puede cumplir la hora que
 * prometió.
 *
 * **La carrera se provoca, no se espera.** Lanzar las dos operaciones con
 * `Promise.all` y confiar en que el planificador las cruce da una prueba que
 * pasa casi siempre y falla un martes: inútil como red de seguridad. Acá la
 * ventana se abre a propósito con una transacción que retiene la franja, y por
 * eso el resultado es el mismo en cada ejecución.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { actualizarParametros, CambioRechazado } from "@/lib/comercio";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** El invariante del sistema, medido sobre la base. */
async function franjasSobrevendidas(comercioId: string) {
  const comercio = await prisma.comercio.findUniqueOrThrow({
    where: { id: comercioId },
  });
  const alfa = Number(comercio.factorSeguridad);
  const franjas = await prisma.franja.findMany({ where: { comercioId } });

  return franjas
    .filter((f) => f.cargaAsignada > f.capacidadMinutos * alfa)
    .map((f) => ({
      inicio: f.inicio.toISOString(),
      carga: f.cargaAsignada,
      techo: f.capacidadMinutos * alfa,
    }));
}

describe("bajar α con una reserva en vuelo", () => {
  it("no deja franjas sobrevendidas", async () => {
    // C = 100 y α = 0.85 → 85 minutos comprometibles. La franja arranca con 50,
    // que cabe de sobra.
    const { comercio, franjas, usuarios } = await montarEscenario(prisma, {
      capacidadMinutos: 100,
      factorSeguridad: 0.85,
      cantidadUsuarios: 2,
    });
    const futura = franjas[0]!;
    await prisma.franja.update({
      where: { id: futura.id },
      data: { cargaAsignada: 50 },
    });

    /*
     * La ventana.
     *
     * Esta transacción sube la carga a 80 y **retiene la fila** sin confirmar
     * mientras `actualizarParametros` corre. Es lo que hace una reserva real
     * entre su `SELECT … FOR UPDATE` y su `COMMIT`, solo que acá dura lo que
     * necesitamos en vez de unos milisegundos.
     *
     * Con α = 0.7 el techo baja a 70, así que una carga de 80 lo rompe: el
     * cambio TIENE que rechazarse.
     */
    let cambio!: Promise<unknown>;

    await prisma.$transaction(
      async (tx) => {
        await tx.franja.update({
          where: { id: futura.id },
          data: { cargaAsignada: 80 },
        });

        // Arranca sin `await`: tiene que correr mientras la fila sigue tomada.
        // Usa el cliente de la aplicación, con su propio pool, así que compite
        // de verdad por el lock en vez de esperarse a sí misma.
        cambio = actualizarParametros(comercio.id, usuarios[0]!.id, {
          factorSeguridad: 0.7,
        }).catch((e) => e);

        await new Promise((r) => setTimeout(r, 300));
      },
      { timeout: 15_000 },
    );

    const resultado = await cambio;

    // El desenlace correcto: el cambio se rechaza explicando cuál es el
    // problema. Lo inaceptable no es que falle, es que tenga éxito.
    expect(resultado).toBeInstanceOf(CambioRechazado);

    const despues = await prisma.comercio.findUniqueOrThrow({
      where: { id: comercio.id },
    });
    expect(Number(despues.factorSeguridad)).toBe(0.85);

    // Y la comprobación que de verdad importa, medida sobre los datos.
    expect(await franjasSobrevendidas(comercio.id)).toEqual([]);
  });

  it("sí deja bajar α cuando de verdad cabe", async () => {
    // El contrapeso: sin esta prueba, bloquear todo cambio de α también
    // pasaría la anterior. La corrección no puede convertirse en un candado.
    const { comercio, franjas, usuarios } = await montarEscenario(prisma, {
      capacidadMinutos: 100,
      factorSeguridad: 0.85,
      cantidadUsuarios: 2,
    });
    await prisma.franja.update({
      where: { id: franjas[0]!.id },
      data: { cargaAsignada: 30 },
    });

    // 30 ≤ 70: cabe con el α nuevo.
    await actualizarParametros(comercio.id, usuarios[0]!.id, {
      factorSeguridad: 0.7,
    });

    const despues = await prisma.comercio.findUniqueOrThrow({
      where: { id: comercio.id },
    });
    expect(Number(despues.factorSeguridad)).toBe(0.7);
    expect(await franjasSobrevendidas(comercio.id)).toEqual([]);
  });
});
