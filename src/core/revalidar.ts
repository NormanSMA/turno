/**
 * TURNO — Revalidación del carrito contra el menú vigente.
 *
 * El problema que resuelve es real y silencioso: entre que el estudiante arma
 * el pedido y lo confirma pasan minutos, y en esos minutos el comercio puede
 * agotar un producto, cambiarle el precio o archivarlo. Hoy eso terminaba de
 * dos formas, las dos malas:
 *
 *   - el producto DESAPARECÍA del carrito sin decir nada, o
 *   - el rechazo llegaba recién al confirmar, con un mensaje que no explica
 *     cuál de los cinco productos es el problema.
 *
 * La regla es que **el servidor gana siempre** —él tiene el dato de verdad— pero
 * el usuario tiene derecho a enterarse de qué cambió y a decidir con eso a la
 * vista. Nunca una sorpresa silenciosa.
 *
 * Puro y sin dependencias: entra la foto del carrito y el menú actual, sale la
 * lista de cambios. Se prueba sin levantar nada.
 */

/** Lo que el usuario tenía cuando lo agregó. */
export interface ItemCarrito {
  productoId: string;
  cantidad: number;
  /** Precio vigente en el momento de agregarlo, como cadena decimal. */
  precio: string;
  nombre: string;
}

/** Lo que el menú dice ahora. */
export interface ProductoVigente {
  id: string;
  nombre: string;
  precio: string;
  disponible: boolean;
  /** Cumple t(p) ≥ t_mín y está marcado como anticipable. */
  elegible: boolean;
}

export type TipoCambio =
  /** Ya no está en el menú: archivado o de otro comercio. */
  | "RETIRADO"
  /** Sigue existiendo pero el comercio lo apagó. */
  | "AGOTADO"
  /** Dejó de admitir pedido anticipado. */
  | "NO_ANTICIPABLE"
  /** Cambió de precio. */
  | "PRECIO";

export interface Cambio {
  tipo: TipoCambio;
  productoId: string;
  nombre: string;
  /** Solo en PRECIO. */
  precioAntes?: string;
  precioAhora?: string;
  /** true si el producto sale del carrito por este cambio. */
  bloqueante: boolean;
}

export interface Revalidacion {
  cambios: Cambio[];
  /** El carrito ya depurado: solo lo que se puede pedir. */
  carrito: Record<string, number>;
  /** true si no hay nada que contarle al usuario. */
  sinNovedades: boolean;
}

/**
 * Compara el carrito contra el menú vigente.
 *
 * Los cambios BLOQUEANTES sacan el producto del carrito, porque dejarlo dentro
 * garantiza un rechazo al confirmar y ese rechazo no dice cuál era. El cambio de
 * precio NO es bloqueante: el producto se puede pedir igual, solo hay que
 * decirlo antes de cobrar.
 */
export function revalidarCarrito(
  items: ItemCarrito[],
  menu: ProductoVigente[],
): Revalidacion {
  const porId = new Map(menu.map((p) => [p.id, p]));
  const cambios: Cambio[] = [];
  const carrito: Record<string, number> = {};

  for (const i of items) {
    if (i.cantidad <= 0) continue;
    const actual = porId.get(i.productoId);

    if (!actual) {
      cambios.push({
        tipo: "RETIRADO",
        productoId: i.productoId,
        nombre: i.nombre,
        bloqueante: true,
      });
      continue;
    }

    if (!actual.disponible) {
      cambios.push({
        tipo: "AGOTADO",
        productoId: i.productoId,
        // El nombre del menú y no el guardado: si lo renombraron, el usuario
        // tiene que poder reconocerlo en el mostrador.
        nombre: actual.nombre,
        bloqueante: true,
      });
      continue;
    }

    if (!actual.elegible) {
      cambios.push({
        tipo: "NO_ANTICIPABLE",
        productoId: i.productoId,
        nombre: actual.nombre,
        bloqueante: true,
      });
      continue;
    }

    // Se comparan como números: "45.00" y "45" son el mismo precio, y avisar
    // de un cambio que no existe gasta la confianza del usuario.
    if (Number(actual.precio) !== Number(i.precio)) {
      cambios.push({
        tipo: "PRECIO",
        productoId: i.productoId,
        nombre: actual.nombre,
        precioAntes: i.precio,
        precioAhora: actual.precio,
        bloqueante: false,
      });
    }

    carrito[i.productoId] = i.cantidad;
  }

  return { cambios, carrito, sinNovedades: cambios.length === 0 };
}

/** Cuánto cuesta el carrito con los precios VIGENTES, no con los guardados. */
export function totalVigente(
  carrito: Record<string, number>,
  menu: ProductoVigente[],
): number {
  const porId = new Map(menu.map((p) => [p.id, p]));
  return Object.entries(carrito).reduce((total, [id, cantidad]) => {
    const p = porId.get(id);
    return p ? total + Number(p.precio) * cantidad : total;
  }, 0);
}
