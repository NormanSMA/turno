/**
 * El historial agrupado como lo lee una persona: por DÍA, porque alguien busca
 * "lo que pedí ayer", nunca "lo de la tercera semana de marzo".
 *
 * Reloj inyectado: "hoy" depende de cuándo se pregunte.
 */

export interface PedidoHistorial {
  id: string;
  estado: string;
  total: string;
  /** ISO. La fecha por la que se agrupa es la del RETIRO, no la de creación. */
  franjaInicio: string;
}

export interface GrupoDia {
  /** Etiqueta ya resuelta: "Hoy", "Ayer" o la fecha. */
  titulo: string;
  /** `YYYY-MM-DD` local. Sirve de clave estable para React. */
  clave: string;
  pedidos: PedidoHistorial[];
}

/**
 * Día LOCAL, no `toISOString()`: en UTC−6 un pedido de las 19:00 caería bajo
 * el día siguiente.
 */
function diaLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function agruparPorDia(
  pedidos: readonly PedidoHistorial[],
  ahora: Date,
): GrupoDia[] {
  const hoy = diaLocal(ahora);
  const ayer = diaLocal(new Date(ahora.getTime() - 86_400_000));

  const grupos = new Map<string, PedidoHistorial[]>();

  // Se recorre en orden descendente por fecha para que los grupos salgan del
  // más reciente al más viejo sin tener que ordenarlos después.
  const ordenados = [...pedidos].sort((a, b) =>
    a.franjaInicio < b.franjaInicio ? 1 : -1,
  );

  for (const p of ordenados) {
    const clave = diaLocal(new Date(p.franjaInicio));
    const lista = grupos.get(clave);
    if (lista) lista.push(p);
    else grupos.set(clave, [p]);
  }

  return [...grupos.entries()].map(([clave, lista]) => ({
    clave,
    titulo:
      clave === hoy
        ? "Hoy"
        : clave === ayer
          ? "Ayer"
          : new Date(lista[0]!.franjaInicio).toLocaleDateString("es-NI", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }),
    pedidos: lista,
  }));
}

export interface ResumenHistorial {
  retirados: number;
  /** Solo de los retirados: lo que no se pagó no se gastó. */
  gastado: number;
  /** Cuántos terminaron sin entrega, por cualquier motivo. */
  sinRetirar: number;
}

export function resumirHistorial(
  pedidos: readonly PedidoHistorial[],
): ResumenHistorial {
  let retirados = 0;
  let gastado = 0;
  let sinRetirar = 0;

  for (const p of pedidos) {
    if (p.estado === "RETIRADO") {
      retirados++;
      gastado += Number(p.total) || 0;
    } else if (p.estado === "NO_SHOW" || p.estado === "CANCELADO") {
      // Juntos: para el resumen los dos son "esa comida no se comió". La
      // diferencia ya se ve en cada tarjeta.
      sinRetirar++;
    }
  }

  return { retirados, gastado, sinRetirar };
}
