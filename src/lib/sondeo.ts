"use client";

/**
 * Sondeo consciente de si alguien está mirando (ADR-14).
 *
 * El ADR-05 decidió sondear en vez de abrir un WebSocket, y ese argumento sigue
 * siendo correcto: una petición idempotente que se reintenta sola tolera mejor
 * el WiFi del campus que una conexión que hay que reconectar.
 *
 * Lo que estaba mal era sondear SIEMPRE. La pantalla del pedido es justamente
 * la que el estudiante deja abierta y se guarda en el bolsillo: una pestaña en
 * segundo plano pedía seis veces por minuto para repintar algo que nadie está
 * viendo. Multiplicado por los usuarios de una hora pico, eso era dos tercios
 * del consumo de cómputo del plan gratuito (ADR-18) gastado en píxeles
 * invisibles.
 *
 * Ahora el sondeo se detiene cuando la pestaña se oculta y se reanuda —con una
 * carga inmediata— cuando vuelve. El hueco que eso deja mientras el teléfono
 * está guardado lo cubre Web Push, que era el punto: el aviso llega al bolsillo
 * sin que la pantalla tenga que estar despierta.
 */

import { useEffect, useRef } from "react";

/** ¿Hay alguien mirando esta pestaña? En el servidor se asume que sí. */
function visible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

/**
 * Ejecuta `cargar` cada `intervaloMs`, pero solo mientras la pestaña esté
 * visible.
 *
 * `cargar` tiene que ser estable (envuelta en `useCallback`), igual que con un
 * `useEffect` normal: si cambia de identidad en cada render, el intervalo se
 * reinicia constantemente y no se cumple ninguna cadencia.
 */
export function useSondeo(cargar: () => void, intervaloMs: number): void {
  // La función vive en una ref para que el efecto no dependa de ella. Así el
  // temporizador sobrevive a un cambio de identidad de `cargar` en vez de
  // reiniciarse, que es el error clásico de este patrón.
  const ref = useRef(cargar);

  // La asignación va en un efecto y no en el cuerpo del componente: escribir a
  // una ref durante el render rompe el render concurrente de React, y el
  // temporizador la lee de forma asíncrona, así que actualizarla un tick
  // después no cambia nada.
  useEffect(() => {
    ref.current = cargar;
  }, [cargar]);

  useEffect(() => {
    let temporizador: ReturnType<typeof setInterval> | null = null;

    const detener = () => {
      if (temporizador === null) return;
      clearInterval(temporizador);
      temporizador = null;
    };

    const arrancar = () => {
      if (temporizador !== null) return;
      temporizador = setInterval(() => ref.current(), intervaloMs);
    };

    const alCambiarVisibilidad = () => {
      if (visible()) {
        // Carga inmediata al volver, antes de reanudar la cadencia. Sin esto,
        // el estudiante que desbloquea el teléfono vería el estado viejo
        // durante hasta diez segundos — justo el momento en que más le importa.
        ref.current();
        arrancar();
      } else {
        detener();
      }
    };

    // Primera carga siempre, esté visible o no: la pantalla necesita algo que
    // mostrar aunque se haya abierto desde un aviso en segundo plano.
    ref.current();
    if (visible()) arrancar();

    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      detener();
    };
  }, [intervaloMs]);
}
