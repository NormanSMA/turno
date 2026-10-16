/** Penalización por no-shows a nivel HTTP. */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar, montarEscenario } from "./helpers/db";
import { peticion, salir } from "./helpers/sesion";
import { COOKIE_SESION, crearSesionParaPrueba } from "@/lib/auth";
import { ponerCookie } from "./helpers/cookies";
import type { PrismaClient } from "@/generated/prisma/client";
import * as RPedidos from "@/app/api/pedidos/route";

const db = prisma as unknown as PrismaClient;

beforeAll(() => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
});
afterAll(() => db.$disconnect());
beforeEach(() => salir());

async function pedir(e: Awaited<ReturnType<typeof montarEscenario>>) {
  const token = (await crearSesionParaPrueba(e.usuarios[0]!.id)).token;
  ponerCookie(COOKIE_SESION, token);
  return RPedidos.POST(
    peticion("/api/pedidos", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: {
        comercioId: e.comercio.id,
        franjaId: e.franjas[0]!.id,
        items: [{ productoId: e.producto.id, cantidad: 1 }],
      },
    }),
  );
}

async function sembrarNoShows(
  e: Awaited<ReturnType<typeof montarEscenario>>,
  n: number,
) {
  for (let i = 0; i < n; i++) {
    await db.pedido.create({
      data: {
        codigo: `NS${i}${crypto.randomUUID().slice(0, 4)}`.toUpperCase(),
        usuarioId: e.usuarios[0]!.id,
        franjaId: e.franjas[0]!.id,
        condicionExperimental: "A",
        idempotencyKey: crypto.randomUUID(),
        cargaEstimadaMin: 10,
        total: "10.00",
        estado: "NO_SHOW",
        eventos: {
          create: {
            estado: "NO_SHOW",
            timestamp: new Date(Date.now() - (i + 1) * 86_400_000),
          },
        },
      },
    });
  }
}

describe("penalización por no-shows", () => {
  it("con 3 no-shows recientes responde 403 y no crea pedido", async () => {
    await limpiar(db);
    const e = await montarEscenario(db, { cantidadUsuarios: 1, capacidadMinutos: 400 });
    await sembrarNoShows(e, 3);
    const antes = await db.pedido.count();

    const r = await pedir(e);

    expect(r.status).toBe(403);
    const c = await r.json();
    expect(c.codigo).toBe("LIMITE_NO_SHOWS");
    expect(c.detalle.puedePedirEn).toBeTruthy();
    expect(await db.pedido.count()).toBe(antes);
  });

  it("sin no-shows crea el pedido", async () => {
    await limpiar(db);
    const e = await montarEscenario(db, { cantidadUsuarios: 1, capacidadMinutos: 400 });

    const r = await pedir(e);

    expect(r.status).toBe(201);
  });
});
