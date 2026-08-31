/**
 * ¿Cabe en tu turno?
 *
 * Es el diferenciador del producto, y es una pregunta que ninguna aplicación de
 * entrega puede responder: para contestarla hay que haber reservado capacidad
 * de cocina, no solo haber tomado un pedido.
 *
 * El estudiante decide **antes** de agregar, no después de confirmar. La forma
 * cara de descubrir que un plato no entra en el receso es en el mostrador; la
 * segunda más cara es un error al confirmar, con el pedido ya armado.
 *
 * Dos condiciones, las mismas del motor de admisión:
 *
 *  - **Holgura.** La franja tiene que tener minutos de cocina sin comprometer
 *    suficientes para este pedido.
 *  - **A tiempo.** Todavía se tiene que poder reservar: `ahora ≤ cierraEn`,
 *    donde `cierraEn` es `fin − (t_max + margen)` y lo calcula el servidor.
 *
 * Cuando no cabe, **no se deja al estudiante buscando**: se devuelve la primera
 * franja que sí puede, para que un botón la elija por él. Decirle "no se puede"
 * y dejarlo mirando una regla de ocho columnas es hacerle a él el trabajo que
 * el sistema ya hizo.
 *
 * Sin franja elegida no hay veredicto (`null`): afirmar que algo cabe sin saber
 * dónde es exactamente la clase de dato inventado que prohíbe la ley L6.
 */

export interface FranjaVeredicto {
  franjaId: string;
  inicio: string;
  /** Minutos de cocina sin comprometer. */
  holguraMin: number;
  /** ISO. Hasta cuándo se puede reservar esta franja. */
  cierraEn: string;
}

export type Veredicto =
  | { tipo: "CABE"; inicio: string }
  | {
      tipo: "NO_CABE";
      /** La primera hora que sí puede, o `null` si hoy no queda ninguna. */
      alternativa: FranjaVeredicto | null;
    };

/** Si esta franja admite un pedido de `cargaMin` minutos, ahora mismo. */
export function admite(
  f: FranjaVeredicto,
  cargaMin: number,
  ahora: Date,
): boolean {
  return (
    f.holguraMin >= cargaMin &&
    new Date(f.cierraEn).getTime() >= ahora.getTime()
  );
}

/**
 * El veredicto para la franja elegida.
 *
 * `opciones` tiene que venir ordenada por hora: la alternativa que se ofrece es
 * la más temprana que sirva, no la más holgada. En un receso de treinta minutos
 * antes gana a cómodo.
 */
export function veredictoDeTurno(
  elegida: FranjaVeredicto | null,
  opciones: readonly FranjaVeredicto[],
  cargaMin: number,
  ahora: Date,
): Veredicto | null {
  if (!elegida) return null;

  if (admite(elegida, cargaMin, ahora)) {
    return { tipo: "CABE", inicio: elegida.inicio };
  }

  return {
    tipo: "NO_CABE",
    alternativa:
      opciones.find(
        (o) => o.franjaId !== elegida.franjaId && admite(o, cargaMin, ahora),
      ) ?? null,
  };
}

/**
 * Cuánto margen deja esta franja, en palabras.
 *
 * §51: se explica el resultado, no el modelo. El estudiante no necesita saber
 * qué es α ni C(f); necesita saber si va tranquilo o va justo. El detalle de la
 * carga de cocina vive en la hoja de ayuda, para quien lo quiera.
 *
 * El umbral es **relativo al pedido**, no un número fijo: cinco minutos de
 * sobra son holgados para un café y son ir justo para un almuerzo completo.
 */
export type Margen = "HOLGADO" | "JUSTO" | "SIN_LUGAR";

export function margenDe(
  f: FranjaVeredicto,
  cargaMin: number,
  ahora: Date,
): Margen {
  if (!admite(f, cargaMin, ahora)) return "SIN_LUGAR";
  return f.holguraMin >= cargaMin * 1.5 ? "HOLGADO" : "JUSTO";
}

export const TEXTO_MARGEN: Record<Margen, string> = {
  HOLGADO: "Llegás con margen",
  JUSTO: "Justo a tiempo",
  SIN_LUGAR: "Sin lugar",
};

/**
 * Qué dice el botón de confirmar.
 *
 * **Regla general del sistema: un botón apagado siempre dice por qué lo está.**
 * "Confirmar pedido" en gris obliga al estudiante a adivinar qué le falta;
 * decirle qué falta convierte el mismo pixel en la instrucción siguiente.
 */
export type EstadoAccion =
  | "CERRADO"
  | "VACIO"
  | "SIN_HORA"
  | "NO_CABE"
  | "LISTO";

export function textoAccion(e: EstadoAccion, total: string): string {
  switch (e) {
    case "CERRADO":
      return "Cerrado ahora";
    case "VACIO":
      return "Agregá algo al pedido";
    case "SIN_HORA":
      return "Elegí una hora de retiro";
    case "NO_CABE":
      return "Ver la próxima hora con lugar";
    case "LISTO":
      return `Pedir ${total}`;
  }
}
