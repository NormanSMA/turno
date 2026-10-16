import { describe, expect, it } from "vitest";
import { personajeParaEstado } from "../src/core/estado-personaje";

describe("personajeParaEstado", () => {
  it("RECIBIDO espera sin gorro", () => {
    expect(personajeParaEstado("RECIBIDO")).toEqual({
      mascota: "espera",
      conGorro: false,
      frase: "La cocina ya tiene tu pedido",
    });
  });
  it("EN_PREPARACION espera con gorro", () => {
    expect(personajeParaEstado("EN_PREPARACION")).toEqual({
      mascota: "espera",
      conGorro: true,
      frase: "Están cocinando tu pedido",
    });
  });
  it("LISTO celebra", () => {
    expect(personajeParaEstado("LISTO")).toEqual({
      mascota: "listo",
      conGorro: false,
      frase: "Tu pedido está listo, pasá a retirarlo",
    });
  });
  it("RETIRADO saluda", () => {
    expect(personajeParaEstado("RETIRADO")).toEqual({
      mascota: "saluda",
      conGorro: false,
      frase: "Retirado. Buen provecho",
    });
  });
  it("NO_SHOW muestra error", () => {
    expect(personajeParaEstado("NO_SHOW")).toEqual({
      mascota: "error",
      conGorro: false,
      frase: "No lo retiraste a tiempo",
    });
  });
  it("CANCELADO muestra error", () => {
    expect(personajeParaEstado("CANCELADO")).toEqual({
      mascota: "error",
      conGorro: false,
      frase: "El pedido se canceló",
    });
  });
});
