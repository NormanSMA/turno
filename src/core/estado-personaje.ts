import type { EstadoPedido } from "./estados";

export interface PersonajePedido {
  mascota: "saluda" | "listo" | "espera" | "error";
  conGorro: boolean;
  frase: string;
}

const PERSONAJES: Record<EstadoPedido, PersonajePedido> = {
  RECIBIDO: { mascota: "espera", conGorro: false, frase: "La cocina ya tiene tu pedido" },
  EN_PREPARACION: { mascota: "espera", conGorro: true, frase: "Están cocinando tu pedido" },
  LISTO: { mascota: "listo", conGorro: false, frase: "Tu pedido está listo, pasá a retirarlo" },
  RETIRADO: { mascota: "saluda", conGorro: false, frase: "Retirado. Buen provecho" },
  NO_SHOW: { mascota: "error", conGorro: false, frase: "No lo retiraste a tiempo" },
  CANCELADO: { mascota: "error", conGorro: false, frase: "El pedido se canceló" },
};

/** Mascota, gorro y frase que acompañan cada estado del pedido. */
export function personajeParaEstado(estado: EstadoPedido): PersonajePedido {
  return PERSONAJES[estado];
}
