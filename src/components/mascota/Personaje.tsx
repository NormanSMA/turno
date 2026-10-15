"use client";

import { m } from "motion/react";

/**
 * Personajes de Open Peeps (CC0), recoloreados con la paleta de TURNO (ADR-22).
 *
 * Los dibujos viven en `public/personajes/*.svg` y se referencian con `<use>`:
 * un solo archivo cacheado en lugar de 30 KB de trazos dentro del JS de cada
 * ruta. Los colores son variables CSS que cruzan el `<use>`, así que siguen el
 * tema claro y oscuro sin una segunda copia de cada archivo.
 *
 * Accesorios propios de TURNO sobre el dibujo: mochila (estudiante) y delantal
 * con gorro de cocina (cocinero). Origen y licencia: `docs/licencias-assets.md`.
 */
export type QuienPersonaje = "estudiante" | "cocinero";

const COLORES = {
  "--peep-tinta": "var(--color-texto)",
  "--peep-papel": "var(--color-superficie)",
  "--peep-marca": "var(--color-marca-fondo)",
  "--peep-dorado": "var(--color-fidelidad)",
} as React.CSSProperties;

export function Personaje({
  quien,
  size = 160,
  titulo,
}: {
  quien: QuienPersonaje;
  /** Altura en px. El dibujo mide 240x324. */
  size?: number;
  titulo?: string;
}) {
  return (
    <m.svg
      viewBox="0 0 240 324"
      width={(size * 240) / 324}
      height={size}
      style={COLORES}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      <use href={`/personajes/${quien}.svg#fig`} />
    </m.svg>
  );
}
