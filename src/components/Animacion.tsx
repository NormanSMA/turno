"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import vacio from "./animaciones/vacio.json";

// ADR-23: Lottie solo con el build light de lottie-web (sin expresiones, sin
// `eval`, compatible con el CSP). Las animaciones viven en este repo como JSON.
const ANIMACIONES = { vacio } as const;

export type NombreAnimacion = keyof typeof ANIMACIONES;

export function Animacion({
  nombre,
  tamano = 96,
  etiqueta,
}: {
  nombre: NombreAnimacion;
  tamano?: number;
  /** Texto para lectores de pantalla. Sin etiqueta, la animación es decorativa. */
  etiqueta?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animacion: AnimationItem | undefined;
    let cancelado = false;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (cancelado || !contenedor.current) return;
      animacion = lottie.loadAnimation({
        container: contenedor.current,
        renderer: "svg",
        loop: false,
        autoplay: !reducido,
        animationData: ANIMACIONES[nombre],
      });
      // Con movimiento reducido se muestra el último cuadro, ya dibujado.
      if (reducido) animacion.goToAndStop(animacion.totalFrames - 1, true);
    });

    return () => {
      cancelado = true;
      animacion?.destroy();
    };
  }, [nombre]);

  return (
    <div
      ref={contenedor}
      style={{ width: tamano, height: tamano }}
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
    />
  );
}
