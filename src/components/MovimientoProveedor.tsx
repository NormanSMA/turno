"use client";

import { LazyMotion, MotionConfig } from "motion/react";

// ADR-23: Motion entra con LazyMotion y el componente `m`, sin funciones en la
// carga inicial. `reducedMotion="user"` respeta la preferencia del sistema,
// igual que los bloques de globals.css y src/lib/movimiento.ts.
const cargarFunciones = () =>
  import("./movimiento/funciones").then((modulo) => modulo.default);

export function MovimientoProveedor({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={cargarFunciones} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
