import { describe, expect, it } from "vitest";
import { simularSimple } from "@/core/simulador-simple";

describe("simularSimple", () => {
  it("todo cabe con 4 cocineros y poca demanda", () => {
    const r = simularSimple(4, 20);
    expect(r.esperan).toBe(0);
    expect(r.caben).toBe(20);
    expect(r.estado).toBe("listo");
  });

  it("más de la mitad no cabe con 1 cocinero y mucha demanda", () => {
    const r = simularSimple(1, 150);
    expect(r.estado).toBe("error");
    expect(r.esperan).toBeGreaterThan(75);
  });

  it("sobra poco: espera", () => {
    const r = simularSimple(4, 60);
    expect(r.esperan).toBeGreaterThan(0);
    expect(r.estado).toBe("espera");
  });

  it("no pierde pedidos y respeta la capacidad por franja", () => {
    const r = simularSimple(3, 97);
    expect(r.caben + r.esperan).toBe(97);
    for (const f of r.franjas) expect(f.caben).toBeLessThanOrEqual(4);
  });
});
