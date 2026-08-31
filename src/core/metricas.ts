/**
 * TURNO — Cálculo de los indicadores del piloto (§14.5).
 *
 * Puro sobre filas ya leídas: así los mismos cálculos sirven para el panel en
 * vivo, para el export del Capítulo V y para validar el simulador (§15) contra
 * lo observado. Si el análisis viviera en una consulta SQL del panel, no habría
 * forma de correrlo sobre datos sintéticos.
 */

import { relacionPicoPromedio } from "./admision";

export type CondicionExperimental = "A" | "B";

export interface PedidoMetrica {
  id: string;
  condicionExperimental: CondicionExperimental;
  franjaId: string;
  cargaEstimadaMin: number;
  estado: string;
  cumplimiento: string;
  creadoEn: Date;
  franjaInicio: Date;
  franjaFin: Date;
  listoEn: Date | null;
  retiradoEn: Date | null;
  canalCaptacion: string | null;
}

export interface ResumenCondicion {
  condicion: CondicionExperimental | "TODAS";
  pedidos: number;
  /** Indicador 2 — tasa de cumplimiento de la promesa. Meta ≥ 0.90 */
  tasaCumplimiento: number | null;
  /** Indicador 3 — relación pico/promedio de carga por franja. Menor en B. */
  relacionPicoPromedio: number;
  /** Indicador 4 — tasa de no-show. */
  tasaNoShow: number | null;
  /** Minutos de anticipación con que se hace el pedido. */
  anticipacionMedianaMin: number | null;
  cargaTotalMin: number;
  franjasUsadas: number;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function tasa(numerador: number, denominador: number): number | null {
  return denominador === 0 ? null : numerador / denominador;
}

/** Carga admitida por franja, para la relación pico/promedio. */
export function cargaPorFranja(pedidos: PedidoMetrica[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pedidos) {
    // Un pedido cancelado devolvió su capacidad: no cuenta como carga.
    if (p.estado === "CANCELADO") continue;
    m.set(p.franjaId, (m.get(p.franjaId) ?? 0) + p.cargaEstimadaMin);
  }
  return m;
}

export function resumir(
  pedidos: PedidoMetrica[],
  condicion: CondicionExperimental | "TODAS" = "TODAS",
): ResumenCondicion {
  const sel =
    condicion === "TODAS"
      ? pedidos
      : pedidos.filter((p) => p.condicionExperimental === condicion);

  // El denominador del cumplimiento son los pedidos con veredicto, no todos:
  // incluir los PENDIENTE inflaría artificialmente el incumplimiento al inicio
  // de cada franja, cuando todavía no venció nada.
  const conVeredicto = sel.filter(
    (p) => p.cumplimiento === "CUMPLIDO" || p.cumplimiento === "INCUMPLIDO",
  );
  const cumplidos = conVeredicto.filter((p) => p.cumplimiento === "CUMPLIDO");

  // El denominador del no-show son los que llegaron a estar LISTO: un pedido
  // que nunca se preparó no pudo ser plantado por el usuario.
  const entregables = sel.filter(
    (p) => p.estado === "RETIRADO" || p.estado === "NO_SHOW",
  );
  const noShow = entregables.filter((p) => p.estado === "NO_SHOW");

  const cargas = [...cargaPorFranja(sel).values()];

  const anticipaciones = sel.map(
    (p) => (p.franjaInicio.getTime() - p.creadoEn.getTime()) / 60000,
  );

  return {
    condicion,
    pedidos: sel.length,
    tasaCumplimiento: tasa(cumplidos.length, conVeredicto.length),
    relacionPicoPromedio: relacionPicoPromedio(cargas),
    tasaNoShow: tasa(noShow.length, entregables.length),
    anticipacionMedianaMin: mediana(anticipaciones),
    cargaTotalMin: cargas.reduce((a, b) => a + b, 0),
    franjasUsadas: cargas.length,
  };
}

export interface ComparacionAB {
  a: ResumenCondicion;
  b: ResumenCondicion;
  todas: ResumenCondicion;
  /**
   * Diferencia B − A en pico/promedio. Negativa = B aplanó, como predice §6.4.
   * NULL mientras alguna de las dos condiciones no tenga carga: un delta contra
   * una condición vacía se vería como una hipótesis confirmada cuando en
   * realidad no hay datos. Reportarlo sería el error 10 del instructivo.
   */
  deltaPicoPromedio: number | null;
  /** Diferencia B − A en cumplimiento. Cerca de 0 = B no degradó el servicio. */
  deltaCumplimiento: number | null;
}

export function compararAB(pedidos: PedidoMetrica[]): ComparacionAB {
  const a = resumir(pedidos, "A");
  const b = resumir(pedidos, "B");
  const todas = resumir(pedidos, "TODAS");
  const comparable = a.franjasUsadas > 0 && b.franjasUsadas > 0;
  return {
    a,
    b,
    todas,
    deltaPicoPromedio: comparable
      ? b.relacionPicoPromedio - a.relacionPicoPromedio
      : null,
    deltaCumplimiento:
      a.tasaCumplimiento === null || b.tasaCumplimiento === null
        ? null
        : b.tasaCumplimiento - a.tasaCumplimiento,
  };
}

export interface EmbudoCanal {
  canal: string;
  registros: number;
  activados: number;
  /** Indicador 6 — tasa de activación: se registró y llegó a pedir. */
  tasaActivacion: number | null;
}

/** Embudo del QR (§14.4): registros → primer pedido, por canal de captación. */
export function embudoPorCanal(
  usuarios: { canalCaptacion: string | null; primerPedidoEn: Date | null }[],
): EmbudoCanal[] {
  const m = new Map<string, { registros: number; activados: number }>();
  for (const u of usuarios) {
    const canal = u.canalCaptacion ?? "sin_canal";
    const e = m.get(canal) ?? { registros: 0, activados: 0 };
    e.registros++;
    if (u.primerPedidoEn) e.activados++;
    m.set(canal, e);
  }
  return [...m.entries()]
    .map(([canal, e]) => ({
      canal,
      registros: e.registros,
      activados: e.activados,
      tasaActivacion: tasa(e.activados, e.registros),
    }))
    .sort((x, y) => y.registros - x.registros);
}

/**
 * Tiempo de activación (§11.3): minutos entre registro y primer pedido.
 * Evita malinterpretar el primer día, donde hay muchos registros y pocos
 * pedidos — que es lo esperable, no un fracaso.
 */
export function tiempoActivacionMedianaMin(
  usuarios: { creadoEn: Date; primerPedidoEn: Date | null }[],
): number | null {
  const valores = usuarios
    .filter((u) => u.primerPedidoEn)
    .map((u) => (u.primerPedidoEn!.getTime() - u.creadoEn.getTime()) / 60000);
  return mediana(valores);
}

/**
 * Indicador 1 — tiempo de receso recuperado.
 *
 * Con sistema, el usuario permanece en el comercio solo el retiro. Sin sistema
 * habría permanecido fila + preparación. La línea base (Wq y Ws medidos en la
 * fase 0) entra como parámetro: NO se inventa acá.
 */
export function tiempoRecuperadoMin(args: {
  esperaFilaBaseMin: number;
  preparacionBaseMin: number;
  permanenciaConSistemaMin: number;
}): { recuperadoMin: number; reduccion: number } {
  const sin = args.esperaFilaBaseMin + args.preparacionBaseMin;
  const recuperadoMin = sin - args.permanenciaConSistemaMin;
  return { recuperadoMin, reduccion: sin === 0 ? 0 : recuperadoMin / sin };
}

// ------------------------------------------------------------------ Series ---

export interface PuntoFranja {
  /** Etiqueta de la hora, ya en zona local. */
  hora: string;
  /** Minutos-cocina comprometidos por los pedidos de esta condición. */
  cargaMin: number;
}

/**
 * Carga por hora del día, agregada sobre todos los días del piloto.
 *
 * Es la serie que hace visible el aplanamiento: si la condición B funciona, su
 * curva tiene el mismo área bajo la línea pero el pico más bajo. Comparar horas
 * del día (y no franjas individuales) permite superponer varios días, que es lo
 * que hace falta para que la forma se distinga del ruido de un día suelto.
 */
export function cargaPorHoraDelDia(
  pedidos: PedidoMetrica[],
  condicion: CondicionExperimental | "TODAS" = "TODAS",
  zona = "America/Managua",
): PuntoFranja[] {
  const sel = (
    condicion === "TODAS"
      ? pedidos
      : pedidos.filter((p) => p.condicionExperimental === condicion)
  ).filter((p) => p.estado !== "CANCELADO");

  const fmt = new Intl.DateTimeFormat("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zona,
  });

  const m = new Map<string, number>();
  for (const p of sel) {
    const hora = fmt.format(p.franjaInicio);
    m.set(hora, (m.get(hora) ?? 0) + p.cargaEstimadaMin);
  }
  return [...m.entries()]
    .map(([hora, cargaMin]) => ({ hora, cargaMin }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

export interface PuntoDia {
  /** Fecha ISO corta (YYYY-MM-DD) en zona local. */
  dia: string;
  pedidos: number;
  tasaCumplimiento: number | null;
}

/** Evolución diaria del indicador 2. Permite ver si α quedó bien calibrado. */
export function cumplimientoPorDia(
  pedidos: PedidoMetrica[],
  zona = "America/Managua",
): PuntoDia[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zona,
  });

  const m = new Map<string, { total: number; conVeredicto: number; cumplidos: number }>();
  for (const p of pedidos) {
    const dia = fmt.format(p.franjaInicio);
    const e = m.get(dia) ?? { total: 0, conVeredicto: 0, cumplidos: 0 };
    e.total++;
    if (p.cumplimiento === "CUMPLIDO" || p.cumplimiento === "INCUMPLIDO") {
      e.conVeredicto++;
      if (p.cumplimiento === "CUMPLIDO") e.cumplidos++;
    }
    m.set(dia, e);
  }

  return [...m.entries()]
    .map(([dia, e]) => ({
      dia,
      pedidos: e.total,
      tasaCumplimiento: e.conVeredicto === 0 ? null : e.cumplidos / e.conVeredicto,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}
