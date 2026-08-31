/**
 * TURNO — Reglas de autorización, puras y sin dependencias del framework.
 *
 * Viven en `core` justamente para que sean verificables con tests unitarios sin
 * levantar Next.js: si la autorización solo se puede probar arrancando el
 * servidor, en la práctica no se prueba.
 */

export type RolUsuario = "ESTUDIANTE" | "COMERCIO" | "ADMIN";

export interface SesionActiva {
  sesionId: string;
  usuarioId: string;
  correo: string;
  /** Nombre real, si lo cargó. `null` significa saludar sin nombre. */
  nombre: string | null;
  rol: RolUsuario;
  comercioId: string | null;
  condicionExperimental: "A" | "B";
}

/**
 * Defensa contra IDOR. Un pedido lo ve su dueño, el comercio que lo prepara y
 * el administrador. Nadie más, aunque adivine el UUID.
 */
export function puedeVerPedido(
  sesion: SesionActiva,
  pedido: { usuarioId: string; comercioId: string },
): boolean {
  if (sesion.rol === "ADMIN") return true;
  if (sesion.rol === "COMERCIO") {
    return !!sesion.comercioId && sesion.comercioId === pedido.comercioId;
  }
  return sesion.usuarioId === pedido.usuarioId;
}

/**
 * Quién puede cambiar el estado operativo de un pedido.
 *
 * SOLO el comercio que lo prepara. El administrador NO — y no es un descuido:
 *
 *   - Separación de funciones. Quien mide el piloto no debe poder producir los
 *     datos que mide. Un administrador marcando pedidos como listos ensucia
 *     justamente el indicador 2, que es el resultado central del trabajo.
 *   - Trazabilidad. `evento_pedido.actorId` tiene que responder "¿quién dijo
 *     que estaba listo?" con el operador real, no con el investigador.
 *
 * El administrador observa y configura; el comercio opera.
 */
export function puedeOperarPedido(
  sesion: SesionActiva,
  pedido: { usuarioId: string; comercioId: string },
): boolean {
  return sesion.rol === "COMERCIO" && sesion.comercioId === pedido.comercioId;
}

/** Quién puede abrir el tablero de cocina de un comercio. */
export function puedeVerCocina(
  sesion: SesionActiva,
  comercioId: string,
): boolean {
  return sesion.rol === "COMERCIO" && sesion.comercioId === comercioId;
}
