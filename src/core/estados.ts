/**
 * TURNO — Máquina de estados del pedido.
 *
 * Se separan dos conceptos que suelen confundirse:
 *
 *   ESTADO OPERACIONAL  — dónde está el pedido en la cocina.
 *   CUMPLIMIENTO        — si la promesa de hora se honró (indicador 2, §14.5).
 *
 * Un pedido puede estar EN_PREPARACION y ya estar INCUMPLIDO. Mezclarlos haría
 * imposible medir el indicador 2, porque el incumplimiento quedaría escondido
 * dentro de un estado operativo que igual termina en RETIRADO.
 *
 *   RECIBIDO ──┬─→ CANCELADO
 *              └─→ EN_PREPARACION ──→ LISTO ──┬─→ RETIRADO
 *                                             └─→ NO_SHOW
 */

export type EstadoPedido =
  | "RECIBIDO"
  | "EN_PREPARACION"
  | "LISTO"
  | "RETIRADO"
  | "NO_SHOW"
  | "CANCELADO";

export type Cumplimiento =
  | "PENDIENTE"
  | "CUMPLIDO"
  | "INCUMPLIDO"
  | "NO_APLICA";

/** Transiciones permitidas. Todo lo que no está acá, está prohibido. */
const TRANSICIONES: Record<EstadoPedido, readonly EstadoPedido[]> = {
  RECIBIDO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["LISTO", "CANCELADO"],
  LISTO: ["RETIRADO", "NO_SHOW"],
  RETIRADO: [],
  NO_SHOW: [],
  CANCELADO: [],
};

/** Estados terminales: el pedido ya no cambia más. */
export const ESTADOS_TERMINALES: readonly EstadoPedido[] = [
  "RETIRADO",
  "NO_SHOW",
  "CANCELADO",
];

/** Estados que ocupan capacidad de la franja. */
export const ESTADOS_ACTIVOS: readonly EstadoPedido[] = [
  "RECIBIDO",
  "EN_PREPARACION",
  "LISTO",
];

export function esTerminal(estado: EstadoPedido): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

export function ocupaCapacidad(estado: EstadoPedido): boolean {
  return ESTADOS_ACTIVOS.includes(estado);
}

export function transicionesDesde(estado: EstadoPedido): readonly EstadoPedido[] {
  return TRANSICIONES[estado];
}

export function puedeTransicionar(
  desde: EstadoPedido,
  hacia: EstadoPedido,
): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export class TransicionInvalida extends Error {
  constructor(
    readonly desde: EstadoPedido,
    readonly hacia: EstadoPedido,
  ) {
    super(
      `Transición inválida: ${desde} → ${hacia}. ` +
        `Desde ${desde} solo se permite: ${TRANSICIONES[desde].join(", ") || "(ninguna, es terminal)"}`,
    );
    this.name = "TransicionInvalida";
  }
}

export function exigirTransicion(desde: EstadoPedido, hacia: EstadoPedido): void {
  if (!puedeTransicionar(desde, hacia)) throw new TransicionInvalida(desde, hacia);
}

/**
 * ¿Quién puede cancelar y hasta cuándo?
 *
 * El usuario cancela solo mientras la cocina no empezó: una vez que el pedido
 * está EN_PREPARACION, el insumo ya se gastó y cancelar trasladaría la pérdida
 * al comercio — que es a quien hay que proteger para que el piloto exista (S-01).
 * El comercio sí puede cancelar en preparación (se le quemó, se le acabó algo).
 */
export function puedeCancelar(
  estado: EstadoPedido,
  actor: "USUARIO" | "COMERCIO" | "ADMIN",
): boolean {
  if (actor === "USUARIO") return estado === "RECIBIDO";
  return estado === "RECIBIDO" || estado === "EN_PREPARACION";
}

/**
 * Evalúa el cumplimiento de la promesa contra el fin de la franja comprometida.
 *
 * La promesa de TURNO es "está listo cuando termina tu franja", no "a un minuto
 * exacto": el ancho Δ ES la promesa. Por eso el corte es `finFranja`.
 */
export function evaluarCumplimiento(args: {
  estado: EstadoPedido;
  listoEn: Date | null;
  finFranja: Date;
  ahora: Date;
}): Cumplimiento {
  const { estado, listoEn, finFranja, ahora } = args;

  if (estado === "CANCELADO") {
    // Cancelado antes de que la promesa venciera: no cuenta ni a favor ni en
    // contra. Cancelado después, el comercio ya había fallado en cumplir.
    return ahora <= finFranja ? "NO_APLICA" : "INCUMPLIDO";
  }
  if (listoEn) return listoEn <= finFranja ? "CUMPLIDO" : "INCUMPLIDO";
  // Todavía no está listo: solo es incumplido si la franja ya pasó.
  return ahora > finFranja ? "INCUMPLIDO" : "PENDIENTE";
}

/**
 * ¿Corresponde marcar NO_SHOW?
 * Regla: LISTO + `minutosNoShow` sin retiro. Se mide desde `listoEn`, no desde
 * el fin de la franja: si el comercio se atrasó, el reloj del usuario no debe
 * empezar a correr antes de que el pedido exista físicamente.
 */
export function correspondeNoShow(args: {
  estado: EstadoPedido;
  listoEn: Date | null;
  minutosNoShow: number;
  ahora: Date;
}): boolean {
  const { estado, listoEn, minutosNoShow, ahora } = args;
  if (estado !== "LISTO" || !listoEn) return false;
  return ahora.getTime() - listoEn.getTime() >= minutosNoShow * 60_000;
}
