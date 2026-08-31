"use client";

/**
 * Reloj compartido. `Date.now()` en el render es impuro, y un temporizador por
 * pantalla haría que dos vistas muestren minutos distintos del mismo pedido.
 *
 * 20 s por defecto: se muestran minutos, y repintar sesenta veces para cambiar
 * un número una vez gasta batería.
 */

import { useEffect, useState } from "react";

export function useAhora(intervaloMs = 20_000): Date {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);

  return ahora;
}

/** Minutos que faltan para `cuando`. Negativo si ya pasó. */
export function minutosHasta(cuando: string | Date, ahora: Date): number {
  const t = typeof cuando === "string" ? new Date(cuando) : cuando;
  return Math.round((t.getTime() - ahora.getTime()) / 60_000);
}
