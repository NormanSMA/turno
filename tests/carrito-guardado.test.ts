/**
 * Restauración del carrito.
 *
 * Lo que se prueba es cuándo NO restaurar. Devolverle a alguien un carrito de
 * ayer, o el de otro comercio, es peor que no guardarlo: el sistema le propone
 * un pedido que él no armó y que el motor de admisión ni siquiera podría
 * aceptar.
 */

import { describe, expect, it } from "vitest";
import {
  decidirRestauracion,
  VENTANA_MS,
  type CarritoGuardado,
} from "@/core/carrito-guardado";

const AHORA = 1_800_000_000_000;

function guardado(p: Partial<CarritoGuardado> = {}): CarritoGuardado {
  return {
    slug: "central",
    carrito: { p1: 2 },
    guardadoEn: AHORA - 60_000,
    ...p,
  };
}

describe("cuándo NO se restaura", () => {
  it("sin nada guardado", () => {
    expect(decidirRestauracion(null, "central", AHORA)).toEqual({ tipo: "NADA" });
  });

  it("si es de OTRO comercio", () => {
    // Restaurar el carrito de la cafetería dentro del menú del comedor
    // mezclaría dos pedidos que nunca podrían confirmarse juntos.
    const r = decidirRestauracion(guardado({ slug: "jaguar" }), "central", AHORA);
    expect(r.tipo).toBe("NADA");
  });

  it("si el carrito guardado está vacío", () => {
    expect(decidirRestauracion(guardado({ carrito: {} }), "central", AHORA).tipo).toBe(
      "NADA",
    );
  });

  it("si todas las cantidades son cero o basura", () => {
    const r = decidirRestauracion(
      guardado({ carrito: { a: 0, b: -3, c: NaN } }),
      "central",
      AHORA,
    );
    expect(r.tipo).toBe("NADA");
  });
});

describe("la ventana de tiempo", () => {
  it("dentro de la ventana se restaura y dice cuánto pasó", () => {
    const r = decidirRestauracion(
      guardado({ guardadoEn: AHORA - 25 * 60_000 }),
      "central",
      AHORA,
    );
    expect(r).toMatchObject({ tipo: "RESTAURAR", minutos: 25 });
  });

  it("justo en el límite todavía vale", () => {
    const r = decidirRestauracion(
      guardado({ guardadoEn: AHORA - VENTANA_MS }),
      "central",
      AHORA,
    );
    expect(r.tipo).toBe("RESTAURAR");
  });

  it("un minuto después ya no", () => {
    // Ofrecer "¿seguimos con tu pedido?" al día siguiente es el sistema
    // hablando de algo que la persona ya olvidó.
    const r = decidirRestauracion(
      guardado({ guardadoEn: AHORA - VENTANA_MS - 60_000 }),
      "central",
      AHORA,
    );
    expect(r.tipo).toBe("VENCIDO");
  });

  it("una marca de tiempo del futuro se trata como vencida", () => {
    // Solo puede venir de un reloj movido o de un dato manipulado. Descartar
    // es el lado seguro: restaurarlo sería confiar en una fecha imposible.
    const r = decidirRestauracion(
      guardado({ guardadoEn: AHORA + 60_000 }),
      "central",
      AHORA,
    );
    expect(r.tipo).toBe("VENCIDO");
  });
});
