"use client";

/**
 * Lector del QR de retiro, para el mostrador.
 *
 * ## Por qué existe
 *
 * El estudiante ya mostraba un QR en `ModoMostrador`, y la documentación de ese
 * componente decía que el QR "acelera al comercio, pero exige que el mostrador
 * tenga con qué escanear". El mostrador no tenía con qué: se generaba un código
 * que nadie leía. Esta es la mitad que faltaba.
 *
 * ## Lo que lee
 *
 * El QR no lleva una URL ni un identificador interno: lleva **el mismo código
 * de retiro** que está impreso debajo en grande (`ABC-DEF`). Por eso escanear y
 * dictar terminan en el mismo sitio, y por eso este componente no habla con la
 * red: devuelve un texto y quien lo llama decide qué hacer con él.
 *
 * Que las dos vías converjan es lo que impide que se separen. Un escáner que
 * resolviera el pedido por su cuenta sería un segundo camino de entrega, y dos
 * caminos hacia el mismo estado terminan comportándose distinto.
 *
 * ## Los dos decodificadores
 *
 * `BarcodeDetector` es nativo, va en el hilo del compositor y no cuesta nada de
 * descarga — pero no existe en Safari ni en Firefox. Como el mostrador puede
 * ser un iPad, hace falta el respaldo: `jsQR`, que se importa **solo cuando el
 * nativo no está**, para no cobrarle 270 KB a quien no los necesita.
 *
 * ## Lo que se aprendió del contexto
 *
 * Un mostrador con prisa: la cámara se apaga sola al cerrar (si no, queda
 * encendida y la tablet se calienta toda la tarde), el permiso denegado no es
 * un error sino un camino alternativo —dictar el código— y una lectura buena
 * vibra, porque en una cocina con ruido nadie oye un pitido.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Icono } from "@/components/iconos";

/** Cuántos milisegundos entre intentos de decodificación. */
const INTERVALO_MS = 180;

type Estado = "PIDIENDO" | "LEYENDO" | "SIN_PERMISO" | "SIN_CAMARA";

interface DetectorCodigos {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/**
 * Resuelve el decodificador una sola vez.
 *
 * Devuelve una función que recibe el fotograma ya dibujado y devuelve el texto
 * leído, o `null`. Unificar las dos implementaciones detrás de la misma firma
 * deja el bucle de lectura con una sola rama, en vez de un `if` por fotograma.
 */
async function crearDecodificador(): Promise<
  (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => Promise<string | null>
> {
  const Nativo = (
    globalThis as unknown as {
      BarcodeDetector?: new (o: { formats: string[] }) => DetectorCodigos;
    }
  ).BarcodeDetector;

  if (Nativo) {
    const detector = new Nativo({ formats: ["qr_code"] });
    return async (canvas) => {
      try {
        const [primero] = await detector.detect(canvas);
        return primero?.rawValue ?? null;
      } catch {
        // Un fotograma que el detector no digiere no es un fallo del escáner:
        // el siguiente llega en 180 ms.
        return null;
      }
    };
  }

  const { default: jsQR } = await import("jsqr");
  return async (canvas, ctx) => {
    const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const leido = jsQR(imagen.data, imagen.width, imagen.height, {
      inversionAttempts: "dontInvert",
    });
    return leido?.data ?? null;
  };
}

export function EscanerRetiro({
  onLeer,
  onCerrar,
}: {
  /** Recibe el texto crudo del QR. Quien llama decide si le sirve. */
  onLeer: (texto: string) => void;
  onCerrar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<Estado>("PIDIENDO");

  /*
   * `onLeer` en una ref y no en las dependencias del efecto.
   *
   * Quien llama suele pasar una función nueva en cada render; si estuviera en
   * las dependencias, la cámara se apagaría y volvería a pedirse en cada uno.
   * En una tablet eso es un parpadeo constante y un permiso que se renegocia.
   */
  const alLeer = useRef(onLeer);
  /* La sincronización va en un efecto y no en el cuerpo del componente: React
     puede renderizar dos veces sin confirmar, y escribir una ref durante el
     render deja el valor cambiado por un render que nunca ocurrió. */
  useEffect(() => {
    alLeer.current = onLeer;
  }, [onLeer]);

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    async function arrancar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado("SIN_CAMARA");
        return;
      }

      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          // La trasera: el mostrador apunta al teléfono del estudiante.
          video: { facingMode: "environment" },
        });
      } catch (e) {
        if (!vivo) return;
        // Distinguir el permiso denegado de la ausencia de cámara cambia el
        // texto que se muestra, y con él lo que la persona puede hacer.
        const nombre = (e as DOMException)?.name;
        setEstado(nombre === "NotAllowedError" ? "SIN_PERMISO" : "SIN_CAMARA");
        return;
      }

      if (!vivo || !video.current) {
        flujo?.getTracks().forEach((t) => t.stop());
        return;
      }

      video.current.srcObject = flujo;
      await video.current.play().catch(() => undefined);
      if (!vivo) return;
      setEstado("LEYENDO");

      const decodificar = await crearDecodificador();
      const lienzo = document.createElement("canvas");
      const ctx = lienzo.getContext("2d", { willReadFrequently: true });
      if (!ctx || !vivo) return;

      const mirar = async () => {
        if (!vivo || !video.current) return;
        const v = video.current;

        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          lienzo.width = v.videoWidth;
          lienzo.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);

          const texto = await decodificar(lienzo, ctx);
          if (texto && vivo) {
            // Vibrar y no pitar: en una cocina con extractor nadie oye un
            // pitido, y el teléfono está en la mano.
            navigator.vibrate?.(60);
            alLeer.current(texto);
            return; // Una lectura cierra el bucle; quien llama decide seguir.
          }
        }

        temporizador = setTimeout(mirar, INTERVALO_MS);
      };

      void mirar();
    }

    void arrancar();

    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      /*
       * Apagar la cámara explícitamente.
       *
       * Quitar el `srcObject` no libera el dispositivo: sin parar cada pista,
       * el piloto de la cámara se queda encendido y la tablet del mostrador se
       * calienta toda la tarde con el escáner cerrado.
       */
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const cerrar = useCallback(() => onCerrar(), [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-tinta/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Escanear el código del pedido"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="font-semibold text-white">Escaneá el código</p>
        <button
          type="button"
          onClick={cerrar}
          className="toque flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white"
        >
          <Icono nombre="cerrar" size={16} />
          Cerrar
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={video}
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {estado === "LEYENDO" && (
          /* Una mira, no un marco decorativo: le dice a la persona dónde poner
             el teléfono del estudiante, que es la única duda que tiene. */
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-lg border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}

        {estado !== "LEYENDO" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-lg bg-papel-alto p-5 text-center">
              {estado === "PIDIENDO" && (
                <p className="text-sm text-tinta-suave">Abriendo la cámara…</p>
              )}
              {estado === "SIN_PERMISO" && (
                <>
                  <p className="font-semibold">La cámara está bloqueada</p>
                  <p className="mt-1 text-sm text-tinta-suave">
                    Permitila desde el candado de la barra de direcciones. Mientras
                    tanto, escribí el código que el estudiante tiene en pantalla:
                    funciona igual.
                  </p>
                </>
              )}
              {estado === "SIN_CAMARA" && (
                <>
                  <p className="font-semibold">Este equipo no tiene cámara</p>
                  <p className="mt-1 text-sm text-tinta-suave">
                    Escribí el código que el estudiante tiene en pantalla.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center text-sm text-white/70">
        Apuntá al código del teléfono. Si no lee, escribí el código a mano.
      </p>
    </div>
  );
}
