/**
 * Sondeo de cocina sin reenviar cuerpo, y push de LISTO fuera de la respuesta.
 *
 * Las rutas se prueban con sus dependencias simuladas: lo que se verifica es la
 * política HTTP (ETag, If-None-Match, `after`), no la base de datos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findComercio: vi.fn(),
  findPedidos: vi.fn(),
  findFranjas: vi.fn(),
  after: vi.fn(),
  push: vi.fn(),
  cambiarEstado: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    comercio: { findUnique: m.findComercio },
    pedido: { findMany: m.findPedidos },
    franja: { findMany: m.findFranjas },
  },
}));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  exigirRol: vi.fn(async () => ({ rol: "COMERCIO", usuarioId: "u", comercioId: "c1" })),
  exigirAccesoPedido: vi.fn(async () => ({
    sesion: { rol: "COMERCIO", usuarioId: "u", comercioId: "c1" },
    pedido: { usuarioId: "e", franja: { comercioId: "c1" } },
  })),
}));
vi.mock("@/lib/push", () => ({ entregarPushDePedido: m.push }));
vi.mock("@/core/ciclo-vida", async (orig) => ({
  ...(await orig<typeof import("@/core/ciclo-vida")>()),
  cambiarEstado: m.cambiarEstado,
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: m.after,
}));

import { GET } from "@/app/api/cocina/[slug]/route";
import { PATCH } from "@/app/api/pedidos/[id]/estado/route";
import { CABECERA_SIN_CAMBIOS, etagDeCuerpo } from "@/lib/http";
import { combinarTablero, type Tablero } from "@/lib/consultas-cocina";

const ctxSlug = { params: Promise.resolve({ slug: "cafe" }) };
const pedido = (estado: string) => ({
  id: "p1",
  codigo: "A-1",
  estado,
  cargaEstimadaMin: 5,
  creadoEn: new Date("2026-01-01T10:00:00Z"),
  franja: {
    inicio: new Date("2026-01-01T12:00:00Z"),
    fin: new Date("2026-01-01T12:10:00Z"),
  },
  items: [{ nombreProducto: "Cafe", cantidad: 1, tiempoPreparacionMin: 3 }],
});

function pedirCocina(ifNoneMatch?: string) {
  return GET(
    new Request("http://x/api/cocina/cafe", {
      headers: ifNoneMatch ? { "if-none-match": ifNoneMatch } : {},
    }),
    ctxSlug,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
  vi.clearAllMocks();
  m.findComercio.mockResolvedValue({
    id: "c1",
    nombre: "Cafe",
    slug: "cafe",
    estadoOperacion: "ABIERTO",
    factorSeguridad: "0.85",
  });
  m.findPedidos.mockResolvedValue([pedido("RECIBIDO")]);
  m.findFranjas.mockResolvedValue([]);
});

describe("GET /api/cocina/:slug", () => {
  it("sin If-None-Match responde el tablero completo con ETag", async () => {
    const res = await pedirCocina();
    const cuerpo = await res.json();
    expect(res.headers.get("ETag")).toMatch(/^W\/"c-/);
    expect(res.headers.get(CABECERA_SIN_CAMBIOS)).toBeNull();
    expect(cuerpo.pedidos).toHaveLength(1);
    expect(cuerpo.generadoEn).toBe("2026-01-01T11:00:00.000Z");
  });

  it("con el ETag vigente responde sin cambios y sin tablero", async () => {
    const etag = (await pedirCocina()).headers.get("ETag")!;
    vi.setSystemTime(new Date("2026-01-01T11:00:30Z"));
    const res = await pedirCocina(etag);
    const cuerpo = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get(CABECERA_SIN_CAMBIOS)).toBe("1");
    expect(cuerpo.sinCambios).toBe(true);
    expect(cuerpo.pedidos).toBeUndefined();
    expect(cuerpo.generadoEn).toBe("2026-01-01T11:00:30.000Z");
  });

  it("si cambió un estado, el ETag viejo recibe el tablero completo", async () => {
    const etag = (await pedirCocina()).headers.get("ETag")!;
    m.findPedidos.mockResolvedValue([pedido("EN_PREPARACION")]);
    const res = await pedirCocina(etag);
    const cuerpo = await res.json();
    expect(res.headers.get(CABECERA_SIN_CAMBIOS)).toBeNull();
    expect(cuerpo.pedidos[0].estado).toBe("EN_PREPARACION");
    expect(res.headers.get("ETag")).not.toBe(etag);
  });
});

describe("etagDeCuerpo", () => {
  it("es estable para el mismo contenido y distinto si cambia", () => {
    expect(etagDeCuerpo({ a: 1 })).toBe(etagDeCuerpo({ a: 1 }));
    expect(etagDeCuerpo({ a: 1 })).not.toBe(etagDeCuerpo({ a: 2 }));
  });
});

describe("combinarTablero", () => {
  const previo: Tablero = {
    generadoEn: "viejo",
    comercio: { nombre: "x", estadoOperacion: "ABIERTO" },
    pedidos: [],
    franjas: [],
  };
  it("conserva los datos previos y refresca generadoEn", () => {
    const r = combinarTablero(previo, { sinCambios: true, generadoEn: "nuevo" });
    expect(r).toEqual({ ...previo, generadoEn: "nuevo" });
  });
  it("sin tablero previo pide el cuerpo completo", () => {
    expect(combinarTablero(undefined, { sinCambios: true, generadoEn: "n" })).toBeNull();
  });
  it("un tablero completo reemplaza al previo", () => {
    const nuevo = { ...previo, generadoEn: "otro" };
    expect(combinarTablero(previo, nuevo)).toBe(nuevo);
  });
});

describe("PATCH /api/pedidos/:id/estado", () => {
  const patch = (estado: string) =>
    PATCH(
      new Request("http://x/api/pedidos/p1/estado", {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
  const resultado = (hacia: string) => ({
    pedidoId: "p1",
    desde: "EN_PREPARACION",
    hacia,
    cumplimiento: "PENDIENTE",
    capacidadLiberadaMin: 0,
  });

  it("LISTO responde sin esperar el push: lo difiere con after", async () => {
    m.cambiarEstado.mockResolvedValue(resultado("LISTO"));
    const res = await patch("LISTO");
    expect(res.status).toBe(200);
    expect(m.push).not.toHaveBeenCalled();
    expect(m.after).toHaveBeenCalledTimes(1);
    await m.after.mock.calls[0]![0]();
    expect(m.push).toHaveBeenCalledWith(expect.anything(), "p1", "PEDIDO_LISTO");
  });

  it("otro estado no programa push", async () => {
    m.cambiarEstado.mockResolvedValue(resultado("EN_PREPARACION"));
    await patch("EN_PREPARACION");
    expect(m.after).not.toHaveBeenCalled();
  });
});
