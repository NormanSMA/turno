/**
 * P0‑3 — Dos workers vaciando la misma bandeja.
 *
 * `vaciarBandeja` leía las filas `PENDIENTE`, las enviaba una por una y recién
 * después las marcaba. Entre la lectura y la marca no había nada que impidiera
 * que **otra ejecución leyera las mismas filas** y las enviara también.
 *
 * El comentario de la función afirmaba que era "seguro de correr en paralelo",
 * apoyándose en el `UNIQUE (pedidoId, tipo)`. Ese unique impide crear dos
 * notificaciones del mismo tipo; **no impide enviar dos veces la misma fila**.
 * Son dos cosas distintas, y la que importa acá es la segunda: al estudiante le
 * llega el aviso duplicado.
 *
 * Pasa con dos instancias del cron, con un cron que se solapa consigo mismo
 * porque el anterior tardó más que su intervalo, o con un despliegue durante
 * una ejecución.
 *
 * La medida no es cuántos correos salieron —no hay SMTP en pruebas— sino
 * **cuántas veces se procesó cada fila**, que es exactamente el mismo hecho.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reservar } from "@/core/reserva";
import { vaciarBandeja } from "@/lib/correo";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Deja la bandeja con `cuantas` notificaciones de correo pendientes. */
async function bandejaCon(cuantas: number) {
  const { comercio, producto, franjas, usuarios } = await montarEscenario(
    prisma,
    { capacidadMinutos: 1000, factorSeguridad: 1, cantidadUsuarios: cuantas },
  );

  // Franja futura y amplia: acá no se está probando la admisión.
  await prisma.franja.update({
    where: { id: franjas[0]!.id },
    data: {
      inicio: new Date(Date.now() + 30 * 60_000),
      fin: new Date(Date.now() + 90 * 60_000),
    },
  });

  for (const u of usuarios) {
    const r = await reservar(prisma, {
      usuarioId: u.id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0]!.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });
    if (!r.admitido) throw new Error("el escenario no debería rechazar pedidos");
  }

  const pendientes = await prisma.notificacion.count({
    where: { estado: "PENDIENTE", canal: "CORREO" },
  });
  expect(pendientes).toBe(cuantas);
  return cuantas;
}

describe("bandeja de salida con dos workers a la vez", () => {
  it("cada notificación se procesa una sola vez", async () => {
    const total = await bandejaCon(8);

    // Dos ejecuciones simultáneas, como dos instancias del cron.
    const [a, b] = await Promise.all([
      vaciarBandeja(prisma),
      vaciarBandeja(prisma),
    ]);

    // El número que importa: cuántos envíos se hicieron en total. Si los dos
    // workers tomaron las mismas filas, esto da el doble.
    expect(a.enviadas + b.enviadas + a.fallidas + b.fallidas).toBe(total);
  });

  it("entre los dos vacían la bandeja completa", async () => {
    // El contrapeso: repartirse el trabajo no puede significar dejar filas sin
    // atender. Sin esto, un claim que se quede corto también pasaría la prueba
    // anterior.
    const total = await bandejaCon(8);

    await Promise.all([vaciarBandeja(prisma), vaciarBandeja(prisma)]);

    const sinAtender = await prisma.notificacion.count({
      where: { estado: "PENDIENTE", canal: "CORREO" },
    });
    expect(sinAtender).toBe(0);
    expect(
      await prisma.notificacion.count({
        where: { estado: "ENVIADA", canal: "CORREO" },
      }),
    ).toBe(total);
  });
});
