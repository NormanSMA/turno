/**
 * Urgencia de un pedido: cuánto falta y cuánto lleva esperando.
 *
 * Sirve al estudiante (llegar a tiempo evita el no-show) y a la cocina (qué
 * pedido está por incumplir). Reloj inyectado: leer la hora adentro haría la
 * función imposible de probar.
 */

export type Urgencia =
  /** Falta bastante. No hay nada que hacer todavía. */
  | "TRANQUILO"
  /** Se acerca la ventana de retiro: conviene ir yendo. */
  | "PRONTO"
  /** La ventana está abierta ahora mismo. */
  | "AHORA"
  /** Está listo y lleva un rato esperando. */
  | "ESPERANDO"
  /** Lleva demasiado esperando: el comercio podría dejar de conservarlo. */
  | "EN_RIESGO"
  /** Pasó la ventana y no se retiró. */
  | "VENCIDO";

export interface EstadoTemporal {
  urgencia: Urgencia;
  /** Minutos hasta que abra la ventana. Negativo si ya abrió. */
  minutosParaRetirar: number;
  /** Minutos que lleva marcado LISTO. `null` si todavía no lo está. */
  minutosEsperando: number | null;
  /** Minutos que quedan antes de que se declare no-show. `null` si no aplica. */
  minutosAntesDeNoShow: number | null;
}

const MIN = 60_000;

/** Desde cuántos minutos antes se considera que el retiro "se acerca". */
export const UMBRAL_PRONTO = 15;

/** Cuánto puede esperar un pedido listo antes de que convenga avisar. */
export const UMBRAL_ESPERANDO = 5;

/**
 * `minutosNoShow` es el margen del comercio tras `listoEn`. Se usa para avisar
 * ANTES: decirle a alguien que perdió el pedido después no ayuda.
 */
export function estadoTemporal(args: {
  estado: string;
  franjaInicio: Date;
  franjaFin: Date;
  listoEn: Date | null;
  minutosNoShow: number;
  ahora: Date;
}): EstadoTemporal {
  const { estado, franjaInicio, franjaFin, listoEn, minutosNoShow, ahora } =
    args;

  const minutosParaRetirar = Math.round(
    (franjaInicio.getTime() - ahora.getTime()) / MIN,
  );
  const minutosEsperando =
    listoEn === null
      ? null
      : Math.max(0, Math.round((ahora.getTime() - listoEn.getTime()) / MIN));
  const minutosAntesDeNoShow =
    listoEn === null ? null : minutosNoShow - (minutosEsperando ?? 0);

  const base = { minutosParaRetirar, minutosEsperando, minutosAntesDeNoShow };

  // Retirado, cancelado y no-show son finales: "apurate" sobre algo terminado
  // es ruido.
  if (["RETIRADO", "CANCELADO", "NO_SHOW"].includes(estado)) {
    return { ...base, urgencia: "TRANQUILO" };
  }

  if (estado === "LISTO" && minutosEsperando !== null) {
    // El aviso fuerte, con tiempo de llegar: un tercio del margen.
    if ((minutosAntesDeNoShow ?? 0) <= Math.max(3, minutosNoShow / 3)) {
      return { ...base, urgencia: "EN_RIESGO" };
    }
    if (minutosEsperando >= UMBRAL_ESPERANDO) {
      return { ...base, urgencia: "ESPERANDO" };
    }
    return { ...base, urgencia: "AHORA" };
  }

  // Todavía no está listo. Lo que manda es la ventana.
  if (ahora > franjaFin) return { ...base, urgencia: "VENCIDO" };
  if (ahora >= franjaInicio) return { ...base, urgencia: "AHORA" };
  if (minutosParaRetirar <= UMBRAL_PRONTO) {
    return { ...base, urgencia: "PRONTO" };
  }
  return { ...base, urgencia: "TRANQUILO" };
}

/**
 * El mismo tiempo desde la cocina (§29): no "cuándo lo busco" sino "cuándo lo
 * prometí". Una ventana empezada y sin cocinar es un incumplimiento en curso.
 */
export type PrioridadCocina = "NORMAL" | "URGENTE" | "ATRASADO";

export function prioridadCocina(args: {
  estado: string;
  franjaFin: Date;
  ahora: Date;
  /** Minutos que el pedido va a ocupar de cocina. */
  cargaMin: number;
}): { prioridad: PrioridadCocina; minutosParaPrometido: number } {
  const { estado, franjaFin, ahora, cargaMin } = args;
  const minutosParaPrometido = Math.round(
    (franjaFin.getTime() - ahora.getTime()) / MIN,
  );

  // Ya salió de la cocina: no hay nada que apurar.
  if (["LISTO", "RETIRADO", "CANCELADO", "NO_SHOW"].includes(estado)) {
    return { prioridad: "NORMAL", minutosParaPrometido };
  }

  if (minutosParaPrometido < 0) {
    return { prioridad: "ATRASADO", minutosParaPrometido };
  }

  /*
   * Urgente = ya no sobra tiempo. Se compara contra la CARGA y no contra un
   * número fijo: un café de 3 min a diez de su promesa está tranquilo; un
   * almuerzo de 15, no. Un umbral fijo los iguala y quema el aviso.
   */
  if (minutosParaPrometido <= cargaMin) {
    return { prioridad: "URGENTE", minutosParaPrometido };
  }

  return { prioridad: "NORMAL", minutosParaPrometido };
}
