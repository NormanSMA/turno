/**
 * El código de retiro: cómo se genera y cómo se compara.
 *
 * Las dos cosas viven juntas porque son la misma decisión vista desde los dos
 * extremos. El alfabeto deja fuera los caracteres que se confunden al leerlos
 * en voz alta o en una pantalla con reflejos —`O`/`0`, `I`/`1`— y quien compara
 * tiene que saber exactamente eso para no "arreglar" una ambigüedad que por
 * construcción no existe. Separarlos invita a que alguien amplíe el alfabeto sin
 * enterarse de que hay un comparador que depende de él.
 */

/**
 * Sin `O`, `0`, `I` ni `1`.
 *
 * El código se dicta en un mostrador con ruido y se teclea con prisa. Un cero y
 * una O son el mismo sonido y casi el mismo dibujo; excluir los dos es más
 * barato que arbitrar entre ellos después.
 */
export const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Longitud del código sin el guion. */
export const LARGO_CODIGO = 6;

/**
 * Normaliza un código para compararlo.
 *
 * El mismo código llega de tres sitios que lo tratan distinto: el QR lo trae
 * tal cual (`ABC-DEF`), quien lo dicta suele omitir el guion, y un lector USB
 * de los que se comportan como teclado puede intercalar espacios. Los tres son
 * el mismo pedido.
 *
 * Se descarta todo lo que no sea letra o dígito en vez de quitar solo el guion:
 * lo segundo deja pasar el espacio, el punto y el guion largo que mete el
 * teclado del móvil al autocorregir.
 */
export function normalizarCodigo(texto: string): string {
  return texto.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** ¿Dos códigos son el mismo, escritos de cualquiera de sus formas? */
export function mismoCodigo(a: string, b: string): boolean {
  const na = normalizarCodigo(a);
  return na.length > 0 && na === normalizarCodigo(b);
}

/**
 * ¿El texto tiene largo de código completo?
 *
 * Sirve para no declarar "no existe" mientras alguien todavía está tecleando:
 * media búsqueda no encuentra nada, y eso no es un fallo que reportar.
 */
export function pareceCompleto(texto: string): boolean {
  return normalizarCodigo(texto).length >= LARGO_CODIGO;
}
