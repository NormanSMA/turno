"use client";

/**
 * En qué parte del campus está la persona (§12).
 *
 * En `localStorage` y no en la cuenta, al revés que los favoritos: un favorito
 * describe a la persona; la zona, dónde está parada ahora. Sincronizarla entre
 * el teléfono y la computadora de la biblioteca daría respuestas peores.
 */

import { useSyncExternalStore } from "react";

const CLAVE = "turno_zona";

const oyentes = new Set<() => void>();

function suscribir(f: () => void): () => void {
  oyentes.add(f);
  addEventListener("storage", f);
  return () => {
    oyentes.delete(f);
    removeEventListener("storage", f);
  };
}

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    // Modo privado o almacenamiento bloqueado: sin zona, la lista se ordena
    // igual por disponibilidad y tiempo. Se pierde una comodidad, nada más.
    return null;
  }
}

export function guardarZona(zona: string | null): void {
  try {
    if (zona === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, zona);
  } catch {
    // Ídem.
  }
  oyentes.forEach((f) => f());
}

export function useZona(): string | null {
  // En el servidor siempre `null`: es también el valor por defecto real, así
  // que la hidratación coincide sin trucos.
  return useSyncExternalStore(suscribir, leer, () => null);
}
