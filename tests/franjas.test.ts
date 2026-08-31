import { describe, expect, it } from "vitest";
import { generarFranjas } from "@/core/franjas";

const inicio = new Date("2026-09-01T11:30:00.000Z");
const fin = new Date("2026-09-01T13:00:00.000Z");

describe("generación de franjas (Δ y C(f))", () => {
  it("parte la ventana de servicio en franjas de ancho Δ", () => {
    const f = generarFranjas({ inicio, fin, anchoMin: 10, personalCocina: 2 });
    expect(f).toHaveLength(9);
    expect(f[0].inicio).toEqual(inicio);
    expect(f.at(-1)!.fin).toEqual(fin);
  });

  it("C(f) = personal × Δ", () => {
    const f = generarFranjas({ inicio, fin, anchoMin: 10, personalCocina: 2 });
    expect(f[0].capacidadMinutos).toBe(20);
  });

  it("Δ más angosto produce más franjas de menor capacidad, con el mismo total", () => {
    const anchas = generarFranjas({ inicio, fin, anchoMin: 15, personalCocina: 2 });
    const angostas = generarFranjas({ inicio, fin, anchoMin: 5, personalCocina: 2 });
    const total = (fs: { capacidadMinutos: number }[]) =>
      fs.reduce((a, f) => a + f.capacidadMinutos, 0);
    expect(angostas.length).toBeGreaterThan(anchas.length);
    // El trade-off de Δ (§6.2) no cambia la capacidad total del comercio,
    // cambia la granularidad de la promesa.
    expect(total(angostas)).toBe(total(anchas));
  });

  it("permite sobrescribir C(f) con el throughput medido en calibración", () => {
    const f = generarFranjas({
      inicio,
      fin,
      anchoMin: 10,
      personalCocina: 2,
      capacidadMinutosPorFranja: 14,
    });
    expect(f[0].capacidadMinutos).toBe(14);
  });

  it("no genera una franja parcial al final de la ventana", () => {
    const cortada = new Date("2026-09-01T12:55:00.000Z");
    const f = generarFranjas({
      inicio,
      fin: cortada,
      anchoMin: 10,
      personalCocina: 1,
    });
    expect(f.at(-1)!.fin.getTime()).toBeLessThanOrEqual(cortada.getTime());
  });

  it("rechaza parámetros inválidos", () => {
    expect(() =>
      generarFranjas({ inicio, fin, anchoMin: 0, personalCocina: 1 }),
    ).toThrow();
    expect(() =>
      generarFranjas({ inicio, fin, anchoMin: 10, personalCocina: 0 }),
    ).toThrow();
    expect(() =>
      generarFranjas({ inicio: fin, fin: inicio, anchoMin: 10, personalCocina: 1 }),
    ).toThrow();
  });
});
