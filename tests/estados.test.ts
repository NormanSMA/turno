import { describe, expect, it } from "vitest";
import {
  correspondeNoShow,
  esTerminal,
  evaluarCumplimiento,
  exigirTransicion,
  ocupaCapacidad,
  puedeCancelar,
  puedeTransicionar,
  TransicionInvalida,
  type EstadoPedido,
} from "@/core/estados";

const TODOS: EstadoPedido[] = [
  "RECIBIDO",
  "EN_PREPARACION",
  "LISTO",
  "RETIRADO",
  "NO_SHOW",
  "CANCELADO",
];

describe("máquina de estados del pedido", () => {
  it("recorre el camino feliz completo", () => {
    expect(puedeTransicionar("RECIBIDO", "EN_PREPARACION")).toBe(true);
    expect(puedeTransicionar("EN_PREPARACION", "LISTO")).toBe(true);
    expect(puedeTransicionar("LISTO", "RETIRADO")).toBe(true);
  });

  it("rechaza saltarse la preparación", () => {
    expect(puedeTransicionar("RECIBIDO", "LISTO")).toBe(false);
  });

  it("rechaza retroceder desde un estado terminal", () => {
    expect(puedeTransicionar("RETIRADO", "EN_PREPARACION")).toBe(false);
    expect(puedeTransicionar("NO_SHOW", "RETIRADO")).toBe(false);
    expect(puedeTransicionar("CANCELADO", "RECIBIDO")).toBe(false);
  });

  it("ningún estado terminal tiene salida", () => {
    for (const e of ["RETIRADO", "NO_SHOW", "CANCELADO"] as EstadoPedido[]) {
      expect(esTerminal(e)).toBe(true);
      for (const d of TODOS) expect(puedeTransicionar(e, d)).toBe(false);
    }
  });

  it("ningún estado transiciona hacia sí mismo", () => {
    for (const e of TODOS) expect(puedeTransicionar(e, e)).toBe(false);
  });

  it("exigirTransicion lanza un error explicativo", () => {
    expect(() => exigirTransicion("RETIRADO", "EN_PREPARACION")).toThrow(
      TransicionInvalida,
    );
    expect(() => exigirTransicion("RECIBIDO", "EN_PREPARACION")).not.toThrow();
  });

  it("solo los estados no terminales ocupan capacidad", () => {
    expect(ocupaCapacidad("RECIBIDO")).toBe(true);
    expect(ocupaCapacidad("EN_PREPARACION")).toBe(true);
    expect(ocupaCapacidad("LISTO")).toBe(true);
    expect(ocupaCapacidad("CANCELADO")).toBe(false);
    // NO_SHOW no ocupa capacidad futura, pero la consumió: el pedido se cocinó.
    expect(ocupaCapacidad("NO_SHOW")).toBe(false);
  });
});

describe("quién puede cancelar", () => {
  it("el usuario solo cancela antes de que la cocina empiece", () => {
    expect(puedeCancelar("RECIBIDO", "USUARIO")).toBe(true);
    expect(puedeCancelar("EN_PREPARACION", "USUARIO")).toBe(false);
    expect(puedeCancelar("LISTO", "USUARIO")).toBe(false);
  });

  it("el comercio sí puede cancelar en preparación", () => {
    expect(puedeCancelar("EN_PREPARACION", "COMERCIO")).toBe(true);
  });

  it("nadie cancela un pedido ya retirado", () => {
    expect(puedeCancelar("RETIRADO", "ADMIN")).toBe(false);
  });
});

describe("cumplimiento de la promesa — indicador 2", () => {
  const finFranja = new Date("2026-09-01T12:10:00Z");
  const dentro = new Date("2026-09-01T12:08:00Z");
  const fuera = new Date("2026-09-01T12:15:00Z");

  it("listo antes del fin de la franja = CUMPLIDO", () => {
    expect(
      evaluarCumplimiento({
        estado: "LISTO",
        listoEn: dentro,
        finFranja,
        ahora: dentro,
      }),
    ).toBe("CUMPLIDO");
  });

  it("listo exactamente al fin de la franja = CUMPLIDO (borde inclusivo)", () => {
    expect(
      evaluarCumplimiento({
        estado: "LISTO",
        listoEn: finFranja,
        finFranja,
        ahora: finFranja,
      }),
    ).toBe("CUMPLIDO");
  });

  it("listo después = INCUMPLIDO, aunque después se retire normalmente", () => {
    expect(
      evaluarCumplimiento({
        estado: "RETIRADO",
        listoEn: fuera,
        finFranja,
        ahora: fuera,
      }),
    ).toBe("INCUMPLIDO");
  });

  it("todavía en preparación y la franja no venció = PENDIENTE", () => {
    expect(
      evaluarCumplimiento({
        estado: "EN_PREPARACION",
        listoEn: null,
        finFranja,
        ahora: dentro,
      }),
    ).toBe("PENDIENTE");
  });

  it("en preparación con la franja ya vencida = INCUMPLIDO", () => {
    // El caso que un contador ingenuo perdería: el estado operacional sigue
    // siendo EN_PREPARACION, pero la promesa ya falló.
    expect(
      evaluarCumplimiento({
        estado: "EN_PREPARACION",
        listoEn: null,
        finFranja,
        ahora: fuera,
      }),
    ).toBe("INCUMPLIDO");
  });

  it("cancelado a tiempo no cuenta ni a favor ni en contra", () => {
    expect(
      evaluarCumplimiento({
        estado: "CANCELADO",
        listoEn: null,
        finFranja,
        ahora: dentro,
      }),
    ).toBe("NO_APLICA");
  });

  it("cancelado después de vencida la promesa cuenta como incumplido", () => {
    expect(
      evaluarCumplimiento({
        estado: "CANCELADO",
        listoEn: null,
        finFranja,
        ahora: fuera,
      }),
    ).toBe("INCUMPLIDO");
  });
});

describe("regla de NO_SHOW", () => {
  const listoEn = new Date("2026-09-01T12:00:00Z");

  it("no aplica antes del umbral", () => {
    expect(
      correspondeNoShow({
        estado: "LISTO",
        listoEn,
        minutosNoShow: 20,
        ahora: new Date("2026-09-01T12:19:00Z"),
      }),
    ).toBe(false);
  });

  it("aplica exactamente en el umbral", () => {
    expect(
      correspondeNoShow({
        estado: "LISTO",
        listoEn,
        minutosNoShow: 20,
        ahora: new Date("2026-09-01T12:20:00Z"),
      }),
    ).toBe(true);
  });

  it("se mide desde listoEn, no desde el fin de la franja", () => {
    // Si el comercio se atrasó, el reloj del usuario no arranca antes de que
    // el pedido exista físicamente.
    const listoTarde = new Date("2026-09-01T12:30:00Z");
    expect(
      correspondeNoShow({
        estado: "LISTO",
        listoEn: listoTarde,
        minutosNoShow: 20,
        ahora: new Date("2026-09-01T12:40:00Z"),
      }),
    ).toBe(false);
  });

  it("no aplica a un pedido que nunca estuvo listo", () => {
    expect(
      correspondeNoShow({
        estado: "EN_PREPARACION",
        listoEn: null,
        minutosNoShow: 20,
        ahora: new Date("2026-09-01T14:00:00Z"),
      }),
    ).toBe(false);
  });
});
