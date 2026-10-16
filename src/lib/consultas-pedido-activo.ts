"use client";

/**
 * Pedidos en curso del estudiante con TanStack Query (ADR-23).
 *
 * Reemplaza a `useSondeo` en la banda: carga inicial, intervalo de 15 s y
 * pausa con la pestana oculta. Navegacion y banda comparten la misma clave, asi
 * que hay una sola peticion aunque las dos esten montadas.
 */

import { useQuery } from "@tanstack/react-query";
import type { PedidoEnCurso } from "@/components/PedidoActivo";
import { api } from "@/lib/cliente";
import { siHaySesion } from "@/lib/sesion-cliente";

const TERMINALES = ["RETIRADO", "NO_SHOW", "CANCELADO"];

export const clavePedidosEnCurso = ["pedidos-en-curso"] as const;

export function usePedidosEnCurso() {
  const consulta = useQuery({
    queryKey: clavePedidosEnCurso,
    // Sin sesion no se pide: el invitado vino a mirar el menu.
    queryFn: async (): Promise<PedidoEnCurso[]> => {
      const r = await siHaySesion(() =>
        api<{ pedidos: PedidoEnCurso[] }>("/api/pedidos"),
      );
      return r ? r.pedidos.filter((p) => !TERMINALES.includes(p.estado)) : [];
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return consulta.data ?? [];
}
