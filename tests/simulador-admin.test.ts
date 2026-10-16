import { describe, expect, it } from "vitest";
import {
  CONTROLES_BASE,
  adaptarEscenario,
  compararEscenarios,
  evaluar,
  rejillaDemandas,
  type Evaluacion,
} from "@/core/simulador-admin";

const base = evaluar(CONTROLES_BASE);

describe("simulador del administrador", () => {
  it("base contra base da diferencia cero", () => {
    const c = compararEscenarios(base, evaluar(CONTROLES_BASE));
    expect(c.atendidos).toBe(0);
    expect(c.rechazados).toBe(0);
    expect(c.cumplimientoPuntos).toBe(0);
    expect(c.frases[0]).toBe("Atendés los mismos pedidos por día.");
  });

  it("un cocinero más no empeora los pedidos atendidos", () => {
    const nuevo = evaluar({ ...CONTROLES_BASE, cocineros: CONTROLES_BASE.cocineros + 1 });
    const c = compararEscenarios(base, nuevo);
    expect(c.atendidos).toBeGreaterThanOrEqual(0);
    expect(c.rechazados).toBeLessThanOrEqual(0);
  });

  it("30 % más de demanda no mejora el rechazo", () => {
    const nuevo = evaluar({
      ...CONTROLES_BASE,
      demanda: Math.round(CONTROLES_BASE.demanda * 1.3),
    });
    expect(compararEscenarios(base, nuevo).rechazados).toBeGreaterThanOrEqual(0);
  });

  it("corrige α, cocineros y demanda fuera de rango", () => {
    const alto = adaptarEscenario({ ...CONTROLES_BASE, alfa: 3, cocineros: 99 });
    expect(alto.factorSeguridad).toBe(1);
    expect(alto.personalCocina).toBe(12);
    const bajo = adaptarEscenario({ ...CONTROLES_BASE, alfa: -1, demanda: Number.NaN });
    expect(bajo.factorSeguridad).toBe(0.5);
    expect(bajo.demandaDiaria).toBe(10);
  });

  it("la rejilla queda acotada", () => {
    for (const d of [1, 60, 300, 100000]) {
      const r = rejillaDemandas(d);
      expect(r.length).toBeLessThanOrEqual(4);
      expect(Math.max(...r)).toBeLessThanOrEqual(500);
    }
  });

  it("redacta singular y plural", () => {
    const mk = (cocineros: number, atendidos: number): Evaluacion => ({
      controles: { ...CONTROLES_BASE, cocineros },
      atendidos,
      rechazados: 10,
      cumplimiento: 0.9,
      volumenSostenible: 30,
    });
    const uno = compararEscenarios(mk(4, 30), mk(5, 31));
    expect(uno.frases[0]).toBe("Con 1 cocinero más atendés 1 pedido más por día.");
    const dos = compararEscenarios(mk(4, 30), mk(6, 68));
    expect(dos.frases[0]).toBe("Con 2 cocineros más atendés 38 pedidos más por día.");
    const menos = compararEscenarios(mk(4, 30), mk(3, 20));
    expect(menos.frases[0]).toBe("Con 1 cocinero menos atendés 10 pedidos menos por día.");
  });
});
