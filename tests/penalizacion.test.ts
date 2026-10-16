import { describe, expect, it } from "vitest";
import { evaluarPenalizacion } from "@/core/penalizacion";

const DIA = 86_400_000;
const ahora = new Date("2026-10-15T12:00:00Z");
const hace = (dias: number) => new Date(ahora.getTime() - dias * DIA);

describe("evaluarPenalizacion", () => {
  it("sin eventos no bloquea", () => {
    expect(evaluarPenalizacion([], ahora)).toEqual({ bloqueado: false });
  });

  it("2 no-shows no bloquean", () => {
    expect(evaluarPenalizacion([hace(1), hace(2)], ahora)).toEqual({
      bloqueado: false,
    });
  });

  it("3 no-shows bloquean", () => {
    const r = evaluarPenalizacion([hace(1), hace(2), hace(3)], ahora);
    expect(r.bloqueado).toBe(true);
    if (r.bloqueado) expect(r.noShowsRecientes).toBe(3);
  });

  it("si el tercero cae fuera de la ventana, desbloquea", () => {
    const r = evaluarPenalizacion([hace(1), hace(2), hace(30)], ahora);
    expect(r).toEqual({ bloqueado: false });
  });

  it("puedePedirEn es la fecha del más antiguo más la ventana", () => {
    const r = evaluarPenalizacion([hace(5), hace(10), hace(20)], ahora);
    expect(r).toEqual({
      bloqueado: true,
      puedePedirEn: new Date(hace(20).getTime() + 30 * DIA),
      noShowsRecientes: 3,
    });
  });
});
