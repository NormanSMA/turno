/**
 * Aviso local de "tu pedido está listo". Caminando nadie mira el teléfono, y el
 * sondeo detectaba el cambio a LISTO solo para repintar una pantalla que nadie
 * está viendo. Acá el teléfono vibra y avisa con la pestaña en segundo plano.
 *
 * ALCANCE: es la Notification API, no Web Push — funciona mientras la página
 * siga cargada en alguna pestaña. Con todo cerrado entrega `push.ts`.
 *
 * El permiso NO se pide al cargar: preguntar antes de que exista un motivo
 * recibe un "no" casi siempre, y ese "no" es difícil de revertir.
 */

import { useCallback, useSyncExternalStore } from "react";

export type EstadoPermiso = "sin-soporte" | "default" | "granted" | "denied";

export function estadoPermiso(): EstadoPermiso {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "sin-soporte";
  }
  return Notification.permission as EstadoPermiso;
}

export async function pedirPermiso(): Promise<EstadoPermiso> {
  if (estadoPermiso() === "sin-soporte") return "sin-soporte";
  return (await Notification.requestPermission()) as EstadoPermiso;
}

/**
 * Avisa que el pedido está listo.
 *
 * `tag` fija la identidad del aviso: si el sondeo dispara dos veces por una
 * carrera, el segundo REEMPLAZA al primero en vez de apilarse. Nadie quiere
 * cuatro avisos del mismo pedido.
 *
 * La vibración va aparte del permiso de notificaciones porque son cosas
 * distintas: el bolsillo percibe la vibración aunque el permiso esté denegado.
 */
export function avisarListo(codigo: string, comercio: string): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    // Dos pulsos cortos: se distingue de una llamada o un mensaje sin ser
    // alarmante. Los navegadores la ignoran si no hubo interacción previa.
    navigator.vibrate?.([120, 60, 120]);
  }

  if (estadoPermiso() !== "granted") return;
  try {
    new Notification("Tu pedido está listo", {
      body: `${comercio} · mostrá el código ${codigo}`,
      tag: `turno-listo-${codigo}`,
      icon: "/icon",
      badge: "/icon",
    });
  } catch {
    // Algunos navegadores móviles exigen crear la notificación desde el
    // service worker. Si el constructor falla, la pantalla ya muestra el
    // estado nuevo: se pierde el aviso, no la información.
  }
}

/**
 * Lee el permiso de notificaciones como lo que es: estado que vive fuera de
 * React y puede cambiar sin que React se entere —el usuario puede revocarlo
 * desde la barra del navegador—.
 *
 * `useSyncExternalStore` es la herramienta correcta acá, y además resuelve la
 * hidratación: el servidor no tiene `Notification`, así que su instantánea es
 * `"default"` y el cliente corrige después sin discrepancia.
 *
 * La suscripción usa la Permissions API, que emite `change` cuando el permiso
 * se otorga o se revoca. Donde no exista, `revalidar` fuerza la relectura tras
 * pedirlo.
 */
let revision = 0;
const oyentes = new Set<() => void>();

function avisarCambio() {
  revision++;
  oyentes.forEach((f) => f());
}

function suscribir(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  let permiso: PermissionStatus | null = null;
  if (typeof navigator !== "undefined" && navigator.permissions?.query) {
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((p) => {
        permiso = p;
        p.addEventListener("change", avisarCambio);
      })
      .catch(() => undefined);
  }
  return () => {
    oyentes.delete(alCambiar);
    permiso?.removeEventListener("change", avisarCambio);
  };
}

// Prefijo `use` en inglés aunque el resto del código esté en español: no es
// una preferencia de estilo, es el contrato que React y su linter usan para
// reconocer un hook y verificar sus reglas.
export function usePermisoAviso(): {
  permiso: EstadoPermiso;
  pedir: () => Promise<void>;
} {
  const permiso = useSyncExternalStore(
    suscribir,
    () => `${estadoPermiso()}|${revision}`,
    () => "default|0",
  ).split("|")[0] as EstadoPermiso;

  const pedir = useCallback(async () => {
    await pedirPermiso();
    // Por si el navegador no implementa el evento `change` de la Permissions
    // API: sin esto, el botón quedaría visible después de otorgar el permiso.
    avisarCambio();
  }, []);

  return { permiso, pedir };
}
