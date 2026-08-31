/**
 * Conveniencia por zona.
 *
 * Lo que se prueba es que "cerca" nunca gane a "se puede pedir". Un comercio
 * cerrado a diez metros no es una opción, y ponerlo primero le hace perder un
 * toque a alguien que tiene veinte minutos de receso.
 */

import { describe, expect, it } from "vitest";
import {
  ordenarPorConveniencia,
  zonaDe,
  zonasDisponibles,
  type ComercioUbicado,
} from "@/core/cercania";

function c(
  nombre: string,
  ubicacion: string | null,
  minutosParaListo: number | null = 10,
  estado = "ABIERTO",
): ComercioUbicado {
  return { nombre, slug: nombre.toLowerCase(), ubicacion, estado, minutosParaListo };
}

describe("la zona de una ubicación", () => {
  it("se queda con lo que va antes del separador", () => {
    // "planta baja" sirve para llegar al mostrador, no para elegir comercio.
    expect(zonaDe("Edificio A · planta baja")).toBe("Edificio A");
    expect(zonaDe("Biblioteca, primer piso")).toBe("Biblioteca");
  });

  it("una ubicación simple es su propia zona", () => {
    expect(zonaDe("Edificio C")).toBe("Edificio C");
  });

  it("sin ubicación no hay zona", () => {
    expect(zonaDe(null)).toBeNull();
    expect(zonaDe("   ")).toBeNull();
  });
});

describe("zonas disponibles", () => {
  it("no repite y ordena en español", () => {
    const z = zonasDisponibles([
      c("Uno", "Edificio C · fondo"),
      c("Dos", "Biblioteca · piso 1"),
      c("Tres", "Edificio C · frente"),
    ]);
    expect(z).toEqual(["Biblioteca", "Edificio C"]);
  });

  it("ignora los comercios sin ubicación declarada", () => {
    expect(zonasDisponibles([c("Uno", null)])).toEqual([]);
  });
});

describe("orden por conveniencia", () => {
  it("poder pedir gana a estar cerca", () => {
    // Lo importante de toda la función. Un cerrado en tu edificio sigue siendo
    // un viaje perdido.
    const r = ordenarPorConveniencia(
      [
        c("Cerrado", "Edificio A", null, "CERRADO"),
        c("Lejos", "Biblioteca", 12),
      ],
      "Edificio A",
    );
    expect(r.map((x) => x.nombre)).toEqual(["Lejos", "Cerrado"]);
  });

  it("abierto pero sin horas cuenta como no disponible", () => {
    // Se ve abierto y no tiene ni una franja: entrar ahí es descubrir que no
    // se puede pedir nada.
    const r = ordenarPorConveniencia(
      [c("SinHoras", "Edificio A", null), c("ConHoras", "Biblioteca", 20)],
      "Edificio A",
    );
    expect(r[0]?.nombre).toBe("ConHoras");
  });

  it("entre disponibles, gana tu zona", () => {
    const r = ordenarPorConveniencia(
      [c("Lejos", "Biblioteca", 8), c("Cerca", "Edificio A", 15)],
      "Edificio A",
    );
    expect(r[0]?.nombre).toBe("Cerca");
  });

  it("empatados en zona, gana el que está listo antes", () => {
    const r = ordenarPorConveniencia(
      [c("Lento", "Edificio A", 25), c("Rápido", "Edificio A", 9)],
      "Edificio A",
    );
    expect(r[0]?.nombre).toBe("Rápido");
  });

  it("sin zona elegida el orden sigue siendo útil", () => {
    const r = ordenarPorConveniencia(
      [c("Lento", "X", 30), c("Cerrado", "Y", null, "CERRADO"), c("Rápido", "Z", 5)],
      null,
    );
    expect(r.map((x) => x.nombre)).toEqual(["Rápido", "Lento", "Cerrado"]);
  });

  it("no muta la lista que recibe", () => {
    const lista = [c("B", "X", 20), c("A", "X", 5)];
    ordenarPorConveniencia(lista, null);
    expect(lista[0]?.nombre).toBe("B");
  });
});
