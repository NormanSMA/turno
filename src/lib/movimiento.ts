/**
 * Primitivos de movimiento. Tres reglas:
 *
 *  1. **El movimiento informa o no existe.** Cada animación comunica un hecho;
 *     nada se mueve porque sí.
 *  2. **`prefers-reduced-motion` se respeta en JS, no solo en CSS.** El CSS no
 *     puede tocar un bucle de `rAF` ni una transición de vista, así que todo
 *     acá degrada al resultado final instantáneo.
 *  3. **Sin librería de animación.** Son 60 líneas de plataforma; una PWA con
 *     datos móviles no paga 110 KB por un efecto.
 */

/**
 * ¿El sistema pide menos movimiento?
 *
 * Devuelve `false` en el servidor: durante el render de servidor no hay
 * `matchMedia` y tampoco hay nada que animar todavía. Quien llama siempre lo
 * hace desde un efecto o un manejador de evento, ya en el cliente.
 */
export function prefiereMenosMovimiento(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Ejecuta un cambio de estado dentro de una transición de vista.
 *
 * La View Transition API deja que el navegador anime la diferencia entre el
 * antes y el después: si un elemento con `view-transition-name` estable existe
 * en las dos capturas, el navegador lo interpola de una posición a la otra. En
 * la cocina eso significa que la tarjeta VIAJA de "En espera" a "En cocina" en
 * vez de desaparecer de una lista y aparecer en otra — el operador no pierde de
 * vista cuál pedido se movió.
 *
 * `startViewTransition` no está en todos los navegadores todavía (Firefox llegó
 * tarde), así que la ausencia se trata como el caso normal y no como un error:
 * sin soporte, el cambio se aplica igual, sin animar.
 */
type ConTransicion = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => unknown;
};

export function conTransicionDeVista(cambio: () => void): void {
  const doc = typeof document === "undefined" ? null : (document as ConTransicion);
  if (!doc?.startViewTransition || prefiereMenosMovimiento()) {
    cambio();
    return;
  }
  doc.startViewTransition(cambio);
}

/**
 * Suavizado de salida: rápido al principio, se posa al final.
 *
 * Es la misma curva que usa `.entra` en CSS (`cubic-bezier(.22,1,.28,1)`)
 * expresada como función, para que un número que cuenta y una tarjeta que entra
 * se sientan del mismo material.
 */
export function suavizado(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* ==========================================================================
   MOTION SYSTEM
   ==========================================================================
   Los tokens viven en `globals.css` y se leen desde acá para que una duración
   no exista en dos lugares con dos valores.

   La regla del ADR-11 sigue mandando: **el movimiento informa o no existe**.
   Y el ADR-19 explica por qué todo esto es plataforma y no una librería.
   ========================================================================== */

/** Duraciones, en ms. Espejo de `--motion-*`. */
export const MOTION = {
  rapido: 130, // microinteracciones: botón, contador, favorito
  normal: 220, // cambio de estado o de componente
  lento: 340, // modal, hoja inferior, transición de pantalla
} as const;

/** La curva de salida del sistema, como cadena para la Web Animations API. */
export const CURVA_SALIDA = "cubic-bezier(0.22, 1, 0.28, 1)";

/**
 * Marca un elemento para que participe de una transición compartida.
 *
 * Dos elementos en dos pantallas distintas que llevan el MISMO nombre se
 * interpolan uno en el otro: la foto de la tarjeta se convierte físicamente en
 * la foto del detalle, en vez de desaparecer y volver a aparecer. Es el
 * equivalente nativo de `layoutId`, y no cuesta un solo kilobyte.
 *
 * El nombre tiene que ser único en la página y estable entre las dos vistas —
 * por eso se deriva del id del producto o del pedido, nunca del índice de una
 * lista, que cambia al filtrar.
 */
export function elementoCompartido(nombre: string): React.CSSProperties {
  return { viewTransitionName: nombre } as React.CSSProperties;
}

/**
 * Retraso escalonado para una entrada en lista.
 *
 * Tope a 6 elementos: a partir de ahí el escalonado deja de leerse como una
 * entrada ordenada y empieza a sentirse como una pantalla lenta. El resto entra
 * junto con el sexto.
 */
export function escalonado(indice: number, paso = 60): React.CSSProperties {
  return { animationDelay: `${Math.min(indice, 5) * paso}ms` };
}

/**
 * Pulso de acuse: 1 → 1.15 → 1.
 *
 * Es la respuesta del contador del carrito cuando algo entra. Comunica "tu
 * pedido cambió" en 130 ms, que es menos de lo que tarda en leerse el número
 * nuevo — así que la percepción es de respuesta inmediata, no de animación.
 */
export function pulso(el: Element | null): void {
  if (!el || prefiereMenosMovimiento()) return;
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }],
    { duration: MOTION.rapido * 2, easing: CURVA_SALIDA },
  );
}

/**
 * Vuelo de un producto hacia el carrito.
 *
 * Clona la imagen del producto, la lanza por un arco hasta el carrito y la
 * descarta. El clon es `position: fixed` y `pointer-events: none`, así que no
 * toca el layout ni intercepta toques mientras viaja.
 *
 * Por qué informa y no adorna: al agregar algo, el carrito está fuera de la
 * vista o al pie de la pantalla, y el usuario no tiene forma de saber A DÓNDE
 * fue lo que tocó. El vuelo señala el destino. Sin él, la única evidencia es un
 * número que cambia en un rincón que nadie está mirando.
 *
 * Devuelve una promesa que resuelve cuando termina, para poder encadenar el
 * pulso del contador justo al aterrizar.
 */
export function volarAlCarrito(
  origen: Element | null,
  destino: Element | null,
): Promise<void> {
  if (!origen || !destino || prefiereMenosMovimiento()) return Promise.resolve();

  const a = origen.getBoundingClientRect();
  const b = destino.getBoundingClientRect();
  if (a.width === 0 || b.width === 0) return Promise.resolve();

  const clon = origen.cloneNode(true) as HTMLElement;
  clon.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;margin:0;z-index:60;pointer-events:none;border-radius:16px;object-fit:cover;`;
  document.body.appendChild(clon);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);

  const animacion = clon.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      {
        // El punto medio sube: un arco se lee como algo lanzado, una recta se
        // lee como un error de renderizado.
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(0.6)`,
        opacity: 0.9,
        offset: 0.6,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.35 },
    ],
    { duration: MOTION.lento + 120, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  );

  return animacion.finished
    .catch(() => undefined)
    .then(() => {
      clon.remove();
    });
}
