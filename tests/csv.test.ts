/**
 * Serialización CSV.
 *
 * Un CSV mal escapado no falla: miente. Una coma en un texto libre corre las
 * columnas siguientes y el análisis sale mal sin que nadie lo note, que es
 * exactamente lo que hacía el export anterior.
 */

import { describe, expect, it } from "vitest";
import { aCsv, campo, fila, nombreArchivo } from "@/core/csv";

describe("escape de un valor", () => {
  it("lo que no necesita comillas no las lleva", () => {
    // Entrecomillar todo es válido, pero estos archivos se leen a ojo.
    expect(campo("central")).toBe("central");
    expect(campo(42)).toBe("42");
  });

  it("una coma obliga a entrecomillar", () => {
    // El bug real: `canalCaptacion` es texto libre.
    expect(campo("afiche, pasillo B")).toBe('"afiche, pasillo B"');
  });

  it("las comillas se duplican, no se borran", () => {
    expect(campo('dijo "sí"')).toBe('"dijo ""sí"""');
  });

  it("un salto de línea no parte la fila", () => {
    expect(campo("línea uno\nlínea dos")).toBe('"línea uno\nlínea dos"');
  });

  it("los espacios de los bordes se conservan entrecomillando", () => {
    // Sin comillas, un lector los recorta y el dato cambia en silencio.
    expect(campo("  hola  ")).toBe('"  hola  "');
  });
});

describe("valores vacíos y raros", () => {
  it("null y undefined salen vacíos, no como texto", () => {
    // `String(null)` daría "null" en una celda, que se lee como un dato.
    expect(campo(null)).toBe("");
    expect(campo(undefined)).toBe("");
  });

  it("NaN e Infinity salen vacíos", () => {
    // No son números que una hoja de cálculo entienda; vacío es lo que
    // realmente significan.
    expect(campo(NaN)).toBe("");
    expect(campo(Infinity)).toBe("");
  });

  it("una fecha sale en ISO", () => {
    expect(campo(new Date("2026-03-10T12:00:00.000Z"))).toBe(
      "2026-03-10T12:00:00.000Z",
    );
  });

  it("el cero es un dato, no un vacío", () => {
    expect(campo(0)).toBe("0");
  });
});

describe("el archivo", () => {
  it("empieza con BOM para que Excel no rompa los acentos", () => {
    // Sin BOM, "Cafetería" se abre como "CafeterÃ­a" en Windows.
    const salida = aCsv(["a"], [["Cafetería"]]);
    expect(salida.charCodeAt(0)).toBe(0xfeff);
  });

  it("separa filas con CRLF, como pide el RFC", () => {
    const salida = aCsv(["a", "b"], [[1, 2]]);
    expect(salida).toBe("﻿a,b\r\n1,2\r\n");
  });

  it("con una sola fila de encabezados sigue siendo válido", () => {
    expect(aCsv(["a"], [])).toBe("﻿a\r\n");
  });
});

describe("fila", () => {
  it("escapa cada valor por separado", () => {
    expect(fila(["ok", "con, coma", null])).toBe('ok,"con, coma",');
  });
});

describe("nombre del archivo", () => {
  it("lleva el rango, para que dos descargas no se pisen", () => {
    // Sin rango, la carpeta de descargas termina con "turno-pedidos (3).csv"
    // y nadie sabe cuál es de qué período.
    const n = nombreArchivo(
      "pedidos",
      new Date("2026-03-01T00:00:00Z"),
      new Date("2026-03-08T00:00:00Z"),
    );
    expect(n).toBe("turno-pedidos-2026-03-01_2026-03-08.csv");
  });
});
