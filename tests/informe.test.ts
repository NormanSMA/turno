/**
 * Informe de ventas del comercio.
 *
 * Lo que se verifica acá no es que las sumas den: es que el informe **no
 * mienta**. Un comercio compara este total contra su caja al cerrar el día, y
 * si no coincide una sola vez deja de mirarlo para siempre.
 *
 * De ahí que casi todas las pruebas sean sobre lo que NO se cuenta.
 */

import { describe, expect, it } from "vitest";
import {
  calcularCifras,
  calcularOcupacion,
  productosVendidos,
  ventasPorHora,
  type FranjaInforme,
  type PedidoInforme,
} from "@/core/informe";

function pedido(p: Partial<PedidoInforme> = {}): PedidoInforme {
  return {
    estado: "RETIRADO",
    cumplimiento: "CUMPLIDO",
    total: 100,
    cargaMin: 10,
    hora: "12:00",
    items: [{ nombre: "Almuerzo", cantidad: 1, subtotal: 100 }],
    ...p,
  };
}

describe("lo que cuenta como venta", () => {
  it("solo suma los pedidos retirados", () => {
    const c = calcularCifras([
      pedido({ total: 100 }),
      pedido({ total: 50, estado: "NO_SHOW" }),
      pedido({ total: 70, estado: "CANCELADO" }),
      pedido({ total: 30, estado: "LISTO" }),
    ]);

    // 100, no 250. Un pedido listo que nadie pasó a buscar no es plata en la
    // caja; contarlo haría que el informe no cuadre contra el cierre del día.
    expect(c.ventas).toBe(100);
    expect(c.vendidos).toBe(1);
  });

  it("cuenta los no retirados y los cancelados por separado, sin esconderlos", () => {
    const c = calcularCifras([
      pedido(),
      pedido({ estado: "NO_SHOW" }),
      pedido({ estado: "NO_SHOW" }),
      pedido({ estado: "CANCELADO" }),
    ]);

    expect(c.noShows).toBe(2);
    expect(c.cancelados).toBe(1);
  });

  it("sin ventas no inventa un ticket promedio de cero", () => {
    // Cero sugiere "vendiste y el promedio fue cero". `null` dice "no hay dato",
    // que es lo cierto, y la interfaz lo dibuja como una raya.
    expect(calcularCifras([]).ticketPromedio).toBeNull();
    expect(calcularCifras([]).cumplimiento).toBeNull();
  });

  it("el cumplimiento ignora lo que todavía no se juzgó", () => {
    const c = calcularCifras([
      pedido({ cumplimiento: "CUMPLIDO" }),
      pedido({ cumplimiento: "INCUMPLIDO" }),
      pedido({ cumplimiento: "PENDIENTE" }),
      pedido({ cumplimiento: "NO_APLICA" }),
    ]);

    // 1 de 2, no 1 de 4: un pedido en curso no es un incumplimiento.
    expect(c.cumplimiento).toBe(0.5);
  });

  it("los minutos cocinados son los que se entregaron", () => {
    const c = calcularCifras([
      pedido({ cargaMin: 10 }),
      pedido({ cargaMin: 8, estado: "CANCELADO" }),
    ]);
    expect(c.minutosCocinados).toBe(10);
  });
});

describe("a qué hora vende", () => {
  it("agrupa por hora de retiro y ordena", () => {
    const puntos = ventasPorHora([
      pedido({ hora: "12:00", total: 100 }),
      pedido({ hora: "09:00", total: 40 }),
      pedido({ hora: "12:00", total: 60 }),
    ]);

    expect(puntos.map((p) => p.hora)).toEqual(["09:00", "12:00"]);
    expect(puntos[1]).toMatchObject({ pedidos: 2, ventas: 160 });
  });

  it("una hora con solo cancelados no aparece como hora de venta", () => {
    const puntos = ventasPorHora([
      pedido({ hora: "09:00" }),
      pedido({ hora: "15:00", estado: "CANCELADO" }),
    ]);
    expect(puntos.map((p) => p.hora)).toEqual(["09:00"]);
  });
});

describe("qué le compran", () => {
  it("ordena por plata y no por unidades", () => {
    const top = productosVendidos([
      pedido({
        items: [
          { nombre: "Café", cantidad: 10, subtotal: 300 },
          { nombre: "Almuerzo", cantidad: 3, subtotal: 450 },
        ],
      }),
    ]);

    // El café es lo más pedido; el almuerzo es lo que sostiene el mes.
    expect(top[0]?.nombre).toBe("Almuerzo");
    expect(top[1]?.nombre).toBe("Café");
  });

  it("acumula el mismo producto entre pedidos", () => {
    const top = productosVendidos([
      pedido({ items: [{ nombre: "Café", cantidad: 2, subtotal: 90 }] }),
      pedido({ items: [{ nombre: "Café", cantidad: 1, subtotal: 45 }] }),
    ]);
    expect(top[0]).toMatchObject({ unidades: 3, ventas: 135 });
  });

  it("no cuenta lo que no se retiró", () => {
    const top = productosVendidos([
      pedido({
        estado: "NO_SHOW",
        items: [{ nombre: "Fantasma", cantidad: 9, subtotal: 900 }],
      }),
    ]);
    expect(top).toEqual([]);
  });
});

describe("cuán llena corrió la cocina", () => {
  function franja(p: Partial<FranjaInforme> = {}): FranjaInforme {
    return { hora: "12:00", capacidadMinutos: 100, cargaAsignada: 50, ...p };
  }

  it("promedia solo las franjas que se usaron", () => {
    const o = calcularOcupacion([
      franja({ cargaAsignada: 80 }),
      franja({ hora: "12:10", cargaAsignada: 40 }),
      // Una franja vacía no baja el promedio: se cuenta aparte, porque
      // "abriste horas que nadie usó" es un problema distinto de "cocinaste al
      // 60 %", y mezclarlos esconde los dos.
      franja({ hora: "12:20", cargaAsignada: 0 }),
    ]);

    expect(o.promedio).toBeCloseTo(0.6);
    expect(o.vacias).toBe(1);
  });

  it("señala la franja más cargada", () => {
    const o = calcularOcupacion([
      franja({ hora: "09:00", cargaAsignada: 30 }),
      franja({ hora: "12:00", cargaAsignada: 95 }),
    ]);
    expect(o.pico).toEqual({ hora: "12:00", ocupacion: 0.95 });
  });

  it("sin franjas no divide por cero", () => {
    expect(calcularOcupacion([])).toEqual({
      promedio: null,
      pico: null,
      vacias: 0,
    });
  });

  it("ignora franjas con capacidad cero en vez de reventar", () => {
    const o = calcularOcupacion([franja({ capacidadMinutos: 0 })]);
    expect(o.promedio).toBeNull();
    expect(Number.isFinite(o.pico?.ocupacion ?? 0)).toBe(true);
  });
});
