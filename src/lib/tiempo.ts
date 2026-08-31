/**
 * Cómo se dice el tiempo. Vive en un solo lugar porque si una pantalla dice
 * "78 min" y otra "1 h 18 min", parecen dos cifras distintas.
 */

/** Minutos en la forma más corta que siga siendo clara. */
export function minutosLegibles(n: number): string {
  if (n <= 0) return "menos de un minuto";
  if (n === 1) return "1 minuto";
  if (n < 60) return `${n} minutos`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Tiempo recuperado. Bajo una hora va en minutos: "0 h 40 m" se lee como poca
 * cosa, y cuarenta minutos de recreo no lo son.
 */
export function tiempoRecuperado(minutos: number): string {
  if (minutos < 60) return `${Math.max(0, minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/**
 * A qué equivale, en algo del campus. "3 h 18 m" es cierto pero abstracto;
 * "3 clases enteras" se imagina.
 */
export function equivalenciaDeTiempo(minutos: number): string | null {
  if (minutos < 15) return null;
  if (minutos < 50) return "Casi un receso entero";
  if (minutos < 110) return "Una clase completa";
  const clases = Math.floor(minutos / 55);
  if (clases < 8) return `${clases} clases enteras`;
  const dias = Math.floor(minutos / 300);
  return `${dias} ${dias === 1 ? "día" : "días"} de campus`;
}
