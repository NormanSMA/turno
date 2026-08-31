/**
 * "Tu pedido habitual".
 *
 * Lo que se prueba es que el sistema no invente un hábito. Ofrecerle a alguien
 * "tu habitual" señalando algo que pidió una sola vez —o una combinación que
 * nunca pidió— se siente peor que no ofrecer nada: es el sistema afirmando que
 * te conoce y demostrando que no.
 */

import { describe, expect, it } from "vitest";
import { pedidoHabitual, type PedidoHistorico } from "@/core/habitual";

let n = 0;
function pedido(
  items: [string, number][],
  extra: Partial<PedidoHistorico> = {},
): PedidoHistorico {
  n += 1;
  return {
    id: `p${n}`,
    estado: "RETIRADO",
    comercio: "Cafetería Central",
    comercioSlug: "central",
    creadoEn: `2026-03-${String(n).padStart(2, "0")}T12:00:00Z`,
    total: "100",
    items: items.map(([productoId, cantidad]) => ({
      productoId,
      cantidad,
      nombre: productoId,
    })),
    ...extra,
  };
}

describe("cuándo NO hay habitual", () => {
  it("sin historial no inventa nada", () => {
    expect(pedidoHabitual([])).toBeNull();
  });

  it("una sola vez no es un hábito", () => {
    expect(pedidoHabitual([pedido([["a", 1]])])).toBeNull();
  });

  it("productos repetidos en combinaciones distintas no forman un habitual", () => {
    // Pidió hamburguesa tres veces, pero nunca el mismo pedido. Sumar productos
    // sueltos armaría una combinación que esta persona jamás pidió.
    const r = pedidoHabitual([
      pedido([["burger", 1], ["cola", 1]]),
      pedido([["burger", 1], ["agua", 1]]),
      pedido([["burger", 1], ["jugo", 1]]),
    ]);
    expect(r).toBeNull();
  });

  it("los pedidos que no se retiraron no cuentan", () => {
    // Un cancelado no dice qué te gusta; dice qué día te salió mal.
    const r = pedidoHabitual([
      pedido([["a", 1]], { estado: "CANCELADO" }),
      pedido([["a", 1]], { estado: "NO_SHOW" }),
      pedido([["a", 1]], { estado: "RECIBIDO" }),
    ]);
    expect(r).toBeNull();
  });
});

describe("cuándo SÍ", () => {
  it("dos veces la misma combinación ya es habitual", () => {
    const r = pedidoHabitual([
      pedido([["a", 1], ["b", 2]]),
      pedido([["b", 2], ["a", 1]]),
    ]);
    expect(r?.veces).toBe(2);
  });

  it("el orden de los productos no cambia la combinación", () => {
    // "café + pan" y "pan + café" son el mismo pedido.
    const r = pedidoHabitual([
      pedido([["cafe", 1], ["pan", 1]]),
      pedido([["pan", 1], ["cafe", 1]]),
    ]);
    expect(r).not.toBeNull();
  });

  it("la cantidad SÍ distingue: dos cafés no es un café", () => {
    const r = pedidoHabitual([
      pedido([["cafe", 1]]),
      pedido([["cafe", 2]]),
    ]);
    expect(r).toBeNull();
  });

  it("gana la combinación más repetida", () => {
    const r = pedidoHabitual([
      pedido([["a", 1]]),
      pedido([["a", 1]]),
      pedido([["a", 1]]),
      pedido([["b", 1]]),
      pedido([["b", 1]]),
    ]);
    expect(r?.items[0]?.productoId).toBe("a");
    expect(r?.veces).toBe(3);
  });

  it("empatadas, gana la más reciente", () => {
    // Los gustos cambian durante un semestre. Ofrecer lo de marzo cuando en
    // agosto se pide otra cosa se siente como que el sistema dejó de mirar.
    const viejo = [pedido([["viejo", 1]]), pedido([["viejo", 1]])];
    const nuevo = [pedido([["nuevo", 1]]), pedido([["nuevo", 1]])];
    const r = pedidoHabitual([...viejo, ...nuevo]);
    expect(r?.items[0]?.productoId).toBe("nuevo");
  });

  it("devuelve el pedido MÁS RECIENTE de esa combinación", () => {
    // Es el que se va a repetir: sus precios y nombres son los que menos se
    // alejan del menú de hoy.
    const a = pedido([["x", 1]]);
    const b = pedido([["x", 1]]);
    const r = pedidoHabitual([a, b]);
    expect(r?.pedidoId).toBe(b.id);
  });
});
