"use client";

/**
 * Consultas del estudiante con TanStack Query (ADR-23, ADR-14).
 *
 * Reemplazan a `useSondeo`: carga inicial, intervalo propio de cada pantalla,
 * pausa con la pestana oculta y recarga al volver. El pedido deja de consultarse
 * cuando llega a un estado terminal.
 */

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, apiConFrescura } from "@/lib/cliente";
import { avisarListo } from "@/lib/aviso";

const TERMINALES = ["RETIRADO", "NO_SHOW", "CANCELADO"];

export const clavePedido = (id: string) => ["pedido", id] as const;
export const claveMisPedidos = ["mis-pedidos"] as const;

interface RespuestaPedido<T> {
  datos: T;
  desdeCache: boolean;
}

export function usePedido<T extends { estado: string; codigo: string; comercio: string }>(
  id: string,
) {
  // El estado anterior vive en una ref: dispara el aviso, no un repintado.
  const estadoPrevio = useRef<string | null>(null);

  return useQuery({
    queryKey: clavePedido(id),
    queryFn: async (): Promise<RespuestaPedido<T>> => {
      const r = await apiConFrescura<T>(`/api/pedidos/${id}`);
      // Aviso solo en la TRANSICION a LISTO y nunca desde una copia sin conexion.
      if (
        !r.desdeCache &&
        estadoPrevio.current !== null &&
        estadoPrevio.current !== "LISTO" &&
        r.datos.estado === "LISTO"
      ) {
        avisarListo(r.datos.codigo, r.datos.comercio);
      }
      estadoPrevio.current = r.datos.estado;
      return r;
    },
    refetchInterval: (q) =>
      q.state.data && TERMINALES.includes(q.state.data.datos.estado) ? false : 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/** Historial completo. Distinta clave que la banda: esa lista excluye terminales. */
export function useMisPedidos<T>() {
  return useQuery({
    queryKey: claveMisPedidos,
    queryFn: async () => (await api<{ pedidos: T[] }>("/api/pedidos")).pedidos,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
