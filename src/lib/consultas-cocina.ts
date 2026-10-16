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

import { useEffect, useRef, useState } from "react";
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
  items: {
    productoId: string;
    nombre: string;
    cantidad: number;
    tiempoPreparacionMin: number;
  }[];
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

/** Respuesta del servidor: el tablero completo o "no cambió nada". */
export type RespuestaTablero =
  | Tablero
  | { sinCambios: true; generadoEn: string };

/**
 * Si el servidor dice "no cambió nada", se conserva el tablero previo y solo se
 * refresca `generadoEn`. Sin tablero previo no hay nada que conservar: devuelve
 * null para que el llamador pida el cuerpo completo.
 */
export function combinarTablero(
  previo: Tablero | undefined,
  r: RespuestaTablero,
): Tablero | null {
  if (!("sinCambios" in r)) return r;
  return previo ? { ...previo, generadoEn: r.generadoEn } : null;
}

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

/**
 * GET del tablero con validador. Va con `fetch` y no con `api` porque necesita
 * leer la cabecera `ETag` de la respuesta, que `api` no expone.
 */
async function pedirTablero(
  slug: string,
  etag: string | null,
): Promise<{ respuesta: RespuestaTablero; etag: string | null }> {
  const res = await fetch(`/api/cocina/${slug}`, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  const texto = await res.text();
  let datos: { codigo?: string; error?: string; detalle?: unknown } | null = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = null;
  }
  if (!res.ok) {
    throw new ErrorApi(
      datos?.codigo ?? "ERROR",
      datos?.error ?? "No se pudo completar la operación",
      res.status,
      datos?.detalle,
    );
  }
  return { respuesta: datos as unknown as RespuestaTablero, etag: res.headers.get("ETag") };
}

export function useTableroCocina(slug: string) {
  const cliente = useQueryClient();
  // ETag de la última respuesta que ESTE cliente recibió del servidor.
  const etagRef = useRef<string | null>(null);
  const clave = claveTablero(slug);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: clave,
    queryFn: async () => {
      const previo = cliente.getQueryData<Tablero>(clave);
      const primera = await pedirTablero(slug, previo ? etagRef.current : null);
      const tablero = combinarTablero(previo, primera.respuesta);
      if (tablero) {
        etagRef.current = primera.etag;
        return tablero;
      }
      const completa = await pedirTablero(slug, null);
      etagRef.current = completa.etag;
      return completa.respuesta as Tablero;
    },
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
    mutationFn: (v: {
      id: string;
      estado: string;
      nota?: string;
      agotados?: string[];
      entrega?: { codigo?: string; sinCodigo?: boolean };
    }) =>
      api(`/api/pedidos/${v.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({
          estado: v.estado,
          ...(v.nota ? { nota: v.nota } : {}),
          ...(v.agotados?.length ? { agotados: v.agotados } : {}),
          ...(v.entrega?.codigo ? { codigo: v.entrega.codigo } : {}),
          ...(v.entrega?.sinCodigo ? { sinCodigo: true } : {}),
        }),
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

  // Avance en lote de una franja. Sin optimismo: el servidor decide cuáles
  // pedidos avanzan y cuáles se omiten, y el tablero se recarga con su palabra.
  const lote = useMutation({
    mutationFn: (v: { franjaId: string; hacia: "EN_PREPARACION" | "LISTO" }) =>
      api<{ avanzados: number; omitidos: number }>(
        `/api/cocina/${slug}/franjas/${v.franjaId}/avanzar`,
        { method: "POST", body: JSON.stringify({ hacia: v.hacia }) },
      ),
    onError: (e) => {
      setErrorAccion(
        e instanceof ErrorApi ? e.message : "No se pudo avanzar la franja.",
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
    /** Franja con un avance en lote en curso. */
    loteOcupado: lote.isPending ? (lote.variables?.franjaId ?? null) : null,
    avanzarFranja: (franjaId: string, hacia: "EN_PREPARACION" | "LISTO") =>
      lote.mutateAsync({ franjaId, hacia }),
    cambiarEstado: (
      id: string,
      estado: string,
      nota?: string,
      agotados?: string[],
      entrega?: { codigo?: string; sinCodigo?: boolean },
    ) => mutacion.mutateAsync({ id, estado, nota, agotados, entrega }),
  };
}
