/**
 * El catálogo de carreras.
 *
 * Lo que estas pruebas protegen no es la lista —esa va a cambiar— sino la
 * propiedad que hace que el dato sirva: **dos formas de escribir la misma
 * carrera tienen que contar como una sola**. Sin eso, el campo produce filas
 * que no se pueden agrupar y el análisis de en qué horarios abrir franjas se
 * queda sin base.
 */

import { describe, expect, it } from "vitest";
import {
  CARRERAS,
  NOMBRES_CARRERAS,
  normalizarCarrera,
  reconocerCarrera,
} from "@/core/carreras";

describe("el catálogo", () => {
  it("no tiene nombres repetidos", () => {
    expect(new Set(NOMBRES_CARRERAS).size).toBe(NOMBRES_CARRERAS.length);
  });

  it("cada carrera declara su facultad", () => {
    for (const c of CARRERAS) {
      expect(c.nombre.trim().length, c.nombre).toBeGreaterThan(0);
      expect(c.facultad.trim().length, c.nombre).toBeGreaterThan(0);
    }
  });

  it("tampoco hay dos que solo se distingan por tildes o mayúsculas", () => {
    // Dos entradas que normalizan igual son la misma carrera escrita de dos
    // formas: el desplegable mostraría un duplicado y el análisis las contaría
    // por separado.
    const normalizados = NOMBRES_CARRERAS.map(normalizarCarrera);
    expect(new Set(normalizados).size).toBe(normalizados.length);
  });
});

describe("normalizar para comparar", () => {
  it("ignora tildes, mayúsculas y espacios de más", () => {
    expect(normalizarCarrera("  INGENIERÍA   de Sistemas ")).toBe(
      "ingenieria de sistemas",
    );
  });

  it("deja igual lo que ya está limpio", () => {
    expect(normalizarCarrera("derecho")).toBe("derecho");
  });
});

describe("reconocer lo que alguien escribió", () => {
  it("encuentra la carrera aunque se haya tecleado distinto", () => {
    expect(reconocerCarrera("INGENIERIA DE SISTEMAS")?.nombre).toBe(
      "Ingeniería de Sistemas",
    );
    expect(reconocerCarrera("  odontología ")?.nombre).toBe("Odontología");
  });

  it("devuelve null para lo que no está en el catálogo", () => {
    // Y eso NO es un error: el campo acepta cualquier texto a propósito. Un
    // `null` acá significa "esta carrera le falta al catálogo", que es
    // información útil, no una validación fallida.
    expect(reconocerCarrera("Ingeniería Aeroespacial")).toBeNull();
  });

  it("un campo vacío no reconoce nada y no revienta", () => {
    expect(reconocerCarrera(null)).toBeNull();
    expect(reconocerCarrera("")).toBeNull();
    expect(reconocerCarrera("   ")).toBeNull();
  });
});
