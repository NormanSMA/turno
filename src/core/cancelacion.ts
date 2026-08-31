/**
 * Quién canceló un pedido, y por qué.
 *
 * La pantalla de cierre daba por hecho que había cancelado el estudiante:
 * *"Lo cancelaste antes de que la cocina empezara"*. Cuando el que cancelaba
 * era el comercio —se le acabó un producto, se le dañó un equipo— el estudiante
 * leía que había sido él. Peor: la hoja de cocina le promete al operador que
 * *"al estudiante le avisamos con el motivo"*, y ese motivo se guardaba en la
 * base sin llegar a ninguna pantalla.
 *
 * **Se decide por DUEÑO, no por rol.** `EventoPedido` guarda `actorId`, no el
 * rol de quien actuó, y eso resulta ser mejor: el rol de una cuenta puede
 * cambiar después, pero si el pedido lo canceló su propio dueño o alguien más
 * es un hecho que no cambia. Y es justo la distinción que le importa al
 * estudiante: *¿lo cancelé yo, o alguien del otro lado del mostrador?*
 *
 * Además evita una migración: el dato ya estaba, solo había que leerlo.
 */

export type QuienCancelo = "USUARIO" | "COMERCIO" | "SISTEMA";

export interface EventoCancelacion {
  estado: string;
  /** Id de quien hizo la transición. `null` para los barridos automáticos. */
  actorId: string | null;
  nota: string | null;
}

export interface Cancelacion {
  quien: QuienCancelo;
  /** El motivo que escribió la cocina, si lo hay. */
  motivo: string | null;
}

/**
 * Lee la cancelación de la lista de eventos del pedido.
 *
 * Se toma el ÚLTIMO evento CANCELADO y no el primero: un pedido se cancela una
 * sola vez, pero si alguna vez hubiera dos filas —una corrección, una
 * migración— la que vale es la última, que es la que lo dejó como está.
 */
export function leerCancelacion(
  eventos: readonly EventoCancelacion[],
  usuarioIdDelPedido: string,
): Cancelacion | null {
  const cancelaciones = eventos.filter((e) => e.estado === "CANCELADO");
  const ultimo = cancelaciones[cancelaciones.length - 1];
  if (!ultimo) return null;

  // Sin actor es el barrido automático: nadie lo decidió, se venció.
  const quien: QuienCancelo =
    ultimo.actorId === null
      ? "SISTEMA"
      : ultimo.actorId === usuarioIdDelPedido
        ? "USUARIO"
        : "COMERCIO";

  // El motivo solo se muestra cuando lo escribió alguien del otro lado del
  // mostrador. Una nota del propio estudiante no le explica nada nuevo.
  const motivo = quien === "COMERCIO" ? (ultimo.nota?.trim() || null) : null;

  return { quien, motivo };
}
