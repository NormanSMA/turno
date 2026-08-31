/**
 * Agrupación del historial.
 *
 * El detalle que importa acá es el huso horario. Nicaragua es UTC−6, así que
 * agrupar por la fecha UTC pondría los pedidos de la tarde bajo el día
 * siguiente — y el historial mostraría un almuerzo del lunes bajo "martes".
 */

import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  resumirHistorial,
  type PedidoHistorial,
} from "@/core/historial";

/** Se construye con hora local para que la prueba diga lo mismo en cualquier máquina. */
function enLocal(anio: number, mes: number, dia: number, hora = 12): string {
  return new Date(anio, mes - 1, dia, hora, 0, 0).toISOString();
}

function p(
  franjaInicio: string,
  extra: Partial<PedidoHistorial> = {},
): PedidoHistorial {
  return {
    id: Math.random().toString(36).slice(2),
    estado: "RETIRADO",
    total: "100",
    franjaInicio,
    ...extra,
  };
}

const AHORA = new Date(2026, 2, 10, 15, 0, 0); // 10 de marzo, 15:00 local

describe("agrupar por día", () => {
  it("sin pedidos no arma grupos", () => {
    expect(agruparPorDia([], AHORA)).toEqual([]);
  });

  it("nombra hoy y ayer en vez de la fecha", () => {
    const g = agruparPorDia(
      [p(enLocal(2026, 3, 10)), p(enLocal(2026, 3, 9))],
      AHORA,
    );
    expect(g.map((x) => x.titulo)).toEqual(["Hoy", "Ayer"]);
  });

  it("junta en un grupo lo del mismo día", () => {
    const g = agruparPorDia(
      [p(enLocal(2026, 3, 10, 8)), p(enLocal(2026, 3, 10, 13))],
      AHORA,
    );
    expect(g).toHaveLength(1);
    expect(g[0]?.pedidos).toHaveLength(2);
  });

  it("un pedido de la tarde NO se va al día siguiente", () => {
    // Con `toISOString()` un pedido de las 19:00 en UTC−6 cae en el día
    // siguiente. Es el error silencioso que este módulo existe para evitar.
    const g = agruparPorDia([p(enLocal(2026, 3, 10, 19))], AHORA);
    expect(g[0]?.titulo).toBe("Hoy");
  });

  it("ordena del más reciente al más viejo", () => {
    const g = agruparPorDia(
      [p(enLocal(2026, 3, 1)), p(enLocal(2026, 3, 10)), p(enLocal(2026, 3, 5))],
      AHORA,
    );
    expect(g.map((x) => x.clave)).toEqual([
      "2026-03-10",
      "2026-03-05",
      "2026-03-01",
    ]);
  });

  it("dentro de un día, también primero lo más reciente", () => {
    const g = agruparPorDia(
      [p(enLocal(2026, 3, 10, 8)), p(enLocal(2026, 3, 10, 14))],
      AHORA,
    );
    expect(g[0]?.pedidos[0]?.franjaInicio).toBe(enLocal(2026, 3, 10, 14));
  });
});

describe("resumen", () => {
  it("solo suma lo que se retiró: lo que no se pagó no se gastó", () => {
    const r = resumirHistorial([
      p(enLocal(2026, 3, 10), { total: "150" }),
      p(enLocal(2026, 3, 9), { total: "200", estado: "CANCELADO" }),
      p(enLocal(2026, 3, 8), { total: "300", estado: "NO_SHOW" }),
    ]);
    expect(r.retirados).toBe(1);
    expect(r.gastado).toBe(150);
    expect(r.sinRetirar).toBe(2);
  });

  it("un total ilegible no rompe la suma", () => {
    const r = resumirHistorial([p(enLocal(2026, 3, 10), { total: "" })]);
    expect(r.gastado).toBe(0);
  });

  it("los pedidos en curso no entran en ninguna cuenta", () => {
    // Todavía no se retiraron ni se perdieron: contarlos en cualquiera de las
    // dos columnas sería adelantar un final que no ocurrió.
    const r = resumirHistorial([
      p(enLocal(2026, 3, 10), { estado: "EN_PREPARACION" }),
    ]);
    expect(r).toEqual({ retirados: 0, gastado: 0, sinRetirar: 0 });
  });
});
