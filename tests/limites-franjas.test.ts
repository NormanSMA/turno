/**
 * `franjasPara` devuelve los límites del estudiante para avisarle antes de
 * confirmar. Solo un ESTUDIANTE los recibe.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { franjasPara } from "@/lib/catalogo";
import { limpiar, montarEscenario } from "./helpers/db";
import { crearOperador } from "./helpers/sesion";
import type { PrismaClient } from "@/generated/prisma/client";

const db = prisma as unknown as PrismaClient;

beforeEach(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
  await limpiar(db);
});
afterAll(async () => {
  await db.$disconnect();
});

let n = 0;
async function pedido(
  usuarioId: string,
  franjaId: string,
  estado: "RECIBIDO" | "LISTO" | "RETIRADO" | "NO_SHOW",
  diasAtras = 1,
) {
  n += 1;
  await db.pedido.create({
    data: {
      codigo: `LIM${n}${crypto.randomUUID().slice(0, 4)}`.toUpperCase(),
      usuarioId,
      franjaId,
      condicionExperimental: "A",
      idempotencyKey: crypto.randomUUID(),
      cargaEstimadaMin: 10,
      total: "10.00",
      estado,
      eventos:
        estado === "NO_SHOW"
          ? {
              create: {
                estado,
                timestamp: new Date(Date.now() - diasAtras * 86_400_000),
              },
            }
          : undefined,
    },
  });
}

async function consultar(
  slug: string,
  productoId: string,
  sesion: { usuarioId: string; rol: string } | null,
) {
  return franjasPara({
    slug,
    items: [{ productoId, cantidad: 1 }],
    condicion: "A",
    sesion,
  });
}

describe("franjasPara: limites", () => {
  it("estudiante: cuenta solo los pedidos activos y no hay bloqueo", async () => {
    const e = await montarEscenario(db, { cantidadUsuarios: 1, maxPedidosActivos: 3 });
    const u = e.usuarios[0]!;
    await pedido(u.id, e.franjas[0]!.id, "RECIBIDO");
    await pedido(u.id, e.franjas[0]!.id, "LISTO");
    await pedido(u.id, e.franjas[0]!.id, "RETIRADO");

    const r = await consultar(e.comercio.slug, e.producto.id, {
      usuarioId: u.id,
      rol: "ESTUDIANTE",
    });
    expect(r?.limites).toEqual({ activos: 2, maximo: 3, bloqueadoHasta: null });
  });

  it("estudiante con 3 no-shows en la ventana: devuelve cuando puede volver a pedir", async () => {
    const e = await montarEscenario(db, { cantidadUsuarios: 1 });
    const u = e.usuarios[0]!;
    await pedido(u.id, e.franjas[0]!.id, "NO_SHOW", 1);
    await pedido(u.id, e.franjas[0]!.id, "NO_SHOW", 2);
    await pedido(u.id, e.franjas[0]!.id, "NO_SHOW", 3);

    const r = await consultar(e.comercio.slug, e.producto.id, {
      usuarioId: u.id,
      rol: "ESTUDIANTE",
    });
    // El mas antiguo (3 dias atras) sale de la ventana a los 30 dias.
    const esperado = Date.now() - 3 * 86_400_000 + 30 * 86_400_000;
    expect(r?.limites?.bloqueadoHasta).not.toBeNull();
    expect(
      Math.abs(new Date(r!.limites!.bloqueadoHasta!).getTime() - esperado),
    ).toBeLessThan(60_000);
  });

  it("un no-show fuera de la ventana no bloquea", async () => {
    const e = await montarEscenario(db, { cantidadUsuarios: 1 });
    const u = e.usuarios[0]!;
    await pedido(u.id, e.franjas[0]!.id, "NO_SHOW", 31);
    await pedido(u.id, e.franjas[0]!.id, "NO_SHOW", 32);
    await pedido(u.id, e.franjas[0]!.id, "NO_SHOW", 33);

    const r = await consultar(e.comercio.slug, e.producto.id, {
      usuarioId: u.id,
      rol: "ESTUDIANTE",
    });
    expect(r?.limites?.bloqueadoHasta).toBeNull();
  });

  it("sin sesion o con rol de operacion: null", async () => {
    const e = await montarEscenario(db, { cantidadUsuarios: 1 });
    const op = await crearOperador(db, "COMERCIO", e.comercio.id);

    const anonimo = await consultar(e.comercio.slug, e.producto.id, null);
    expect(anonimo?.limites).toBeNull();

    const operador = await consultar(e.comercio.slug, e.producto.id, {
      usuarioId: op.id,
      rol: "COMERCIO",
    });
    expect(operador?.limites).toBeNull();
  });
});
