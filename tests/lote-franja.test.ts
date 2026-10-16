/**
 * Avance en lote de una franja: cada pedido pasa por la máquina de estados, un
 * pedido que cambió en paralelo se omite y solo el comercio dueño puede operar.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

const m = vi.hoisted(() => ({
  after: vi.fn(),
  push: vi.fn(),
  antes: null as null | ((pedidoId: string) => Promise<void>),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: m.after,
}));
vi.mock("@/lib/push", () => ({ entregarPushDePedido: m.push }));
// Envuelve la función real: permite cambiar un pedido justo antes de que el
// lote lo toque, que es la carrera que se quiere probar de forma determinista.
vi.mock("@/core/ciclo-vida", async (orig) => {
  const real = await orig<typeof import("@/core/ciclo-vida")>();
  return {
    ...real,
    cambiarEstado: async (...args: Parameters<typeof real.cambiarEstado>) => {
      await m.antes?.(args[1].pedidoId);
      return real.cambiarEstado(...args);
    },
  };
});

import { prisma } from "@/lib/db";
import { limpiar, montarEscenario } from "./helpers/db";
import { crearOperador, ctx, entrarComo, peticion, salir } from "./helpers/sesion";
import { avanzarFranja } from "@/lib/lote-franja";
import type { PrismaClient } from "@/generated/prisma/client";

import * as RAvanzar from "@/app/api/cocina/[slug]/franjas/[franjaId]/avanzar/route";

const db = prisma as unknown as PrismaClient;

beforeAll(() => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
});
afterAll(async () => {
  await db.$disconnect();
});
beforeEach(() => {
  salir();
  m.antes = null;
  m.after.mockClear();
});

async function montar(estado: "RECIBIDO" | "EN_PREPARACION", cuantos = 3) {
  await limpiar(db);
  const e = await montarEscenario(db, { cantidadUsuarios: cuantos });
  const pedidos = [];
  for (let i = 0; i < cuantos; i++) {
    pedidos.push(
      await db.pedido.create({
        data: {
          usuarioId: e.usuarios[i]!.id,
          franjaId: e.franjas[0]!.id,
          idempotencyKey: crypto.randomUUID(),
          codigo: `LOT-00${i}`,
          estado,
          total: "120.00",
          cargaEstimadaMin: 10,
          condicionExperimental: "A",
        },
      }),
    );
  }
  const operador = await crearOperador(db, "COMERCIO", e.comercio.id);
  return { e, pedidos, operador };
}

const llamar = (slug: string, franjaId: string, body: unknown) =>
  RAvanzar.POST(
    peticion(`/api/cocina/${slug}/franjas/${franjaId}/avanzar`, {
      method: "POST",
      body,
    }),
    ctx({ slug, franjaId }),
  );

describe("avance en lote de una franja", () => {
  it("lleva los 3 pedidos RECIBIDO a EN_PREPARACION y deja el evento de cada uno", async () => {
    const { e, pedidos, operador } = await montar("RECIBIDO");
    await entrarComo(db, operador.id);

    const r = await llamar(e.comercio.slug, e.franjas[0]!.id, { hacia: "EN_PREPARACION" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ avanzados: 3, omitidos: 0 });

    for (const p of pedidos) {
      const tras = await db.pedido.findUniqueOrThrow({ where: { id: p.id } });
      expect(tras.estado).toBe("EN_PREPARACION");
      expect(
        await db.eventoPedido.count({ where: { pedidoId: p.id, estado: "EN_PREPARACION" } }),
      ).toBe(1);
    }
    // El push solo se programa al llegar a LISTO.
    expect(m.after).not.toHaveBeenCalled();
  });

  it("no salta estados: LISTO no toca los pedidos que siguen en RECIBIDO", async () => {
    const { e, pedidos, operador } = await montar("RECIBIDO");
    await entrarComo(db, operador.id);

    const r = await llamar(e.comercio.slug, e.franjas[0]!.id, { hacia: "LISTO" });
    expect(await r.json()).toEqual({ avanzados: 0, omitidos: 0 });
    const tras = await db.pedido.findUniqueOrThrow({ where: { id: pedidos[0]!.id } });
    expect(tras.estado).toBe("RECIBIDO");
  });

  it("EN_PREPARACION a LISTO programa un push por cada pedido avanzado", async () => {
    const { e, operador } = await montar("EN_PREPARACION");
    await entrarComo(db, operador.id);

    const r = await llamar(e.comercio.slug, e.franjas[0]!.id, { hacia: "LISTO" });
    expect(await r.json()).toEqual({ avanzados: 3, omitidos: 0 });
    expect(m.after).toHaveBeenCalledTimes(3);
  });

  it("un pedido que cambió en paralelo se omite y el resto avanza", async () => {
    const { e, pedidos, operador } = await montar("RECIBIDO");
    const ordenados = pedidos.map((p) => p.id);
    const ajeno = ordenados[1]!;
    // Se cancela justo antes de que el lote llegue a él.
    m.antes = async (id) => {
      if (id === ajeno) {
        await db.pedido.update({ where: { id }, data: { estado: "CANCELADO" } });
      }
    };

    const r = await avanzarFranja(db, {
      franjaId: e.franjas[0]!.id,
      comercioId: e.comercio.id,
      hacia: "EN_PREPARACION",
      actorId: operador.id,
    });
    expect(r.omitidos).toEqual([ajeno]);
    expect(r.avanzados).toEqual(ordenados.filter((id) => id !== ajeno));
    const tras = await db.pedido.findUniqueOrThrow({ where: { id: ajeno } });
    expect(tras.estado).toBe("CANCELADO");
  });

  it("rechaza una franja de otro comercio y no toca sus pedidos", async () => {
    const { e, operador } = await montar("RECIBIDO");
    const otro = await montarEscenario(db, { cantidadUsuarios: 1 });
    const pedidoAjeno = await db.pedido.create({
      data: {
        usuarioId: otro.usuarios[0]!.id,
        franjaId: otro.franjas[0]!.id,
        idempotencyKey: crypto.randomUUID(),
        codigo: "AJE-001",
        total: "120.00",
        cargaEstimadaMin: 10,
        condicionExperimental: "A",
      },
    });
    await entrarComo(db, operador.id);

    const r = await llamar(e.comercio.slug, otro.franjas[0]!.id, { hacia: "EN_PREPARACION" });
    expect(r.status).toBe(403);
    const tras = await db.pedido.findUniqueOrThrow({ where: { id: pedidoAjeno.id } });
    expect(tras.estado).toBe("RECIBIDO");
  });

  it("rechaza al estudiante en la ruta", async () => {
    const { e, pedidos } = await montar("RECIBIDO");
    await entrarComo(db, e.usuarios[0]!.id);

    const r = await llamar(e.comercio.slug, e.franjas[0]!.id, { hacia: "EN_PREPARACION" });
    expect(r.status).toBe(403);
    const tras = await db.pedido.findUniqueOrThrow({ where: { id: pedidos[0]!.id } });
    expect(tras.estado).toBe("RECIBIDO");
  });

  it("rechaza un destino que no es EN_PREPARACION ni LISTO", async () => {
    const { e, operador } = await montar("RECIBIDO", 1);
    await entrarComo(db, operador.id);

    const r = await llamar(e.comercio.slug, e.franjas[0]!.id, { hacia: "RETIRADO" });
    expect(r.status).toBe(422);
  });
});
