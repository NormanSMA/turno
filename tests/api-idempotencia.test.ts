/**
 * Idempotencia a nivel HTTP, sobre el handler real.
 *
 * Punto 9 de la auditoría ("misma clave + payload distinto → rechazo") y el
 * arreglo de los hallazgos T-13 y T-14.
 *
 * Lo que había: `reservar` buscaba el pedido por la clave y, si lo encontraba,
 * lo devolvía. Sin mirar de quién era ni qué contenía. Las dos pruebas que
 * fijan eso —"otro pedido con la misma clave" y "la clave de otra persona"—
 * fallaban antes de este cambio, y las dos terminaban entregando un CÓDIGO DE
 * RETIRO que no correspondía.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar, montarEscenario } from "./helpers/db";
import { entrarComo, peticion, salir } from "./helpers/sesion";
import { huellaSolicitud } from "@/core/reserva";
import type { PrismaClient } from "@/generated/prisma/client";

import * as RPedidos from "@/app/api/pedidos/route";

const db = prisma as unknown as PrismaClient;

let comercioId: string;
let franjaId: string;
let otraFranjaId: string;
let productoId: string;
let otroProductoId: string;
let usuarioA: string;
let usuarioB: string;

const clave = () => crypto.randomUUID();

function crear(
  key: string,
  cuerpo: Partial<{
    comercioId: string;
    franjaId: string;
    items: { productoId: string; cantidad: number }[];
  }> = {},
) {
  return RPedidos.POST(
    peticion("/api/pedidos", {
      method: "POST",
      headers: { "idempotency-key": key },
      body: {
        comercioId: cuerpo.comercioId ?? comercioId,
        franjaId: cuerpo.franjaId ?? franjaId,
        items: cuerpo.items ?? [{ productoId, cantidad: 1 }],
      },
    }),
  );
}

beforeAll(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
  await limpiar(db);

  const e = await montarEscenario(db, { cantidadUsuarios: 2, capacidadMinutos: 400 });
  comercioId = e.comercio.id;
  franjaId = e.franjas[0]!.id;
  otraFranjaId = e.franjas[1]!.id;
  productoId = e.producto.id;
  usuarioA = e.usuarios[0]!.id;
  usuarioB = e.usuarios[1]!.id;

  const otro = await db.producto.create({
    data: {
      comercioId: e.comercio.id,
      nombre: "Ensalada",
      precio: "80.00",
      tiempoPreparacionMin: 4,
      anticipable: true,
    },
  });
  otroProductoId = otro.id;
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => salir());

describe("la cabecera Idempotency-Key es obligatoria y con forma", () => {
  it("sin la cabecera responde 400", async () => {
    await entrarComo(db, usuarioA);
    const r = await RPedidos.POST(
      peticion("/api/pedidos", {
        method: "POST",
        body: { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] },
      }),
    );
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe("IDEMPOTENCY_KEY_REQUERIDA");
  });

  it("con una clave que no es UUID v4 responde 400", async () => {
    await entrarComo(db, usuarioA);
    const r = await crear("clave-cualquiera");
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe("IDEMPOTENCY_KEY_REQUERIDA");
  });
});

describe("la misma clave con el mismo pedido no crea dos", () => {
  it("201 la primera vez y 200 con reintento la segunda", async () => {
    await entrarComo(db, usuarioA);
    const k = clave();

    const primera = await crear(k);
    expect(primera.status).toBe(201);
    const a = await primera.json();
    expect(a.reintento).toBe(false);

    const segunda = await crear(k);
    expect(segunda.status).toBe(200);
    const b = await segunda.json();
    expect(b.reintento).toBe(true);
    expect(b.pedidoId).toBe(a.pedidoId);
    expect(b.codigo).toBe(a.codigo);

    expect(await db.pedido.count({ where: { idempotencyKey: k } })).toBe(1);
  });

  it("el orden de las líneas no convierte el reintento en conflicto", async () => {
    await entrarComo(db, usuarioA);
    const k = clave();
    const items = [
      { productoId, cantidad: 1 },
      { productoId: otroProductoId, cantidad: 2 },
    ];

    const primera = await crear(k, { items });
    expect(primera.status).toBe(201);

    const segunda = await crear(k, { items: [...items].reverse() });
    expect(segunda.status).toBe(200);
    expect((await segunda.json()).reintento).toBe(true);
  });

  it("cambiar de franja con la misma clave sigue siendo el mismo intento", async () => {
    // Es la regla que dejó el hallazgo 4: un rechazo por capacidad no crea
    // nada, así que reintentar con otra hora es el MISMO intento y conserva la
    // clave. Por eso la franja no entra en la huella.
    await entrarComo(db, usuarioA);
    const k = clave();

    const primera = await crear(k, { franjaId });
    expect(primera.status).toBe(201);

    const segunda = await crear(k, { franjaId: otraFranjaId });
    expect(segunda.status).toBe(200);
    expect((await segunda.json()).pedidoId).toBe((await primera.json()).pedidoId);
  });
});

describe("la misma clave con OTRO pedido se rechaza", () => {
  it("cambiar los productos da 409 y no devuelve el pedido viejo", async () => {
    await entrarComo(db, usuarioA);
    const k = clave();

    const primera = await crear(k, { items: [{ productoId, cantidad: 1 }] });
    expect(primera.status).toBe(201);
    const original = await primera.json();

    const segunda = await crear(k, {
      items: [{ productoId: otroProductoId, cantidad: 3 }],
    });

    expect(segunda.status).toBe(409);
    const cuerpo = await segunda.json();
    expect(cuerpo.codigo).toBe("IDEMPOTENCIA_EN_CONFLICTO");
    // Lo que de verdad importa: no se filtró el código de retiro del otro
    // pedido. Antes del arreglo, este cuerpo traía el código equivocado.
    expect(JSON.stringify(cuerpo)).not.toContain(original.codigo);
  });

  it("cambiar la cantidad también es otro pedido", async () => {
    await entrarComo(db, usuarioA);
    const k = clave();
    expect((await crear(k, { items: [{ productoId, cantidad: 1 }] })).status).toBe(201);

    const r = await crear(k, { items: [{ productoId, cantidad: 2 }] });
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe("IDEMPOTENCIA_EN_CONFLICTO");
  });

  it("no se abre la hoja de franja agotada por un conflicto de idempotencia", async () => {
    // El 409 se enruta por código; solo cuatro abren la hoja de recuperación.
    // Ninguno de los de idempotencia está entre ellos, y la lista de
    // alternativas va vacía a propósito: elegir otra hora no arregla esto.
    await entrarComo(db, usuarioA);
    const k = clave();
    await crear(k);
    const r = await crear(k, { items: [{ productoId: otroProductoId, cantidad: 1 }] });
    const cuerpo = await r.json();

    expect([
      "SIN_FRANJA_DISPONIBLE",
      "FUERA_DE_CUTOFF",
      "FRANJA_INEXISTENTE",
      "CARGA_EXCEDE_CAPACIDAD_TOTAL",
    ]).not.toContain(cuerpo.codigo);
    expect(cuerpo.detalle.alternativas).toEqual([]);
  });
});

describe("la clave de otra persona no entrega su pedido", () => {
  it("presentar una clave ajena da 409 y no revela el código de retiro", async () => {
    await entrarComo(db, usuarioA);
    const k = clave();
    const suyo = await (await crear(k)).json();

    // B presenta la clave de A. La clave viaja en una cabecera: la ven los
    // proxies y los logs, así que no puede ser por sí sola una llave.
    await entrarComo(db, usuarioB);
    const r = await crear(k);

    expect(r.status).toBe(409);
    const cuerpo = await r.json();
    expect(cuerpo.codigo).toBe("IDEMPOTENCIA_AJENA");
    expect(JSON.stringify(cuerpo)).not.toContain(suyo.codigo);
    expect(JSON.stringify(cuerpo)).not.toContain(suyo.pedidoId);
  });

  it("el pedido de A sigue siendo de A", async () => {
    await entrarComo(db, usuarioA);
    const k = clave();
    const suyo = await (await crear(k)).json();

    await entrarComo(db, usuarioB);
    await crear(k);

    const fila = await db.pedido.findUnique({ where: { id: suyo.pedidoId } });
    expect(fila!.usuarioId).toBe(usuarioA);
    expect(await db.pedido.count({ where: { idempotencyKey: k } })).toBe(1);
  });
});

describe("la huella, en aislamiento", () => {
  it("es igual sin importar el orden de las líneas", () => {
    const a = huellaSolicitud("c1", [
      { productoId: "p1", cantidad: 1 },
      { productoId: "p2", cantidad: 2 },
    ]);
    const b = huellaSolicitud("c1", [
      { productoId: "p2", cantidad: 2 },
      { productoId: "p1", cantidad: 1 },
    ]);
    expect(a).toBe(b);
  });

  it("distingue cantidad, producto y comercio", () => {
    const base = huellaSolicitud("c1", [{ productoId: "p1", cantidad: 1 }]);
    expect(huellaSolicitud("c1", [{ productoId: "p1", cantidad: 2 }])).not.toBe(base);
    expect(huellaSolicitud("c1", [{ productoId: "p2", cantidad: 1 }])).not.toBe(base);
    expect(huellaSolicitud("c2", [{ productoId: "p1", cantidad: 1 }])).not.toBe(base);
  });

  it("no se deja confundir por una línea que parezca dos", () => {
    // Sin separador, `p1x1` + `1x1` y `p1x11` + `x1` colisionarían.
    expect(
      huellaSolicitud("c", [
        { productoId: "p1", cantidad: 1 },
        { productoId: "1", cantidad: 1 },
      ]),
    ).not.toBe(
      huellaSolicitud("c", [
        { productoId: "p1", cantidad: 11 },
        { productoId: "", cantidad: 1 },
      ]),
    );
  });
});
