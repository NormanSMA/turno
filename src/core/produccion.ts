/**
 * Total a producir por franja: suma las cantidades de cada plato entre los
 * pedidos que todavia hay que cocinar. Funcion pura, sin React ni Prisma.
 */

export interface PedidoProduccion {
  estado: string;
  items: { nombre: string; cantidad: number }[];
}

export interface TotalProduccion {
  nombre: string;
  cantidad: number;
}

const ESTADOS_ACTIVOS: readonly string[] = ["RECIBIDO", "EN_PREPARACION"];

export function totalAProducir(pedidos: PedidoProduccion[]): TotalProduccion[] {
  const suma = new Map<string, number>();
  for (const p of pedidos) {
    if (!ESTADOS_ACTIVOS.includes(p.estado)) continue;
    for (const i of p.items) {
      suma.set(i.nombre, (suma.get(i.nombre) ?? 0) + i.cantidad);
    }
  }
  return [...suma]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, "es"));
}
