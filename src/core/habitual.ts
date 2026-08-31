/**
 * "Tu pedido habitual" (§14): una sola cosa, en un toque. Elegir entre cuatro
 * tarjetas parecidas también cuesta minutos que en un receso no hay.
 *
 *   - Se compara la COMBINACIÓN, no los productos sueltos: contarlos por
 *     separado inventaría un pedido que esa persona nunca hizo.
 *   - Solo cuentan los RETIRADOS: un cancelado no dice qué te gusta.
 *   - Hace falta repetición real: llamar "habitual" a algo pedido una vez es
 *     el sistema afirmando que te conoce y demostrando que no.
 */

export interface ItemHistorico {
  productoId: string;
  nombre: string;
  cantidad: number;
}

export interface PedidoHistorico {
  id: string;
  estado: string;
  comercioSlug: string;
  comercio: string;
  /** ISO. Se usa para desempatar por lo más reciente. */
  creadoEn: string;
  total: string;
  items: ItemHistorico[];
}

export interface Habitual {
  /** El pedido más reciente de esa combinación: es el que se repite. */
  pedidoId: string;
  comercio: string;
  comercioSlug: string;
  total: string;
  items: ItemHistorico[];
  /** Cuántas veces se pidió exactamente esto. */
  veces: number;
}

/** Mínimo de repeticiones para que algo sea "habitual" y no una casualidad. */
export const MINIMO_VECES = 2;

/** Ordenada por id: "café + pan" y "pan + café" son lo mismo. La cantidad cuenta. */
function firma(items: readonly ItemHistorico[]): string {
  return items
    .filter((i) => i.cantidad > 0)
    .map((i) => `${i.productoId}x${i.cantidad}`)
    .sort()
    .join("|");
}

export function pedidoHabitual(
  historial: readonly PedidoHistorico[],
): Habitual | null {
  const grupos = new Map<string, PedidoHistorico[]>();

  for (const p of historial) {
    if (p.estado !== "RETIRADO") continue;
    const f = firma(p.items);
    if (!f) continue;
    const lista = grupos.get(f);
    if (lista) lista.push(p);
    else grupos.set(f, [p]);
  }

  let mejor: { pedidos: PedidoHistorico[]; veces: number } | null = null;

  for (const pedidos of grupos.values()) {
    if (pedidos.length < MINIMO_VECES) continue;
    // Empate a favor de lo reciente: los gustos cambian en un semestre.
    if (
      !mejor ||
      pedidos.length > mejor.veces ||
      (pedidos.length === mejor.veces &&
        masReciente(pedidos) > masReciente(mejor.pedidos))
    ) {
      mejor = { pedidos, veces: pedidos.length };
    }
  }

  if (!mejor) return null;

  // Se repite el pedido más reciente de la combinación: sus precios y nombres
  // son los que menos se alejan del menú de hoy.
  const reciente = [...mejor.pedidos].sort((a, b) =>
    a.creadoEn < b.creadoEn ? 1 : -1,
  )[0];

  return {
    pedidoId: reciente.id,
    comercio: reciente.comercio,
    comercioSlug: reciente.comercioSlug,
    total: reciente.total,
    items: reciente.items,
    veces: mejor.veces,
  };
}

function masReciente(pedidos: readonly PedidoHistorico[]): string {
  return pedidos.reduce((max, p) => (p.creadoEn > max ? p.creadoEn : max), "");
}
