/**
 * Quién canceló el pedido.
 *
 * Salió de un caso real: cuando la cocina cancelaba, el estudiante leía "lo
 * cancelaste antes de que la cocina empezara". Decirle a alguien que hizo algo
 * que no hizo es peor que no explicar nada — y el motivo real ya estaba
 * guardado, solo que no llegaba a ninguna pantalla.
 */

import { describe, expect, it } from "vitest";
import { leerCancelacion, type EventoCancelacion } from "@/core/cancelacion";

const DUENO = "u-estudiante";
const COCINA = "u-cocina";

const ev = (
  estado: string,
  actorId: string | null = null,
  nota: string | null = null,
): EventoCancelacion => ({ estado, actorId, nota });

describe("sin cancelación", () => {
  it("un pedido que siguió su curso devuelve null", () => {
    expect(
      leerCancelacion([ev("RECIBIDO", DUENO), ev("LISTO", COCINA)], DUENO),
    ).toBeNull();
  });

  it("sin eventos, null", () => {
    expect(leerCancelacion([], DUENO)).toBeNull();
  });
});

describe("quién canceló", () => {
  it("el propio estudiante", () => {
    expect(leerCancelacion([ev("CANCELADO", DUENO)], DUENO)).toEqual({
      quien: "USUARIO",
      motivo: null,
    });
  });

  it("el comercio, con su motivo", () => {
    expect(
      leerCancelacion(
        [ev("CANCELADO", COCINA, "Se agotó un producto del pedido")],
        DUENO,
      ),
    ).toEqual({ quien: "COMERCIO", motivo: "Se agotó un producto del pedido" });
  });

  it("cualquiera que no sea el dueño cuenta como el comercio", () => {
    // Para el estudiante la distinción entre cocina y administrador no existe:
    // alguien del otro lado del mostrador canceló su pedido.
    expect(
      leerCancelacion([ev("CANCELADO", "u-admin", "Equipo averiado")], DUENO)
        ?.quien,
    ).toBe("COMERCIO");
  });

  it("sin actor es el barrido automático, no el estudiante", () => {
    // Nadie lo decidió: se venció. Decirle "lo cancelaste" sería falso.
    expect(leerCancelacion([ev("CANCELADO", null)], DUENO)?.quien).toBe(
      "SISTEMA",
    );
  });
});

describe("el motivo", () => {
  it("una nota del propio estudiante no se muestra", () => {
    // No le explica nada que no sepa.
    expect(
      leerCancelacion([ev("CANCELADO", DUENO, "cambié de idea")], DUENO)?.motivo,
    ).toBeNull();
  });

  it("un motivo en blanco es lo mismo que no tenerlo", () => {
    expect(
      leerCancelacion([ev("CANCELADO", COCINA, "   ")], DUENO)?.motivo,
    ).toBeNull();
  });
});

describe("bordes", () => {
  it("con dos cancelaciones vale la última", () => {
    expect(
      leerCancelacion(
        [ev("CANCELADO", DUENO), ev("CANCELADO", COCINA, "Se dañó un equipo")],
        DUENO,
      ),
    ).toEqual({ quien: "COMERCIO", motivo: "Se dañó un equipo" });
  });

  it("se decide por dueño y no por rol, que puede cambiar después", () => {
    // Si mañana esa cuenta deja de ser del comercio, el hecho de que no era el
    // dueño del pedido sigue siendo cierto.
    expect(
      leerCancelacion([ev("CANCELADO", COCINA, "Se agotó")], DUENO)?.quien,
    ).toBe("COMERCIO");
  });
});
