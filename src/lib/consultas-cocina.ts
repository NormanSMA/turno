"use client";

/**
 * Consulta del tablero de cocina con TanStack Query (ADR-23).
 *
 * Reemplaza al `setInterval` manual. Conserva lo que hacia `useSondeo`: carga
 * inicial, pausa con la pestana oculta y recarga al volver.
 *
 * Optimismo: SOLO al cambiar de estado un pedido. La tarjeta se mueve de
 * columna (o sale del tablero si pasa a RETIRADO o CANCELADO) apenas se toca el
 * boton. Si el servidor responde error, se restaura la copia exacta del tablero
 * guardada en `onMutate`. En cualquier caso se invalida la consulta para que el
 * servidor tenga la ultima palabra.
 */

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ErrorApi } from "@/lib/cliente";
import { conTransicionDeVista } from "@/lib/movimiento";

export type EstadoColumna = "RECIBIDO" | "EN_PREPARACION" | "LISTO";

export interface PedidoCocina {
  id: string;
  codigo: string;
  estado: EstadoColumna;
  cargaEstimadaMin: number;
  franjaInicio: string;
  franjaFin: string;
  minutosRestantes: number;
  items: { nombre: string; cantidad: number; tiempoPreparacionMin: number }[];
}

export interface FranjaCocina {
  id: string;
  inicio: string;
  fin: string;
  capacidadEfectivaMin: number;
  cargaAsignada: number;
  ocupacion: number;
}

export interface Tablero {
  generadoEn: string;
  comercio: { nombre: string; estadoOperacion: string };
  pedidos: PedidoCocina[];
  franjas: FranjaCocina[];
}

const COLUMNAS_VISIBLES: readonly string[] = ["RECIBIDO", "EN_PREPARACION", "LISTO"];

export const claveTablero = (slug: string) => ["cocina", slug] as const;

/** Cambio de estado optimista sobre una copia del tablero. */
export function aplicarEstado(
  t: Tablero,
  id: string,
  estado: string,
): Tablero {
  return {
    ...t,
    pedidos: t.pedidos.flatMap((p) => {
      if (p.id !== id) return [p];
      return COLUMNAS_VISIBLES.includes(estado)
        ? [{ ...p, estado: estado as EstadoColumna }]
        : [];
    }),
  };
}

export interface ClasificacionError {
  sinSesion: boolean;
  /** Mensaje que reemplaza la pantalla; null si solo hay que avisar. */
  mensaje: string | null;
  desconectado: boolean;
}

/**
 * Solo se declara desconexion cuando el servidor NO respondio. Un comercio
 * inexistente (404) o una cuenta ajena (403) no son problemas de red.
 */
export function clasificarError(e: unknown, slug: string): ClasificacionError {
  if (e instanceof ErrorApi && e.status === 401) {
    return { sinSesion: true, mensaje: null, desconectado: false };
  }
  if (e instanceof ErrorApi && e.status === 403) {
    return {
      sinSesion: false,
      mensaje: "Esta cuenta no opera este comercio. Entrá con la cuenta del comercio.",
      desconectado: false,
    };
  }
  if (e instanceof ErrorApi && e.status === 404) {
    return {
      sinSesion: false,
      mensaje:
        `No existe ningún comercio con la dirección "${slug}". ` +
        "Revisá el enlace: puede que lo hayan renombrado.",
      desconectado: false,
    };
  }
  return {
    sinSesion: false,
    mensaje: e instanceof ErrorApi ? "No se pudo actualizar la cola. Reintentando…" : null,
    desconectado: true,
  };
}

export function useTableroCocina(slug: string) {
  const cliente = useQueryClient();
  const clave = claveTablero(slug);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => api<Tablero>(`/api/cocina/${slug}`),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // El aviso de una accion fallida dura lo que tarda la siguiente carga, como
  // antes; despues el tablero vuelve a verse.
  useEffect(() => {
    if (!errorAccion) return;
    const t = setTimeout(() => setErrorAccion(null), 5000);
    return () => clearTimeout(t);
  }, [errorAccion]);

  const mutacion = useMutation({
    mutationFn: (v: { id: string; estado: string; nota?: string }) =>
      api(`/api/pedidos/${v.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: v.estado, ...(v.nota ? { nota: v.nota } : {}) }),
      }),
    onMutate: async (v) => {
      setErrorAccion(null);
      await cliente.cancelQueries({ queryKey: clave });
      const previo = cliente.getQueryData<Tablero>(clave);
      if (previo) {
        conTransicionDeVista(() => {
          flushSync(() => {
            cliente.setQueryData<Tablero>(clave, aplicarEstado(previo, v.id, v.estado));
          });
        });
      }
      return { previo };
    },
    onError: (e, v, ctx) => {
      if (ctx?.previo) cliente.setQueryData(clave, ctx.previo);
      setErrorAccion(
        e instanceof ErrorApi
          ? e.message
          : v.estado === "CANCELADO"
            ? "No se pudo cancelar."
            : "No se pudo actualizar.",
      );
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: clave }),
  });

  const falla = consulta.error ? clasificarError(consulta.error, slug) : null;

  return {
    tablero: consulta.data ?? null,
    error: errorAccion ?? falla?.mensaje ?? null,
    desconectado: falla?.desconectado ?? false,
    sinSesion: falla?.sinSesion ?? false,
    ocupado: mutacion.isPending ? (mutacion.variables?.id ?? null) : null,
    cambiarEstado: (id: string, estado: string, nota?: string) =>
      mutacion.mutateAsync({ id, estado, nota }),
  };
}
