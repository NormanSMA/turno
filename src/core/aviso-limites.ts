/**
 * Aviso previo de los límites de pedido: el estudiante lo ve ANTES de
 * confirmar, no al fallar. El servidor sigue siendo la autoridad (reserva.ts).
 * Función pura: recibe los conteos y la hora, no toca la base.
 */

import { MAX_NO_SHOWS } from "./penalizacion";

export type NivelLimites = "libre" | "cerca" | "lleno" | "bloqueado";

export interface AvisoLimites {
  nivel: NivelLimites;
  /** Vacío con nivel "libre". */
  texto: string;
}

export function avisoLimites(args: {
  activos: number;
  maximo: number;
  bloqueadoHasta: Date | null;
  ahora: Date;
}): AvisoLimites {
  const { activos, maximo, bloqueadoHasta, ahora } = args;

  if (bloqueadoHasta && bloqueadoHasta.getTime() > ahora.getTime()) {
    const fecha = new Intl.DateTimeFormat("es", {
      day: "numeric",
      month: "long",
      timeZone: "America/Managua",
    }).format(bloqueadoHasta);
    return {
      nivel: "bloqueado",
      texto: `Por ${MAX_NO_SHOWS} pedidos sin retirar no podés pedir hasta el ${fecha}.`,
    };
  }

  if (activos >= maximo) {
    return {
      nivel: "lleno",
      texto: `Ya tenés ${maximo} ${maximo === 1 ? "pedido activo" : "pedidos activos"}. Retirá uno para pedir otro.`,
    };
  }

  if (activos > 0 && activos === maximo - 1) {
    return {
      nivel: "cerca",
      texto: `Tenés ${activos} ${activos === 1 ? "pedido activo" : "pedidos activos"} de ${maximo}.`,
    };
  }

  return { nivel: "libre", texto: "" };
}
