"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { esVersionVieja } from "@/core/version-vieja";

/**
 * Frontera de error de la aplicación.
 *
 * Nunca muestra el mensaje de la excepción: puede traer rutas del servidor o
 * fragmentos de una consulta. El usuario recibe qué hacer; el detalle queda en
 * el registro, que es donde sirve.
 */

/** Para no entrar en un bucle de recargas si el problema es otro. */
const MARCA_RECARGA = "turno_recarga_version";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const vieja = esVersionVieja(error);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    console.error("[turno] error de interfaz:", error);
  }, [error]);

  useEffect(() => {
    if (!vieja) return;

    let yaIntento = false;
    try {
      yaIntento = sessionStorage.getItem(MARCA_RECARGA) === "1";
      sessionStorage.setItem(MARCA_RECARGA, "1");
    } catch {
      // Sin almacenamiento no se puede recordar el intento. Se ofrece el botón
      // en vez de arriesgar un bucle de recargas.
      return;
    }
    if (yaIntento) return;

    // Sin `setState` acá: la recarga se lleva la pantalla igual, así que
    // marcar "cargando" solo agregaría un render que nadie llega a ver.
    void recuperar();
  }, [vieja]);

  /**
   * Tira la copia vieja y recarga desde la red.
   *
   * Las tres cosas hacen falta y en este orden: los cachés guardan el HTML y
   * los fragmentos anteriores, el worker los volvería a servir, y solo una
   * recarga completa reconstruye el mapa de fragmentos en memoria — `reset()`
   * de React no lo toca.
   */
  async function recuperar() {
    try {
      if ("caches" in window) {
        const claves = await caches.keys();
        await Promise.all(claves.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((r) => r.unregister()));
      }
    } catch {
      // Si limpiar falla, la recarga igual vale la pena: el HTML se pide con
      // `reload`, que ignora el caché del navegador.
    }
    location.reload();
  }

  if (vieja) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
        <p className="etiqueta">Hay una versión nueva</p>
        <h1 className="titulo mt-2 text-4xl">Actualizando TURNO</h1>
        <p className="mt-3 text-sm text-tinta-suave">
          {/* Se dice lo que de verdad pasó. "Algo se cortó" haría pensar en la
              conexión y llevaría a reintentar, que acá no arregla nada. */}
          Se publicó una versión mientras tenías la aplicación abierta. Estamos
          cargando la nueva; tus pedidos no se ven afectados.
        </p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => {
              setRecuperando(true);
              void recuperar();
            }}
            disabled={recuperando}
            className="presiona brillo rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-60"
          >
            {recuperando ? "Cargando…" : "Cargar la versión nueva"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
      <p className="etiqueta">Algo se cortó</p>
      <h1 className="titulo mt-2 text-4xl">No pudimos mostrar esto</h1>
      <p className="mt-3 text-sm text-tinta-suave">
        Puede ser la conexión del campus. Probá de nuevo; si sigue igual, volvé
        en un rato.
      </p>

      {error.digest && (
        // El digest identifica el error en el registro del servidor sin revelar
        // nada de él: sirve para que alguien del equipo lo pueda encontrar.
        <p className="hora mt-3 text-xs text-tinta-tenue">ref {error.digest}</p>
      )}

      <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={reset}
          className="presiona brillo rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white"
        >
          Probar de nuevo
        </button>
        <Link
          href="/"
          className="presiona rounded-full border border-borde px-6 py-3 font-medium"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
