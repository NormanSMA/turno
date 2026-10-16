"use client";

import { LazyMotion, MotionConfig } from "motion/react";

/**
 * Motion solo donde se usa (ADR-23, fase 7).
 *
 * Antes `MovimientoProveedor` envolvía TODA la app, y con él Motion entraba en
 * la carga inicial de cada ruta (~72 KB comprimidos). Ahora cada componente que
 * anima con `m` se envuelve a sí mismo: las rutas que no los usan no descargan
 * Motion. Las funciones (`domAnimation`) se cargan bajo demanda, y
 * `reducedMotion="user"` respeta la preferencia del sistema.
 */
const cargarFunciones = () => import("./funciones").then((modulo) => modulo.default);

export function ConMovimiento({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={cargarFunciones} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
