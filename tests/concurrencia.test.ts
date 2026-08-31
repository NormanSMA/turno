/**
 * Indicador 9 (§14.5) — Integridad bajo concurrencia: CERO sobreventas.
 *
 * Es la prueba técnica central del proyecto: lo que ninguna herramienta no-code
 * garantiza. No comprueba "que la app funcione", comprueba que el invariante
 *
 *      carga_asignada(f) ≤ α · C(f)
 *
 * se sostiene aunque N usuarios reserven el último espacio en el mismo instante.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reservar } from "@/core/reserva";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("reserva concurrente sobre la última plaza", () => {
  it("no sobrevende: 20 solicitudes simultáneas, solo caben 8", async () => {
    // C = 100, α = 0.85 → 85 minutos comprometibles. w = 10 por pedido.
    // Máximo admisible = floor(85 / 10) = 8 pedidos (80 ≤ 85; 90 > 85).
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { capacidadMinutos: 100, factorSeguridad: 0.85, cantidadUsuarios: 20 },
    );

    const resultados = await Promise.all(
      usuarios.map((u) =>
        reservar(prisma, {
          usuarioId: u.id,
          comercioId: comercio.id,
          franjaSolicitadaId: franjas[0].id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );

    const admitidos = resultados.filter((r) => r.admitido);
    const rechazados = resultados.filter((r) => !r.admitido);

    expect(admitidos).toHaveLength(8);
    expect(rechazados).toHaveLength(12);

    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    // El invariante, medido en la base y no en memoria.
    expect(franja.cargaAsignada).toBe(80);
    expect(franja.cargaAsignada).toBeLessThanOrEqual(
      franja.capacidadMinutos * Number(comercio.factorSeguridad),
    );

    // Y la carga registrada coincide exactamente con los pedidos persistidos:
    // ni un pedido fantasma, ni carga contabilizada sin pedido.
    const agregado = await prisma.pedido.aggregate({
      where: { franjaId: franjas[0].id },
      _sum: { cargaEstimadaMin: true },
      _count: true,
    });
    expect(agregado._count).toBe(8);
    expect(agregado._sum.cargaEstimadaMin).toBe(80);
  });

  it("todo rechazo por capacidad ofrece franjas alternativas (§6.1: propone, no rechaza)", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 20, cantidadFranjas: 3 },
    );

    const resultados = await Promise.all(
      usuarios.map((u) =>
        reservar(prisma, {
          usuarioId: u.id,
          comercioId: comercio.id,
          franjaSolicitadaId: franjas[0].id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );

    for (const r of resultados) {
      if (r.admitido) continue;
      expect(r.motivo).toBe("SIN_FRANJA_DISPONIBLE");
      expect(r.alternativas.length).toBeGreaterThan(0);
      // Nunca se propone la franja que acaba de llenarse.
      expect(r.alternativas.map((a) => a.franjaId)).not.toContain(franjas[0].id);
    }
  });

  it("mantiene el invariante con cargas heterogéneas (no es un contador de pedidos)", async () => {
    // Diez cafés no son diez almuerzos: mezclamos w = 10 y w = 30.
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { capacidadMinutos: 120, factorSeguridad: 1, cantidadUsuarios: 24 },
    );

    const resultados = await Promise.all(
      usuarios.map((u, i) =>
        reservar(prisma, {
          usuarioId: u.id,
          comercioId: comercio.id,
          franjaSolicitadaId: franjas[0].id,
          items: [{ productoId: producto.id, cantidad: i % 2 === 0 ? 1 : 3 }],
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );

    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBeLessThanOrEqual(120);

    const admitidos = resultados.filter((r) => r.admitido);
    const suma = admitidos.reduce(
      (a, r) => a + (r.admitido ? r.cargaEstimadaMin : 0),
      0,
    );
    expect(franja.cargaAsignada).toBe(suma);
  });

  it("reservas en franjas distintas no se bloquean entre sí y todas se admiten", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { capacidadMinutos: 100, cantidadFranjas: 3, cantidadUsuarios: 12 },
    );

    const resultados = await Promise.all(
      usuarios.map((u, i) =>
        reservar(prisma, {
          usuarioId: u.id,
          comercioId: comercio.id,
          franjaSolicitadaId: franjas[i % 3].id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );

    // 4 pedidos por franja × 10 min = 40 ≤ 85: todos caben.
    expect(resultados.every((r) => r.admitido)).toBe(true);
    for (const f of franjas) {
      const actual = await prisma.franja.findUniqueOrThrow({
        where: { id: f.id },
      });
      expect(actual.cargaAsignada).toBe(40);
    }
  });

  it("rechaza un producto no elegible sin tocar la carga de la franja", async () => {
    const { comercio, franjas, usuarios } = await montarEscenario(prisma, {
      cantidadUsuarios: 1,
    });
    const chicle = await prisma.producto.create({
      data: {
        comercioId: comercio.id,
        nombre: "Chicle",
        precio: "5.00",
        tiempoPreparacionMin: 0,
        anticipable: true, // marcado por error: el criterio t(p) >= t_min lo frena igual
      },
    });

    const r = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: chicle.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });

    expect(r.admitido).toBe(false);
    if (!r.admitido) expect(r.motivo).toBe("PRODUCTO_NO_ELEGIBLE");

    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBe(0);
  });

  it("registra la instrumentación exigida por el Capítulo V (§12)", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1, condicion: "B" },
    );

    const r = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[1].id,
      items: [{ productoId: producto.id, cantidad: 2 }],
      idempotencyKey: crypto.randomUUID(),
      canalCaptacion: "qr_pasillo",
    });

    expect(r.admitido).toBe(true);
    if (!r.admitido) return;

    const pedido = await prisma.pedido.findUniqueOrThrow({
      where: { id: r.pedidoId },
      include: { eventos: true, items: true },
    });

    expect(pedido.condicionExperimental).toBe("B");
    expect(pedido.franjaSolicitadaId).toBe(franjas[1].id);
    expect(pedido.franjaId).toBe(franjas[1].id);
    expect(pedido.cargaEstimadaMin).toBe(20);
    expect(pedido.canalCaptacion).toBe("qr_pasillo");
    expect(Array.isArray(pedido.franjasOfrecidas)).toBe(true);
    expect(pedido.creadoEn).toBeInstanceOf(Date);
    expect(pedido.listoEn).toBeNull();
    expect(pedido.retiradoEn).toBeNull();
    // La línea de tiempo del pedido arranca desde el primer evento.
    expect(pedido.eventos).toHaveLength(1);
    expect(pedido.eventos[0].estado).toBe("RECIBIDO");
    // Snapshot de precio y t(p): el histórico no se altera si el menú cambia.
    expect(pedido.items[0].tiempoPreparacionMin).toBe(10);
    expect(String(pedido.items[0].precioUnitario)).toBe("120");
  });
});
