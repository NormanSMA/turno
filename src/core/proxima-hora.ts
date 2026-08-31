/**
 * La próxima hora libre de un comercio.
 *
 * Es el tercer dato de la tarjeta de comercio, y el único que no era trivial:
 * los otros dos —estado y ubicación— ya estaban guardados. Este hay que
 * **calcularlo**, y calcularlo con las mismas reglas que aplica la reserva, o
 * la tarjeta promete una hora que el motor de admisión rechaza dos pantallas
 * después. Ya pasó una vez: Explorar decía "listo en ~1 min" porque ignoraba el
 * cut-off.
 *
 * Dos condiciones, las dos de la reserva real:
 *
 *  - **Holgura.** Una franja llena no es una franja disponible. Se compara la
 *    carga comprometida contra `capacidad · factorSeguridad`, que es el mismo
 *    α·C(f) del motor.
 *  - **Alcanzable.** La franja tiene que terminar después de que la cocina
 *    pueda llegar a cumplirla: `ahora + preparación + margen ≤ fin(f)`.
 *
 * El tiempo de preparación que se usa es el del producto anticipable **más
 * rápido**: es el mejor caso honesto, lo mínimo que alguien podría llegar a
 * pedir ahí ahora mismo. Con el más lento la tarjeta escondería horas que sí
 * existen; con un promedio no representaría a ningún pedido real.
 *
 * Sin franja que cumpla las dos, devuelve `null` — y quien lo dibuje **no
 * dibuja la línea**. Un guion o un "sin datos" ocupa el mismo espacio sin
 * responder nada (ley L6: ningún dato mostrado es una estimación inventada).
 */

export interface FranjaCandidata {
  /** Inicio de la franja. */
  inicio: Date;
  /** Fin de la franja: contra esto se mide el cut-off. */
  fin: Date;
  /** Minutos de cocina ya comprometidos. */
  cargaAsignada: number;
  /** Capacidad total de la franja, en minutos de cocina. */
  capacidadMinutos: number;
}

export interface ParametrosComercio {
  /** α: cuánto de la capacidad se deja comprometer. */
  factorSeguridad: number;
  /** Colchón entre el fin de la preparación y el fin de la franja. */
  margenCutoffMin: number;
  /**
   * Preparación del producto anticipable más rápido, en minutos.
   * `null` si el comercio no tiene ninguno: entonces no hay nada que ofrecer.
   */
  minutosMasRapido: number | null;
}

/**
 * Devuelve la primera franja que el comercio podría cumplir de verdad.
 *
 * `franjas` tiene que venir ordenada por inicio ascendente; se devuelve la
 * primera que cumple, no la más holgada. Al estudiante le importa la más
 * temprana: está eligiendo dónde comer en un receso de treinta minutos.
 */
export function proximaHoraLibre(
  franjas: readonly FranjaCandidata[],
  p: ParametrosComercio,
  ahora: Date,
): FranjaCandidata | null {
  if (p.minutosMasRapido === null) return null;

  const necesario = (p.minutosMasRapido + p.margenCutoffMin) * 60_000;

  return (
    franjas.find(
      (f) =>
        f.cargaAsignada < f.capacidadMinutos * p.factorSeguridad &&
        f.fin.getTime() >= ahora.getTime() + necesario,
    ) ?? null
  );
}

/**
 * Cómo se lee esa hora según el reloj de quien mira.
 *
 * Tres lecturas, y las tres salieron de ver la pantalla mintiendo:
 *
 *  - **EN_CURSO.** Una franja disponible puede haber empezado ya: dura veinte
 *    minutos y el cut-off solo mira su fin. Anunciarla como "próxima hora libre
 *    09:00" a las 13:18 manda al estudiante a una hora que pasó. Lo cierto es
 *    hasta cuándo puede pedir.
 *  - **HOY.** El caso normal: una hora a la que sí puede ir.
 *  - **OTRO_DIA.** Si el comercio ya cerró su día, la próxima hora libre puede
 *    ser de mañana o del lunes. Mostrar "09:00" a secas hace creer que es hoy,
 *    y es la mentira más cara de las tres: manda a alguien a caminar.
 *
 * El día se compara en hora **local**, no en UTC: en UTC−6, una franja de las
 * 19:00 del sábado cae en domingo y "hoy" se rompería cada tarde.
 */
export type LecturaVentana =
  | { tipo: "EN_CURSO"; hasta: Date }
  | { tipo: "HOY"; hora: Date }
  | { tipo: "OTRO_DIA"; hora: Date };

const mismoDiaLocal = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export function leerVentana(
  inicio: Date,
  fin: Date,
  ahora: Date,
): LecturaVentana {
  if (inicio.getTime() <= ahora.getTime()) return { tipo: "EN_CURSO", hasta: fin };
  return mismoDiaLocal(inicio, ahora)
    ? { tipo: "HOY", hora: inicio }
    : { tipo: "OTRO_DIA", hora: inicio };
}
