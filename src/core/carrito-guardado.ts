/**
 * Cuándo un carrito guardado sigue sirviendo (§41).
 *
 * Lo decide un límite de tiempo, no el ciclo de vida de la pestaña: dentro de
 * la ventana se restaura y se revalida; pasada, se descarta en silencio —
 * ofrecer "¿seguimos?" al día siguiente es hablar de algo ya olvidado.
 *
 * Se guarda POR COMERCIO: mezclar dos menús daría un pedido inconfirmable.
 */

export interface CarritoGuardado {
  slug: string;
  carrito: Record<string, number>;
  /** Milisegundos desde época. */
  guardadoEn: number;
}

/** Cubre armar el pedido, entrar a clase y volver en el receso. */
export const VENTANA_MS = 4 * 60 * 60 * 1000;

export type Decision =
  /** No hay nada guardado, o no es de este comercio. */
  | { tipo: "NADA" }
  /** Había algo, pero ya venció: se descarta en silencio. */
  | { tipo: "VENCIDO" }
  /** Se puede restaurar. Hay que revalidarlo antes de mostrarlo como bueno. */
  | { tipo: "RESTAURAR"; carrito: Record<string, number>; minutos: number };

export function decidirRestauracion(
  guardado: CarritoGuardado | null,
  slugActual: string,
  ahora: number,
): Decision {
  if (!guardado || guardado.slug !== slugActual) return { tipo: "NADA" };

  const edad = ahora - guardado.guardadoEn;

  // Una marca de tiempo futura solo puede venir de un reloj movido o de un dato
  // manipulado. Se trata como vencida: es el lado seguro.
  if (edad < 0 || edad > VENTANA_MS) return { tipo: "VENCIDO" };

  const unidades = Object.values(guardado.carrito ?? {}).reduce(
    (a, n) => a + (Number.isFinite(n) && n > 0 ? n : 0),
    0,
  );
  // Un carrito vacío guardado no es algo que restaurar: es ruido.
  if (unidades === 0) return { tipo: "NADA" };

  return {
    tipo: "RESTAURAR",
    carrito: guardado.carrito,
    minutos: Math.floor(edad / 60_000),
  };
}
