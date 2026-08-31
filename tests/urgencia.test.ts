/**
 * Urgencia de un pedido.
 *
 * Lo que se prueba no es la aritmética de restar fechas: es que el aviso llegue
 * cuando todavía SIRVE. Un sistema que avisa "perdiste el pedido" después de
 * perderlo cumple con la verdad y falla con el usuario.
 */

import { describe, expect, it } from "vitest";
import {
  estadoTemporal,
  prioridadCocina,
  UMBRAL_PRONTO,
} from "@/core/urgencia";

const T0 = new Date("2026-03-10T12:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

function pedido(p: Partial<Parameters<typeof estadoTemporal>[0]> = {}) {
  return estadoTemporal({
    estado: "CONFIRMADO",
    franjaInicio: min(60),
    franjaFin: min(70),
    listoEn: null,
    minutosNoShow: 15,
    ahora: T0,
    ...p,
  });
}

describe("antes de que abra la ventana", () => {
  it("con una hora por delante no apura a nadie", () => {
    expect(pedido().urgencia).toBe("TRANQUILO");
    expect(pedido().minutosParaRetirar).toBe(60);
  });

  it("avisa cuando entra en la ventana de aviso", () => {
    const r = pedido({ franjaInicio: min(UMBRAL_PRONTO), franjaFin: min(25) });
    expect(r.urgencia).toBe("PRONTO");
  });

  it("un minuto antes del umbral todavía está tranquilo", () => {
    // El borde importa: si el aviso se adelanta, deja de significar "salí ya".
    const r = pedido({
      franjaInicio: min(UMBRAL_PRONTO + 1),
      franjaFin: min(26),
    });
    expect(r.urgencia).toBe("TRANQUILO");
  });
});

describe("dentro y después de la ventana", () => {
  it("con la ventana abierta el estado es AHORA", () => {
    const r = pedido({ franjaInicio: min(-2), franjaFin: min(8) });
    expect(r.urgencia).toBe("AHORA");
    expect(r.minutosParaRetirar).toBe(-2);
  });

  it("pasada la ventana y sin cocinar, está vencido", () => {
    const r = pedido({ franjaInicio: min(-30), franjaFin: min(-20) });
    expect(r.urgencia).toBe("VENCIDO");
  });
});

describe("cuando ya está listo", () => {
  it("recién marcado no mete presión", () => {
    const r = pedido({ estado: "LISTO", listoEn: min(-1) });
    expect(r.urgencia).toBe("AHORA");
    expect(r.minutosEsperando).toBe(1);
  });

  it("a los cinco minutos empieza a avisar", () => {
    const r = pedido({ estado: "LISTO", listoEn: min(-5) });
    expect(r.urgencia).toBe("ESPERANDO");
  });

  it("avisa fuerte ANTES del no-show, no después", () => {
    // Con 15 min de margen, el aviso fuerte entra a los 10 esperando: quedan 5
    // para llegar. Avisar en el minuto 15 sería avisar cuando ya se perdió.
    const r = pedido({ estado: "LISTO", listoEn: min(-10), minutosNoShow: 15 });
    expect(r.urgencia).toBe("EN_RIESGO");
    expect(r.minutosAntesDeNoShow).toBe(5);
  });

  it("con margen corto sigue habiendo al menos tres minutos de aviso", () => {
    // Un comercio con no-show de 5 min no puede dejar el aviso en 1.6 minutos:
    // nadie cruza un campus en ese tiempo.
    const r = pedido({ estado: "LISTO", listoEn: min(-2), minutosNoShow: 5 });
    expect(r.urgencia).toBe("EN_RIESGO");
  });
});

describe("pedidos ya cerrados", () => {
  it.each(["RETIRADO", "CANCELADO", "NO_SHOW"])(
    "%s no tiene urgencia aunque la ventana haya pasado",
    (estado) => {
      // Pintar "apurate" sobre algo terminado es ruido, y peor: sugiere que
      // todavía se puede hacer algo.
      const r = pedido({ estado, franjaInicio: min(-99), franjaFin: min(-90) });
      expect(r.urgencia).toBe("TRANQUILO");
    },
  );
});

describe("prioridad de la cocina", () => {
  const cocina = (p: Partial<Parameters<typeof prioridadCocina>[0]> = {}) =>
    prioridadCocina({
      estado: "CONFIRMADO",
      franjaFin: min(30),
      ahora: T0,
      cargaMin: 8,
      ...p,
    });

  it("con tiempo de sobra no marca nada", () => {
    expect(cocina().prioridad).toBe("NORMAL");
  });

  it("pasada la promesa, está atrasado", () => {
    const r = cocina({ franjaFin: min(-5) });
    expect(r.prioridad).toBe("ATRASADO");
    expect(r.minutosParaPrometido).toBe(-5);
  });

  it("el umbral depende del pedido, no de un número fijo", () => {
    // El mismo instante: al almuerzo pesado ya no le sobra tiempo, al café sí.
    // Un umbral fijo los trataría igual y la cocina dejaría de creerle al aviso.
    expect(cocina({ franjaFin: min(10), cargaMin: 12 }).prioridad).toBe(
      "URGENTE",
    );
    expect(cocina({ franjaFin: min(10), cargaMin: 3 }).prioridad).toBe("NORMAL");
  });

  it("lo que ya salió de la cocina nunca urge", () => {
    // Un pedido LISTO y sin retirar es problema del mostrador, no del fuego.
    expect(cocina({ estado: "LISTO", franjaFin: min(-40) }).prioridad).toBe(
      "NORMAL",
    );
  });
});
