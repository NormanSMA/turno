/**
 * Horas de pared, resueltas sin depender del reloj del servidor.
 *
 * Un comercio dice "abro a las 08:00". Esas 08:00 son de Managua, siempre —
 * son la hora que ve el estudiante en su teléfono y la que el operador escribe
 * en el panel. Pero `new Date("2026-09-01T08:00:00")` y `setHours(8, 0)` las
 * interpretan en **la zona horaria del proceso**, que es la de la máquina donde
 * corre el código.
 *
 * En un portátil en Managua eso funciona por accidente. En una plataforma
 * serverless, que corre en UTC, las 08:00 se convierten en las 02:00 de la
 * madrugada. El sistema no se rompe con un error: genera silenciosamente las
 * franjas de todo un semestre seis horas corridas. Es el modo de fallo más
 * caro de los que tenía este proyecto, porque **no se manifiesta jamás en
 * local**: aparece entero el primer día de producción y parece un problema de
 * datos, no de código.
 *
 * Acá la zona es un dato explícito y el offset se calcula con `Intl`, no se
 * escribe a mano. Nicaragua no usa horario de verano desde 2007, así que hoy
 * son seis horas fijas — pero eso es una política, no una ley física, y
 * hardcodear el `+6` obligaría a recordar este archivo el día que cambie.
 */

/** La zona del campus. Todas las horas de operación son de acá. */
export const ZONA = "America/Managua";

/**
 * Cuánto se aparta la zona del UTC en un instante dado, en milisegundos.
 *
 * Se mide preguntándole a `Intl` qué hora de pared marca la zona en ese
 * instante, y comparándola con la hora UTC. Es el algoritmo canónico para
 * hacer esto sin una librería de fechas.
 */
function desfaseEn(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const v = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "0");

  // `hour12: false` puede dar 24 por medianoche según el motor; 24:00 de un día
  // es 00:00 del siguiente, y `Date.UTC` normaliza ese desbordamiento solo.
  const comoSiFueraUTC = Date.UTC(
    v("year"),
    v("month") - 1,
    v("day"),
    v("hour"),
    v("minute"),
    v("second"),
  );

  return comoSiFueraUTC - instante.getTime();
}

/**
 * El instante real que corresponde a una hora de pared de la zona.
 *
 * `enZona("2026-09-01", 8, 0)` devuelve el `Date` de las 08:00 **en Managua**,
 * que es 14:00 UTC. Da lo mismo dónde corra el proceso.
 *
 * Se resuelve en dos pasos porque el desfase depende del instante y el instante
 * depende del desfase: se toma la hora como si fuera UTC, se mide el desfase
 * que la zona tiene por ahí, y se corrige. Un segundo ajuste cubre el caso de
 * un cambio de horario que caiga justo en medio.
 */
export function enZona(
  fecha: string,
  horas: number,
  minutos: number,
  zona: string = ZONA,
): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  if (!a || !m || !d || [a, m, d, horas, minutos].some((n) => !Number.isFinite(n))) {
    return new Date(NaN);
  }

  const comoUTC = Date.UTC(a, m - 1, d, horas, minutos, 0, 0);
  const primera = new Date(comoUTC - desfaseEn(new Date(comoUTC), zona));
  return new Date(comoUTC - desfaseEn(primera, zona));
}

/**
 * Suma días naturales a una fecha `YYYY-MM-DD`, en el calendario.
 *
 * Sumar 86.400.000 ms al instante no es lo mismo: el día siguiente a las 08:00
 * es las 08:00, aunque en el medio haya habido un cambio de horario que hiciera
 * ese día de 23 o 25 horas. Acá se avanza el calendario y se vuelve a resolver
 * la hora de pared, que es lo que el operador espera cuando pide "las mismas
 * horas, treinta días seguidos".
 */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d! + dias));
  return t.toISOString().slice(0, 10);
}

/** Días naturales entre dos fechas `YYYY-MM-DD`, inclusive. */
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  const t1 = Date.UTC(a1!, m1! - 1, d1!);
  const t2 = Date.UTC(a2!, m2! - 1, d2!);
  return Math.round((t2 - t1) / 86_400_000) + 1;
}
