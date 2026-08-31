"use client";

/**
 * Aviso sonoro del tablero de cocina (§30). Nadie mira la pantalla entre una
 * sartén y una fila; el sonido hace que el pedido nuevo entre cuando llega.
 *
 *   - Sintetizado, no descargado: cero bytes y no depende del caché.
 *   - Corto y agudo: atraviesa ruido sin volverse alarma.
 *   - Arranca apagado y la preferencia es del DISPOSITIVO — la tablet del
 *     mostrador y la del fondo son la misma cuenta y no quieren lo mismo.
 *   - Solo suena tras un gesto: encender el interruptor ES ese gesto.
 */

import { useSyncExternalStore } from "react";

const CLAVE = "turno_sonido_cocina";

// `localStorage` no avisa de sus cambios en la misma pestaña: hay que
// notificar a mano o el botón no se repinta al encenderlo.
const oyentes = new Set<() => void>();

function suscribir(f: () => void): () => void {
  oyentes.add(f);
  // También se escucha `storage`: dos pestañas del mismo tablero deberían
  // coincidir en si el sonido está encendido.
  addEventListener("storage", f);
  return () => {
    oyentes.delete(f);
    removeEventListener("storage", f);
  };
}

let contexto: AudioContext | null = null;

/** ¿Está encendido en ESTE dispositivo? */
export function sonidoEncendido(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    // Modo privado o almacenamiento bloqueado. Sin sonido se sigue trabajando;
    // que no se pueda guardar una preferencia no es motivo para romper nada.
    return false;
  }
}

export function guardarSonido(encendido: boolean): void {
  try {
    localStorage.setItem(CLAVE, encendido ? "1" : "0");
  } catch {
    // Ídem: la sesión funciona igual, solo que no se recuerda.
  }
  oyentes.forEach((f) => f());
}

/**
 * `useSyncExternalStore` y no `useState` + efecto: el servidor no tiene
 * `localStorage` y el primer render tiene que coincidir en los dos lados.
 */
export function useSonido(): boolean {
  return useSyncExternalStore(
    suscribir,
    sonidoEncendido,
    // En el servidor siempre apagado: es también el valor por defecto real.
    () => false,
  );
}

/**
 * Prepara el audio. Se llama desde el clic que enciende el interruptor, porque
 * es el gesto que los navegadores exigen para permitir sonido.
 */
export function despertarAudio(): void {
  try {
    contexto ??= new AudioContext();
    void contexto.resume();
  } catch {
    contexto = null;
  }
}

/** Dos notas ascendentes, ~180 ms. Una caída se leería como error. */
export function sonarPedidoNuevo(): void {
  if (!sonidoEncendido()) return;
  try {
    despertarAudio();
    const ctx = contexto;
    if (!ctx) return;

    [
      { hz: 880, en: 0 },
      { hz: 1320, en: 0.09 },
    ].forEach(({ hz, en }) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;

      // Rampa: un corte seco chasquea y en una tablet suena a falla.
      const t = ctx.currentTime + en;
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    });
  } catch {
    // El audio nunca puede tumbar el tablero.
  }
}

/** Vibración corta, para la tablet que está en silencio. */
export function vibrarPedidoNuevo(): void {
  if (!sonidoEncendido()) return;
  try {
    navigator.vibrate?.([40, 60, 40]);
  } catch {
    // No todos los dispositivos la tienen. No es un error.
  }
}
