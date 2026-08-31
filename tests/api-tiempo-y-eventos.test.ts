/**
 * Tiempo, notificaciones y retiro: puntos 28, 29 y 30 de la auditoría técnica.
 *
 * Los tres comparten una propiedad: **fallan en silencio**. Un cutoff mal
 * medido admite un pedido que la cocina no llega a preparar y nadie lo nota
 * hasta el mostrador; una notificación duplicada se ve como spam y no como
 * bug; un pedido retirado dos veces le da comida gratis a alguien y sale como
 * un descuadre en el arqueo, no como un error en un log.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar, montarEscenario } from "./helpers/db";
import { crearOperador, ctx, entrarComo, peticion, salir } from "./helpers/sesion";
import { pasoCutoff, calcularOpcionesConCutoff } from "@/core/admision";
import type { PrismaClient } from "@/generated/prisma/client";

import * as REstado from "@/app/api/pedidos/[id]/estado/route";

const db = prisma as unknown as PrismaClient;

beforeAll(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(() => salir());

// ===========================================================================
// Punto 28 — auditoría temporal
// ===========================================================================
describe("el cutoff se mide en el borde exacto, no «más o menos»", () => {
  const fin = new Date("2026-09-01T12:10:00.000Z");
  const franja = { fin };

  it("justo a tiempo entra, y un milisegundo después no", () => {
    // El instante límite: ahora + preparación + margen == fin de la franja.
    // Ahí todavía se cumple, porque la promesa es "listo cuando termina tu
    // franja" y terminar justo a tiempo es cumplir.
    const preparacion = 8;
    const margen = 2;
    const limite = new Date(fin.getTime() - (preparacion + margen) * 60_000);

    expect(
      pasoCutoff({ ahora: limite, franja, tiempoPreparacionMaxMin: preparacion, margenMin: margen }),
    ).toBe(false);
    expect(
      pasoCutoff({
        ahora: new Date(limite.getTime() + 1),
        franja,
        tiempoPreparacionMaxMin: preparacion,
        margenMin: margen,
      }),
    ).toBe(true);
  });

  it("el margen es tiempo real: subirlo un minuto adelanta el cierre un minuto", () => {
    const base = new Date(fin.getTime() - 10 * 60_000);
    expect(pasoCutoff({ ahora: base, franja, tiempoPreparacionMaxMin: 8, margenMin: 2 })).toBe(false);
    expect(pasoCutoff({ ahora: base, franja, tiempoPreparacionMaxMin: 8, margenMin: 3 })).toBe(true);
  });

  it("el cutoff no depende del huso del servidor", () => {
    // Es el hallazgo 6 llevado al cálculo: las columnas son `timestamptz`, y
    // acá se comprueba que la decisión también trabaja en instantes absolutos.
    // Si en algún lado se comparara "hora local", este caso cambiaría según
    // dónde corra el proceso, y el Capítulo V se analizaría con datos que
    // dependen del portátil de quien corrió el barrido.
    const mismoInstante = new Date(fin.getTime() - 11 * 60_000);
    const previo = process.env.TZ;
    const resultados: boolean[] = [];
    for (const tz of ["UTC", "America/Managua", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      resultados.push(
        pasoCutoff({ ahora: mismoInstante, franja, tiempoPreparacionMaxMin: 8, margenMin: 2 }),
      );
    }
    process.env.TZ = previo;
    expect(new Set(resultados).size).toBe(1);
  });

  it("una franja ya vencida nunca se ofrece", () => {
    const franjas = [
      {
        id: "f1",
        inicio: new Date("2026-09-01T12:00:00Z"),
        fin: new Date("2026-09-01T12:10:00Z"),
        capacidadMinutos: 100,
        cargaAsignada: 0,
        abierta: true,
      },
    ];
    const lineas = [
      {
        cantidad: 1,
        producto: {
          id: "p1",
          tiempoPreparacionMin: 5,
          anticipable: true,
          disponible: true,
          precio: "100.00",
        },
      },
    ];
    const r = calcularOpcionesConCutoff(
      franjas as never,
      lineas as never,
      5,
      0.85,
      "A",
      new Date("2026-09-01T13:00:00Z"), // una hora después del fin
      2,
    );
    expect(r.opciones).toEqual([]);
  });
});

describe("las columnas de tiempo llevan zona horaria", () => {
  it("las 21 columnas de fecha son timestamptz, no timestamp", async () => {
    // Hallazgo 6: Prisma generó `TIMESTAMP(3)` sin zona en 21 columnas. En un
    // piloto en Managua cuyos datos se analizan después, eso contamina el
    // Capítulo V en silencio: `listoEn - creadoEn` da números plausibles y
    // equivocados. Esta prueba impide que vuelva por una migración distraída.
    const filas = await db.$queryRaw<{ tabla: string; columna: string; tipo: string }[]>`
      SELECT table_name AS tabla, column_name AS columna, data_type AS tipo
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type LIKE 'timestamp%'
      ORDER BY table_name, column_name
    `;
    const sinZona = filas.filter((f) => !f.tipo.includes("with time zone"));
    expect(
      sinZona,
      `Columnas sin zona horaria: ${sinZona.map((f) => `${f.tabla}.${f.columna}`).join(", ")}`,
    ).toEqual([]);
    expect(filas.length).toBeGreaterThan(15);
  });
});

// ===========================================================================
// Puntos 29 y 30 — notificaciones y retiro
// ===========================================================================
describe("una notificación por evento, y solo una", () => {
  it("la base rechaza la segunda del mismo pedido, tipo y canal", async () => {
    await limpiar(db);
    const e = await montarEscenario(db, { cantidadUsuarios: 1 });
    const pedido = await db.pedido.create({
      data: {
        usuarioId: e.usuarios[0]!.id,
        franjaId: e.franjas[0]!.id,
        idempotencyKey: crypto.randomUUID(),
        codigo: "NOT-001",
        total: "120.00",
        cargaEstimadaMin: 10,
        condicionExperimental: "A",
      },
    });

    const crear = () =>
      db.notificacion.create({
        data: {
          pedidoId: pedido.id,
          destinatario: e.usuarios[0]!.correo,
          tipo: "PEDIDO_LISTO",
          canal: "CORREO",
        },
      });

    await crear();
    // La garantía no es "el código tiene cuidado": es que la base no deja.
    // Un camino nuevo que se olvide de comprobar choca contra el índice.
    await expect(crear()).rejects.toThrow();
    expect(
      await db.notificacion.count({ where: { pedidoId: pedido.id, tipo: "PEDIDO_LISTO" } }),
    ).toBe(1);
  });

  it("el mismo tipo por OTRO canal sí puede coexistir", async () => {
    // Correo y push son dos avisos del mismo evento por vías distintas, no un
    // duplicado: el estudiante que no tiene push activado recibe el correo.
    const pedido = await db.pedido.findFirstOrThrow({ where: { codigo: "NOT-001" } });
    await db.notificacion.create({
      data: {
        pedidoId: pedido.id,
        destinatario: "x@uam.edu.ni",
        tipo: "PEDIDO_LISTO",
        canal: "PUSH",
      },
    });
    expect(await db.notificacion.count({ where: { pedidoId: pedido.id } })).toBe(2);
  });
});

describe("un pedido no se puede retirar dos veces", () => {
  it("el segundo RETIRADO se rechaza con 409 y no toca la fecha de retiro", async () => {
    await limpiar(db);
    const e = await montarEscenario(db, { cantidadUsuarios: 1 });
    const operador = await crearOperador(db, "COMERCIO", e.comercio.id);
    const pedido = await db.pedido.create({
      data: {
        usuarioId: e.usuarios[0]!.id,
        franjaId: e.franjas[0]!.id,
        idempotencyKey: crypto.randomUUID(),
        codigo: "RET-001",
        estado: "LISTO",
        listoEn: new Date(),
        total: "120.00",
        cargaEstimadaMin: 10,
        condicionExperimental: "A",
      },
    });

    const retirar = async () => {
      await entrarComo(db, operador.id);
      return REstado.PATCH(
        peticion(`/api/pedidos/${pedido.id}/estado`, {
          method: "PATCH",
          body: { estado: "RETIRADO" },
        }),
        ctx({ id: pedido.id }),
      );
    };

    const primera = await retirar();
    expect(primera.status).toBe(200);
    const tras1 = await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(tras1.estado).toBe("RETIRADO");
    expect(tras1.retiradoEn).not.toBeNull();

    const segunda = await retirar();
    expect(segunda.status).toBe(409);
    expect((await segunda.json()).codigo).toBe("TRANSICION_INVALIDA");

    // Y la hora de retiro es la primera: si el segundo intento la reescribiera,
    // el tiempo de espera del Capítulo V saldría mal para ese pedido.
    const tras2 = await db.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(tras2.retiradoEn?.getTime()).toBe(tras1.retiradoEn?.getTime());
  });

  it("dos retiros simultáneos: uno gana y el otro recibe un 409, nunca dos éxitos", async () => {
    await limpiar(db);
    const e = await montarEscenario(db, { cantidadUsuarios: 1 });
    const operador = await crearOperador(db, "COMERCIO", e.comercio.id);
    const pedido = await db.pedido.create({
      data: {
        usuarioId: e.usuarios[0]!.id,
        franjaId: e.franjas[0]!.id,
        idempotencyKey: crypto.randomUUID(),
        codigo: "RET-002",
        estado: "LISTO",
        listoEn: new Date(),
        total: "120.00",
        cargaEstimadaMin: 10,
        condicionExperimental: "A",
      },
    });
    await entrarComo(db, operador.id);

    const llamar = () =>
      REstado.PATCH(
        peticion(`/api/pedidos/${pedido.id}/estado`, {
          method: "PATCH",
          body: { estado: "RETIRADO" },
        }),
        ctx({ id: pedido.id }),
      );

    const rs = await Promise.all([llamar(), llamar(), llamar()]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status >= 500)).toHaveLength(0);
    expect(
      await db.eventoPedido.count({ where: { pedidoId: pedido.id, estado: "RETIRADO" } }),
    ).toBe(1);
  });

  it("un pedido cancelado tampoco se puede retirar después", async () => {
    await limpiar(db);
    const e = await montarEscenario(db, { cantidadUsuarios: 1 });
    const operador = await crearOperador(db, "COMERCIO", e.comercio.id);
    const pedido = await db.pedido.create({
      data: {
        usuarioId: e.usuarios[0]!.id,
        franjaId: e.franjas[0]!.id,
        idempotencyKey: crypto.randomUUID(),
        codigo: "RET-003",
        estado: "CANCELADO",
        canceladoEn: new Date(),
        total: "120.00",
        cargaEstimadaMin: 10,
        condicionExperimental: "A",
      },
    });
    await entrarComo(db, operador.id);

    const r = await REstado.PATCH(
      peticion(`/api/pedidos/${pedido.id}/estado`, {
        method: "PATCH",
        body: { estado: "RETIRADO" },
      }),
      ctx({ id: pedido.id }),
    );
    expect(r.status).toBe(409);
  });
});
