/**
 * "¿Cabe en tu turno?" — el veredicto que se le muestra al estudiante antes de
 * que decida.
 *
 * Lo que estas pruebas protegen es una promesa: que el veredicto coincida con
 * lo que el motor de admisión va a hacer después. Un "cabe" que termina en un
 * error al confirmar es peor que no haber dicho nada.
 */

import { describe, expect, it } from "vitest";
import {
  admite,
  margenDe,
  primeraFranjaLibre,
  textoAccion,
  veredictoDeTurno,
  type FranjaVeredicto,
} from "@/core/cabe";
import { horaCorta } from "@/lib/cliente";

const AHORA = new Date("2026-08-29T12:00:00Z");

const f = (
  franjaId: string,
  holguraMin: number,
  minutosHastaCierre = 30,
): FranjaVeredicto => ({
  franjaId,
  inicio: new Date(AHORA.getTime() + minutosHastaCierre * 60_000).toISOString(),
  holguraMin,
  cierraEn: new Date(
    AHORA.getTime() + minutosHastaCierre * 60_000,
  ).toISOString(),
});

describe("cuándo una franja admite el pedido", () => {
  it("con holgura de sobra y tiempo, sí", () => {
    expect(admite(f("a", 30), 12, AHORA)).toBe(true);
  });

  it("justo en la holgura exacta, sí", () => {
    expect(admite(f("a", 12), 12, AHORA)).toBe(true);
  });

  it("un minuto de holgura por debajo, no", () => {
    expect(admite(f("a", 11), 12, AHORA)).toBe(false);
  });

  it("con holgura pero ya pasado el cierre, no", () => {
    // Tiene lugar, pero ya no da el tiempo de cocina: es justo el caso que el
    // motor rechaza y que la pantalla llegó a prometer.
    expect(admite(f("a", 60, -1), 12, AHORA)).toBe(false);
  });
});

describe("el veredicto", () => {
  it("sin franja elegida no se afirma nada", () => {
    expect(veredictoDeTurno(null, [f("a", 30)], 12, AHORA)).toBeNull();
  });

  it("si cabe, lo dice con la hora", () => {
    const elegida = f("a", 30);
    expect(veredictoDeTurno(elegida, [elegida], 12, AHORA)).toEqual({
      tipo: "CABE",
      inicio: elegida.inicio,
    });
  });

  it("si no cabe, ofrece la primera hora que sí, no la más holgada", () => {
    // El estudiante está en un receso: antes gana a cómodo.
    const elegida = f("a", 5, 20);
    const pronto = f("b", 20, 40);
    const holgada = f("c", 99, 90);
    expect(
      veredictoDeTurno(elegida, [elegida, pronto, holgada], 12, AHORA),
    ).toEqual({ tipo: "NO_CABE", alternativa: pronto });
  });

  it("nunca se ofrece a sí misma como alternativa", () => {
    const elegida = f("a", 5);
    const v = veredictoDeTurno(elegida, [elegida], 12, AHORA);
    expect(v).toEqual({ tipo: "NO_CABE", alternativa: null });
  });

  it("si no queda ninguna, la alternativa es null y no un invento", () => {
    const elegida = f("a", 2);
    expect(
      veredictoDeTurno(elegida, [elegida, f("b", 3), f("c", 1)], 12, AHORA),
    ).toEqual({ tipo: "NO_CABE", alternativa: null });
  });

  it("una alternativa vencida no cuenta como alternativa", () => {
    const elegida = f("a", 2, 40);
    const vencida = f("b", 90, -5);
    expect(
      veredictoDeTurno(elegida, [elegida, vencida], 12, AHORA)?.tipo,
    ).toBe("NO_CABE");
    expect(
      veredictoDeTurno(elegida, [elegida, vencida], 12, AHORA),
    ).toEqual({ tipo: "NO_CABE", alternativa: null });
  });
});

describe("el margen, en palabras", () => {
  it("con la mitad de sobra, holgado", () => {
    expect(margenDe(f("a", 30), 12, AHORA)).toBe("HOLGADO");
  });

  it("apenas por encima de lo que ocupa, justo", () => {
    expect(margenDe(f("a", 13), 12, AHORA)).toBe("JUSTO");
  });

  it("el umbral es relativo al pedido, no un número fijo", () => {
    // 10 minutos de holgura: de sobra para un café de 4, ir justo para un
    // almuerzo de 8.
    expect(margenDe(f("a", 10), 4, AHORA)).toBe("HOLGADO");
    expect(margenDe(f("a", 10), 8, AHORA)).toBe("JUSTO");
  });

  it("lo que no admite el pedido no tiene margen, tiene falta de lugar", () => {
    expect(margenDe(f("a", 3), 12, AHORA)).toBe("SIN_LUGAR");
  });
});

describe("el texto del botón", () => {
  it("nunca queda apagado sin decir por qué", () => {
    // El caso que la regla prohíbe: "Confirmar pedido" en gris.
    for (const e of ["CERRADO", "VACIO", "SIN_HORA", "NO_CABE"] as const) {
      const t = textoAccion(e, "C$ 165.00");
      expect(t.length).toBeGreaterThan(0);
      expect(t).not.toMatch(/confirmar pedido/i);
    }
  });

  it("cuando se puede pedir, lleva el total", () => {
    expect(textoAccion("LISTO", "C$ 165.00")).toBe("Pedir C$ 165.00");
  });
});

describe("franja preseleccionada y texto del botón", () => {
  it("elige la más temprana que admite el carrito", () => {
    const opciones = [f("a", 5), f("b", 20, 40), f("c", 30, 60)];
    expect(primeraFranjaLibre(opciones, 15, AHORA)?.franjaId).toBe("b");
  });

  it("salta las franjas con el cut-off vencido", () => {
    const opciones = [f("a", 30, -5), f("b", 30, 20)];
    expect(primeraFranjaLibre(opciones, 15, AHORA)?.franjaId).toBe("b");
  });

  it("devuelve null si ninguna admite", () => {
    expect(primeraFranjaLibre([f("a", 5)], 15, AHORA)).toBeNull();
    expect(primeraFranjaLibre([], 15, AHORA)).toBeNull();
  });

  it("el botón usa la hora local de Managua de la franja elegida", () => {
    // 18:15Z es 12:15 en Managua (UTC-6, sin horario de verano).
    expect(
      textoAccion("LISTO", "C$ 165.00", horaCorta("2026-08-29T18:15:00Z")),
    ).toBe("Pedir para 12:15");
  });

  it("con hora, el botón dice para cuándo; sin hora, el total", () => {
    expect(textoAccion("LISTO", "C$ 165.00", "12:15")).toBe("Pedir para 12:15");
    expect(textoAccion("LISTO", "C$ 165.00")).toBe("Pedir C$ 165.00");
    expect(textoAccion("SIN_HORA", "C$ 165.00", "12:15")).toBe(
      "Elegí una hora de retiro",
    );
  });
});
