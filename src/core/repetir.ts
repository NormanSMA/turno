/**
 * Rearmar un pedido anterior contra el menú de hoy.
 *
 * Vive acá y no dentro del componente por la misma razón que el resto del
 * núcleo: es una regla con casos límite que hay que poder probar sin montar una
 * pantalla ni levantar una base.
 *
 * La regla en una línea: **se repite lo que todavía se puede pedir, y lo que no,
 * se dice por su nombre.**
 *
 * El detalle que importa es *cuándo* se filtra. Un ítem viejo puede haberse
 * archivado, agotado, o dejado de ser anticipable —el comercio pudo subirle el
 * tiempo de preparación por encima del ancho de franja—. Si se metieran igual al
 * carrito, el sistema los aceptaría hasta el momento de confirmar y ahí
 * devolvería un rechazo que el estudiante no puede explicarse, después de haber
 * elegido hora. Filtrar al rearmar mueve esa noticia al principio, cuando
 * todavía es barata.
 */

export interface ItemAnterior {
  productoId: string;
  nombre: string;
  cantidad: number;
}

export interface ProductoVigente {
  id: string;
  disponible: boolean;
  elegible: boolean;
}

export interface CarritoRearmado {
  /** Cantidades por producto, listo para el estado del carrito. */
  carrito: Record<string, number>;
  /** Nombres de lo que quedó fuera, para decírselo al estudiante. */
  omitidos: string[];
}

export function rearmarCarrito(
  anteriores: readonly ItemAnterior[],
  productos: readonly ProductoVigente[],
): CarritoRearmado {
  const vigentes = new Set(
    productos.filter((p) => p.disponible && p.elegible).map((p) => p.id),
  );

  const carrito: Record<string, number> = {};
  const omitidos: string[] = [];

  for (const item of anteriores) {
    if (item.cantidad <= 0) continue;

    if (!vigentes.has(item.productoId)) {
      // Se reporta una vez por nombre: un pedido puede traer el mismo producto
      // en dos líneas y repetir el aviso solo confunde.
      if (!omitidos.includes(item.nombre)) omitidos.push(item.nombre);
      continue;
    }

    // Se suman las cantidades en vez de sobrescribirlas: si el pedido viejo
    // tenía dos líneas del mismo producto, repetirlo significa la suma, no la
    // última.
    carrito[item.productoId] = (carrito[item.productoId] ?? 0) + item.cantidad;
  }

  return { carrito, omitidos };
}
