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
import { vaciarBandeja } from "@/lib/correo";
import { crearPrismaTest, limpiar } from "./helpers/db";

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Deja la bandeja con `cuantas` notificaciones de correo pendientes.
 *
 * Se siembran directamente y no a través de un pedido: desde que los avisos de
 * pedido van solo por push, una reserva ya no encola correo. Lo que esta
 * prueba ejerce es **el reclamo atómico**, y para eso da igual de dónde salió
 * la fila. Atarla al flujo de reservas la haría fallar por un cambio que no
 * tiene nada que ver con lo que mide.
 */
async function bandejaCon(cuantas: number) {
  await prisma.notificacion.createMany({
    data: Array.from({ length: cuantas }, (_, i) => ({
      destinatario: `est${i}@uam.edu.ni`,
      tipo: "PEDIDO_CONFIRMADO" as const,
      canal: "CORREO" as const,
    })),
  });

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

    // Ninguna se queda sin atender ni reclamada a medias.
    const sinResolver = await prisma.notificacion.count({
      where: { estado: { in: ["PENDIENTE", "ENVIANDO"] }, canal: "CORREO" },
    });
    expect(sinResolver).toBe(0);

    /*
     * Se cuenta "resuelta", no "enviada".
     *
     * Desde que los avisos de pedido van solo por push, `componer` no arma
     * correo para una fila de pedido y estas se cierran como FALLIDA. Eso es
     * correcto —no hay nada que mandar— y no es lo que esta prueba mide: lo
     * que mide es que el reclamo reparta el trabajo sin perder ni repetir
     * filas. Exigir ENVIADA la ataría a qué correos existen hoy.
     */
    const resueltas = await prisma.notificacion.count({
      where: { estado: { in: ["ENVIADA", "FALLIDA"] }, canal: "CORREO" },
    });
    expect(resueltas).toBe(total);
  });
});
