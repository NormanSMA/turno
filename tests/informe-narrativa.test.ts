import { describe, expect, it } from "vitest";
import { narrarInforme } from "@/core/informe-narrativa";
import type { Cifras, Ocupacion, PuntoHora } from "@/core/informe";

const cifras = (c: Partial<Cifras> = {}): Cifras => ({
  vendidos: 10,
  ventas: 500,
  ticketPromedio: 50,
  noShows: 0,
  cancelados: 0,
  cumplimiento: 1,
  minutosCocinados: 140,
  ...c,
});
const sinPico: Ocupacion = { promedio: null, pico: null, vacias: 0 };
const conPico: Ocupacion = {
  promedio: 0.5,
  pico: { hora: "12:10", ocupacion: 0.8 },
  vacias: 0,
};
const horas: PuntoHora[] = [
  { hora: "11:00", pedidos: 2, ventas: 100 },
  { hora: "13:00", pedidos: 5, ventas: 300 },
];
const narrar = (
  c: Cifras,
  o: Ocupacion = conPico,
  h: PuntoHora[] = horas,
) =>
  narrarInforme({
    cifras: c,
    ventasPorHora: h,
    ocupacion: o,
    periodoEtiqueta: "Hoy",
  });

describe("narrarInforme", () => {
  it("sin datos devuelve una frase honesta", () => {
    const r = narrar(cifras({ vendidos: 0, minutosCocinados: 0 }), sinPico, []);
    expect(r.tono).toBe("sin-datos");
    expect(r.frases).toEqual(["Todavía no hay pedidos en este período."]);
  });

  it("caso normal cuenta minutos y es tono bien", () => {
    const r = narrar(cifras());
    expect(r.tono).toBe("bien");
    expect(r.frases[0]).toBe("Hoy cocinaste 140 minutos.");
  });

  it("el pico sale de la ocupación", () => {
    expect(narrar(cifras()).frases).toContain("El pico fue a las 12:10.");
  });

  it("sin pico de ocupación usa la hora con más pedidos", () => {
    expect(narrar(cifras(), sinPico).frases).toContain(
      "El pico fue a las 13:00.",
    );
  });

  it("sin pico ni horas no inventa el pico", () => {
    const r = narrar(cifras(), sinPico, []);
    expect(r.frases.some((f) => f.includes("pico"))).toBe(false);
  });

  it("singular de no-show", () => {
    expect(narrar(cifras({ noShows: 1 })).frases).toContain(
      "1 pedido no se retiró.",
    );
  });

  it("plural de no-show", () => {
    expect(narrar(cifras({ noShows: 3 })).frases).toContain(
      "3 pedidos no se retiraron.",
    );
  });

  it("cumplimiento bajo da tono atencion y lo dice", () => {
    const r = narrar(cifras({ cumplimiento: 0.8 }));
    expect(r.tono).toBe("atencion");
    expect(r.frases).toContain("Entregaste a tiempo el 80% de los pedidos.");
  });

  it("sin no-shows no se menciona", () => {
    const r = narrar(cifras());
    expect(r.frases.some((f) => f.includes("retir"))).toBe(false);
  });

  it("ninguna frase pasa de 15 palabras", () => {
    const r = narrar(cifras({ noShows: 3, cumplimiento: 0.5 }));
    for (const f of r.frases) expect(f.split(/\s+/).length).toBeLessThanOrEqual(15);
  });
});
