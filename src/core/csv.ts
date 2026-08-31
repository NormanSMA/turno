/**
 * Serialización CSV, según RFC 4180.
 *
 * Existe porque el export del panel unía valores con comas sin escapar nada, y
 * `canalCaptacion` es texto libre: un solo valor con una coma corre todas las
 * columnas siguientes de esa fila y el análisis del Capítulo V sale mal sin que
 * nadie lo note. Un CSV mal escapado no falla, miente.
 */

/**
 * Un valor, escapado.
 *
 * Se entrecomilla solo cuando hace falta —coma, comilla, salto de línea o
 * espacios en los bordes— porque un archivo con todo entrecomillado es válido
 * pero mucho más difícil de leer a ojo, y estos archivos se abren a ojo.
 */
export function campo(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  const s =
    valor instanceof Date
      ? valor.toISOString()
      : typeof valor === "number"
        ? // `NaN` e `Infinity` no son números que una hoja de cálculo entienda:
          // se van vacíos, que es lo que de verdad significan acá.
          Number.isFinite(valor)
          ? String(valor)
          : ""
        : String(valor);

  const necesita = /[",\n\r]/.test(s) || s !== s.trim();
  return necesita ? `"${s.replace(/"/g, '""')}"` : s;
}

export function fila(valores: readonly unknown[]): string {
  return valores.map(campo).join(",");
}

/**
 * El archivo completo.
 *
 *   - **BOM al principio.** Sin él, Excel en Windows abre el archivo como
 *     ANSI y "Cafetería" aparece como "CafeterÃ­a". El BOM es feo pero es lo
 *     que hace que el archivo se lea bien donde se va a abrir.
 *   - **CRLF entre filas**, que es lo que pide el RFC y lo que menos problemas
 *     da con hojas de cálculo viejas.
 */
export function aCsv(
  encabezados: readonly string[],
  filas: readonly (readonly unknown[])[],
): string {
  return (
    "﻿" + [fila(encabezados), ...filas.map(fila)].join("\r\n") + "\r\n"
  );
}

/**
 * Nombre de archivo con rango, para que dos descargas no se pisen.
 *
 * `turno-pedidos.csv` en la carpeta de descargas se convierte en
 * `turno-pedidos (3).csv` y nadie sabe cuál es de qué período.
 */
export function nombreArchivo(
  base: string,
  desde: Date,
  hasta: Date,
): string {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return `turno-${base}-${d(desde)}_${d(hasta)}.csv`;
}
