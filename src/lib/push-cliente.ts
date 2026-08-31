"use client";

/**
 * Lado del navegador de Web Push (ADR-14). Complementa a `aviso.ts`, que avisa
 * solo con la página cargada; esto avisa con la aplicación cerrada, y es lo que
 * permite dejar de sondear.
 *
 * EL CASO DE iOS. Apple solo entrega push a sitios agregados a la pantalla de
 * inicio: desde una pestaña de Safari `subscribe` falla o nunca recibe nada, y
 * todos los navegadores de iOS usan WebKit. Safari tampoco implementa
 * `beforeinstallprompt`, así que hay que explicar el gesto en vez de ofrecer un
 * botón.
 *
 * Por eso `requiere-instalar` es un estado distinto de `inactiva`: confundirlos
 * da un botón que falla en silencio y enseña que los avisos no funcionan.
 */

import { useCallback, useEffect, useState } from "react";

export type EstadoPush =
  /** El navegador no tiene Push API, o el service worker no está registrado. */
  | "sin-soporte"
  /** iOS en pestaña: hay que agregar a la pantalla de inicio primero. */
  | "requiere-instalar"
  /** El servidor no tiene claves VAPID: suscribirse no serviría de nada. */
  | "sin-configurar"
  /** Se puede activar y todavía no está. */
  | "inactiva"
  /** Este dispositivo está suscrito. */
  | "activa"
  /** El usuario negó el permiso. No se puede volver a pedir desde código. */
  | "denegada"
  /** Todavía no se sabe (primer render, o consultando el registro). */
  | "cargando";

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * base64url → Uint8Array.
 *
 * `applicationServerKey` no acepta la cadena: exige los bytes crudos. Y la
 * clave viaja en base64url (`-` y `_`), no en base64 estándar, así que hay que
 * traducir los dos caracteres y reponer el relleno antes de `atob`.
 */
function clavePublicaEnBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(base64);
  // El `ArrayBuffer` explícito no es adorno: `new Uint8Array(n)` se tipa sobre
  // `ArrayBufferLike`, que incluye `SharedArrayBuffer`, y `applicationServerKey`
  // solo acepta un búfer no compartido.
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

export function soportaPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** ¿Se abrió desde la pantalla de inicio y no desde una pestaña? */
export function estaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // Safari en iOS no implementa `display-mode` y usa esta propiedad propia.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // El iPad con iPadOS 13+ se identifica como Mac; el número de puntos táctiles
  // es lo que lo distingue de una Mac de verdad.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

async function registroActivo(): Promise<ServiceWorkerRegistration | null> {
  if (!soportaPush()) return null;
  try {
    // `ready` se resuelve cuando hay un worker ACTIVO, que es lo que
    // `pushManager` necesita. `getRegistration` puede devolver uno que todavía
    // se está instalando y con el que `subscribe` falla.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function calcularEstado(): Promise<EstadoPush> {
  if (!soportaPush()) {
    // En iOS sin instalar, el navegador ni siquiera expone `PushManager`. Ese
    // caso se reporta como lo que es —falta instalar— y no como "sin soporte",
    // que sonaría a que el teléfono no puede y no es cierto.
    return esIOS() && !estaInstalada() ? "requiere-instalar" : "sin-soporte";
  }
  if (esIOS() && !estaInstalada()) return "requiere-instalar";
  if (!CLAVE_PUBLICA) return "sin-configurar";
  if (Notification.permission === "denied") return "denegada";

  const registro = await registroActivo();
  if (!registro) return "sin-soporte";

  const sus = await registro.pushManager.getSubscription();
  return sus ? "activa" : "inactiva";
}

/**
 * Estado de la suscripción de ESTE dispositivo, con la acción para activarla.
 *
 * El permiso se pide dentro de `activar`, nunca al montar. Un navegador que
 * pregunta por notificaciones antes de que exista un motivo recibe un "no" casi
 * siempre, y ese "no" no se puede revertir desde código — es el mismo criterio
 * que ya aplica `aviso.ts`.
 */
export function useSuscripcionPush(): {
  estado: EstadoPush;
  activar: () => Promise<void>;
  desactivar: () => Promise<void>;
  trabajando: boolean;
} {
  const [estado, setEstado] = useState<EstadoPush>("cargando");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vigente = true;
    calcularEstado().then((e) => {
      if (vigente) setEstado(e);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const activar = useCallback(async () => {
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegada" : "inactiva");
        return;
      }

      const registro = await registroActivo();
      if (!registro) {
        setEstado("sin-soporte");
        return;
      }

      // Reutilizar la suscripción existente si la hay: volver a suscribirse
      // con la misma clave devuelve el mismo endpoint, pero pedirlo de nuevo
      // cuando ya existe es una llamada de red al servicio de push por nada.
      const sus =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          // Obligatorio: el navegador exige que todo push produzca una
          // notificación visible. Un push silencioso sería rastreo.
          userVisibleOnly: true,
          applicationServerKey: clavePublicaEnBytes(CLAVE_PUBLICA),
        }));

      const claves = sus.toJSON().keys;
      const res = await fetch("/api/push/suscripcion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: sus.endpoint,
          p256dh: claves?.p256dh,
          auth: claves?.auth,
        }),
      });

      if (!res.ok) {
        // El servidor no la aceptó, así que no la va a usar. Dejar la
        // suscripción viva en el navegador haría creer que está activa.
        await sus.unsubscribe().catch(() => undefined);
        setEstado("inactiva");
        return;
      }

      setEstado("activa");
    } catch {
      setEstado(await calcularEstado());
    } finally {
      setTrabajando(false);
    }
  }, []);

  const desactivar = useCallback(async () => {
    setTrabajando(true);
    try {
      const registro = await registroActivo();
      const sus = await registro?.pushManager.getSubscription();
      if (sus) {
        // Primero el servidor: si se da de baja en el navegador y la petición
        // falla, queda una fila que envía a un endpoint muerto hasta que el
        // 410 la limpie. El orden inverso solo cuesta un aviso de más.
        await fetch("/api/push/suscripcion", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sus.endpoint }),
        }).catch(() => undefined);
        await sus.unsubscribe().catch(() => undefined);
      }
      setEstado("inactiva");
    } finally {
      setTrabajando(false);
    }
  }, []);

  return { estado, activar, desactivar, trabajando };
}
