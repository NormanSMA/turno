/**
 * Adaptador puro entre los controles del administrador y el simulador (§15).
 *
 * La pantalla solo pinta. Acá se corrigen los valores fuera de rango, se arma
 * ParametrosSimulacion, se corre el simulador con una rejilla acotada y se
 * redactan las diferencias entre dos escenarios.
 */

import {
  barrer,
  simular,
  volumenSostenible,
  type ParametrosSimulacion,
} from "./simulador";

export interface ControlesAdmin {
  /** Personal en cocina. Capacidad por franja = cocineros x Δ. */
  cocineros: number;
  /** Pedidos que intentan entrar en el día. */
  demanda: number;
  /** Factor de seguridad α. */
  alfa: number;
  /** Minutos de preparación por pedido. */
  minutosPreparacion: number;
}

export const LIMITES = {
  cocineros: { min: 1, max: 12 },
  demanda: { min: 10, max: 300 },
  alfa: { min: 0.5, max: 1 },
  minutosPreparacion: { min: 2, max: 30 },
} as const;

export const CONTROLES_BASE: ControlesAdmin = {
  cocineros: 4,
  demanda: 60,
  alfa: 0.85,
  minutosPreparacion: 8,
};

/** Días y repeticiones fijos: el simulador corre un día completo por pedido. */
const DIAS = 3;
const REPETICIONES = 2;
const MAX_PUNTOS_REJILLA = 4;
const TOPE_DEMANDA_REJILLA = 500;

function acotar(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function normalizarControles(c: ControlesAdmin): ControlesAdmin {
  return {
    cocineros: Math.round(
      acotar(c.cocineros, LIMITES.cocineros.min, LIMITES.cocineros.max),
    ),
    demanda: Math.round(
      acotar(c.demanda, LIMITES.demanda.min, LIMITES.demanda.max),
    ),
    alfa: acotar(c.alfa, LIMITES.alfa.min, LIMITES.alfa.max),
    minutosPreparacion: acotar(
      c.minutosPreparacion,
      LIMITES.minutosPreparacion.min,
      LIMITES.minutosPreparacion.max,
    ),
  };
}

export function adaptarEscenario(controles: ControlesAdmin): ParametrosSimulacion {
  const c = normalizarControles(controles);
  return {
    anchoFranjaMin: 10,
    factorSeguridad: c.alfa,
    personalCocina: c.cocineros,
    aperturaMin: 11 * 60 + 30,
    cierreMin: 13 * 60,
    demandaDiaria: c.demanda,
    productos: [
      { id: "pedido", tiempoPreparacionMin: c.minutosPreparacion, peso: 1 },
    ],
    proporcionB: 0.5,
    adherenciaB: 0.75,
    tasaNoShow: 0.06,
    variabilidadCocina: 0.25,
    margenCutoffMin: 2,
    dias: DIAS,
    semilla: 42,
  };
}

/** Demandas que se barren para estimar el volumen sostenible. Máximo 4. */
export function rejillaDemandas(demanda: number): number[] {
  const valores = [0.5, 1, 2, 4].map((f) =>
    Math.min(TOPE_DEMANDA_REJILLA, Math.max(1, Math.round(demanda * f))),
  );
  return [...new Set(valores)].slice(0, MAX_PUNTOS_REJILLA);
}

export interface Evaluacion {
  controles: ControlesAdmin;
  /** Pedidos atendidos por día. */
  atendidos: number;
  /** Pedidos rechazados por día (sin franja con espacio o fuera de plazo). */
  rechazados: number;
  /** 0 a 1. */
  cumplimiento: number;
  /** Pedidos servidos por día manteniendo 90 % de cumplimiento. */
  volumenSostenible: number | null;
}

export function evaluar(controles: ControlesAdmin): Evaluacion {
  const c = normalizarControles(controles);
  const params = adaptarEscenario(c);
  const r = simular(params);
  const puntos = barrer(params, {
    demandas: rejillaDemandas(c.demanda),
    repeticiones: REPETICIONES,
  });
  const techo = volumenSostenible(puntos, 0.9);
  return {
    controles: c,
    atendidos: r.admitidos / DIAS,
    rechazados: (r.rechazadosPorCapacidad + r.rechazadosPorCutoff) / DIAS,
    cumplimiento: r.tasaCumplimiento,
    volumenSostenible: techo ? techo.servidosPorDia : null,
  };
}

export interface Comparacion {
  atendidos: number;
  rechazados: number;
  /** En puntos porcentuales. */
  cumplimientoPuntos: number;
  volumenSostenible: number | null;
  frases: string[];
}

function pedidos(n: number): string {
  return n === 1 ? "1 pedido" : `${n} pedidos`;
}

function cambios(base: ControlesAdmin, nuevo: ControlesAdmin): string[] {
  const out: string[] = [];
  const dc = nuevo.cocineros - base.cocineros;
  if (dc !== 0) {
    const n = Math.abs(dc);
    out.push(
      `${n} ${n === 1 ? "cocinero" : "cocineros"} ${dc > 0 ? "más" : "menos"}`,
    );
  }
  if (nuevo.demanda !== base.demanda) {
    const pct = Math.round(((nuevo.demanda - base.demanda) / base.demanda) * 100);
    out.push(`${Math.abs(pct)} % de demanda ${pct > 0 ? "más" : "menos"}`);
  }
  if (nuevo.alfa !== base.alfa) {
    out.push(`α en ${nuevo.alfa.toFixed(2).replace(".", ",")}`);
  }
  if (nuevo.minutosPreparacion !== base.minutosPreparacion) {
    out.push(`${nuevo.minutosPreparacion} min de preparación`);
  }
  return out;
}

export function compararEscenarios(base: Evaluacion, nuevo: Evaluacion): Comparacion {
  const atendidos = Math.round(nuevo.atendidos) - Math.round(base.atendidos);
  const rechazados = Math.round(nuevo.rechazados) - Math.round(base.rechazados);
  const volumen =
    base.volumenSostenible === null || nuevo.volumenSostenible === null
      ? null
      : Math.round(nuevo.volumenSostenible) - Math.round(base.volumenSostenible);

  const lista = cambios(base.controles, nuevo.controles);
  const causa = lista.length === 0 ? "" : `Con ${lista.join(", ")} `;
  const verbo = causa === "" ? "Atendés " : "atendés ";
  const dif =
    atendidos === 0
      ? "los mismos pedidos"
      : `${pedidos(Math.abs(atendidos))} ${atendidos > 0 ? "más" : "menos"}`;
  const frases = [`${causa}${verbo}${dif}`.trim() + " por día."];

  if (rechazados !== 0) {
    frases.push(
      `Se rechazan ${pedidos(Math.abs(rechazados))} ${rechazados > 0 ? "más" : "menos"} por día.`,
    );
  }

  return {
    atendidos,
    rechazados,
    cumplimientoPuntos: Math.round((nuevo.cumplimiento - base.cumplimiento) * 100),
    volumenSostenible: volumen,
    frases,
  };
}
