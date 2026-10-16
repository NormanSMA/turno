import { describe, expect, it } from "vitest";
import { aQuery, aRango, leerFiltros } from "@/core/panel-filtros";

const p = (q: string) => new URLSearchParams(q);

describe("leerFiltros", () => {
  it("usa 30 días y todos los comercios por defecto", () => {
    expect(leerFiltros(p(""))).toEqual({ dias: 30, comercio: null });
  });

  it("acepta 7 días", () => {
    expect(leerFiltros(p("dias=7")).dias).toBe(7);
  });

  it("acepta 90 días", () => {
    expect(leerFiltros(p("dias=90")).dias).toBe(90);
  });

  it("acepta un comercio por slug", () => {
    expect(leerFiltros(p("comercio=cafe-central")).comercio).toBe("cafe-central");
  });

  it("descarta valores inválidos", () => {
    expect(leerFiltros(p("dias=15&comercio=Café%20X"))).toEqual({
      dias: 30,
      comercio: null,
    });
    expect(leerFiltros(p("dias=abc")).dias).toBe(30);
    expect(leerFiltros(p("dias=7.5")).dias).toBe(30);
  });
});

describe("aRango", () => {
  it("calcula el rango en UTC", () => {
    const r = aRango({ dias: 7, comercio: null }, new Date("2026-10-15T12:00:00Z"));
    expect(r).toEqual({
      desde: "2026-10-08T12:00:00.000Z",
      hasta: "2026-10-15T12:00:00.000Z",
    });
  });

  it("no supera el máximo de 365 días de la API", () => {
    const r = aRango({ dias: 90, comercio: null }, new Date("2026-10-15T00:00:00Z"));
    expect(Date.parse(r.hasta) - Date.parse(r.desde)).toBe(90 * 86_400_000);
  });
});

describe("aQuery", () => {
  it("omite los defectos y conserva el resto", () => {
    expect(aQuery({ dias: 30, comercio: null })).toBe("");
    expect(aQuery({ dias: 90, comercio: "kiosco" })).toBe("dias=90&comercio=kiosco");
  });
});
