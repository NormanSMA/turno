import { describe, expect, it } from "vitest";
import { avisoLimites } from "@/core/aviso-limites";

const ahora = new Date("2026-10-15T15:00:00.000Z");

describe("avisoLimites", () => {
  it("libre: sin texto", () => {
    expect(avisoLimites({ activos: 0, maximo: 2, bloqueadoHasta: null, ahora })).toEqual({
      nivel: "libre",
      texto: "",
    });
  });

  it("libre con maximo 1 y cero activos: no avisa 'cerca'", () => {
    expect(avisoLimites({ activos: 0, maximo: 1, bloqueadoHasta: null, ahora }).nivel).toBe(
      "libre",
    );
  });

  it("cerca: a un pedido del tope", () => {
    expect(avisoLimites({ activos: 1, maximo: 2, bloqueadoHasta: null, ahora })).toEqual({
      nivel: "cerca",
      texto: "Tenés 1 pedido activo de 2.",
    });
    expect(avisoLimites({ activos: 2, maximo: 3, bloqueadoHasta: null, ahora }).texto).toBe(
      "Tenés 2 pedidos activos de 3.",
    );
  });

  it("lleno: en el tope y por encima", () => {
    const r = avisoLimites({ activos: 2, maximo: 2, bloqueadoHasta: null, ahora });
    expect(r.nivel).toBe("lleno");
    expect(r.texto).toBe("Ya tenés 2 pedidos activos. Retirá uno para pedir otro.");
    expect(avisoLimites({ activos: 5, maximo: 2, bloqueadoHasta: null, ahora }).nivel).toBe(
      "lleno",
    );
    expect(avisoLimites({ activos: 1, maximo: 1, bloqueadoHasta: null, ahora }).texto).toBe(
      "Ya tenés 1 pedido activo. Retirá uno para pedir otro.",
    );
  });

  it("bloqueado: gana sobre lleno y dice la fecha en hora de Managua", () => {
    const r = avisoLimites({
      activos: 2,
      maximo: 2,
      bloqueadoHasta: new Date("2026-11-12T03:00:00.000Z"),
      ahora,
    });
    expect(r.nivel).toBe("bloqueado");
    // 03:00Z es la noche del 11 en Managua (UTC-6).
    expect(r.texto).toBe("Por 3 pedidos sin retirar no podés pedir hasta el 11 de noviembre.");
  });

  it("un bloqueo ya vencido no cuenta", () => {
    const r = avisoLimites({
      activos: 0,
      maximo: 2,
      bloqueadoHasta: new Date(ahora.getTime() - 1),
      ahora,
    });
    expect(r.nivel).toBe("libre");
  });
});
