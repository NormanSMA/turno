import { cabeEnFranja, type FranjaCapacidad } from "./admision";

/**
 * Simulador simple del receso: cuántos pedidos caben y cuántos esperan.
 *
 * Usa la misma regla de admisión del sistema (`cabeEnFranja`, minutos de cocina
 * por α · C(f)); no hay un modelo aparte. Los supuestos van como constantes.
 */

export const FRANJAS_RECESO = 6;
/** Ancho de franja en minutos (Δ). */
export const ANCHO_FRANJA_MIN = 10;
/** α — factor de seguridad. */
export const ALFA = 0.8;
/** Minutos de cocina promedio por pedido. */
export const MIN_POR_PEDIDO = 5;
/** Parte de la demanda que cae en cada franja: el pico está a mitad del receso. */
const PESOS = [0.1, 0.2, 0.3, 0.2, 0.1, 0.1];

export type EstadoSimple = "listo" | "espera" | "error";

export interface FranjaSimple {
  demanda: number;
  caben: number;
  esperan: number;
}

export interface ResultadoSimple {
  franjas: FranjaSimple[];
  caben: number;
  esperan: number;
  estado: EstadoSimple;
}

/** Reparte `total` en enteros según PESOS, sin perder ni sobrar pedidos. */
function repartir(total: number): number[] {
  const base = PESOS.map((p) => Math.floor(total * p));
  let resto = total - base.reduce((a, b) => a + b, 0);
  const orden = PESOS.map((p, i) => ({ i, f: total * p - base[i] })).sort(
    (a, b) => b.f - a.f,
  );
  for (const { i } of orden) {
    if (resto <= 0) break;
    base[i]++;
    resto--;
  }
  return base;
}

export function simularSimple(
  cocineros: number,
  estudiantes: number,
): ResultadoSimple {
  const demandas = repartir(Math.max(0, Math.round(estudiantes)));
  const franjas = demandas.map((demanda): FranjaSimple => {
    const franja: FranjaCapacidad = {
      id: "f",
      inicio: new Date(0),
      fin: new Date(ANCHO_FRANJA_MIN * 60_000),
      capacidadMinutos: Math.max(0, cocineros) * ANCHO_FRANJA_MIN,
      cargaAsignada: 0,
      abierta: true,
    };
    let caben = 0;
    while (caben < demanda && cabeEnFranja(franja, MIN_POR_PEDIDO, ALFA)) {
      franja.cargaAsignada += MIN_POR_PEDIDO;
      caben++;
    }
    return { demanda, caben, esperan: demanda - caben };
  });

  const caben = franjas.reduce((a, f) => a + f.caben, 0);
  const total = franjas.reduce((a, f) => a + f.demanda, 0);
  const esperan = total - caben;
  const estado: EstadoSimple =
    esperan === 0 ? "listo" : esperan > total / 2 ? "error" : "espera";

  return { franjas, caben, esperan, estado };
}
