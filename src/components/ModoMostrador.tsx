"use client";

/**
 * Modo mostrador — la pantalla que se muestra al entregar.
 *
 * Es el único momento en que el teléfono del estudiante lo mira otra persona, y
 * dura tres segundos. Todo lo que no sirva para esos tres segundos estorba: acá
 * no hay navegación, ni total, ni línea de tiempo, ni detalle del pedido. Hay
 * un código enorme y, si hace falta, un QR.
 *
 * Decisiones que salen de ese contexto y no de una preferencia:
 *
 *   1. **Fondo claro, siempre.** Aunque el estudiante tenga la aplicación en
 *      modo oscuro. Un mostrador tiene luz de techo y a veces sol de lado; el
 *      texto oscuro sobre fondo claro se lee de lejos y con reflejos, y el
 *      lector de QR espera módulos oscuros sobre claro. El brillo de la
 *      pantalla lo sube el propio blanco.
 *   2. **La pantalla no se apaga.** El fallo real del retiro es el teléfono
 *      bloqueándose justo cuando llega el turno.
 *   3. **Se sale con un toque en cualquier lado.** Nadie busca una X mientras
 *      dos personas miran la pantalla.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CodigoPedido } from "@/components/CodigoPedido";
import { Icono } from "@/components/iconos";

/**
 * Mantiene la pantalla encendida mientras el modo está abierto.
 *
 * `wakeLock` no existe en todos los navegadores y el sistema puede revocarlo.
 * Las dos cosas se tratan como normales: sin él la pantalla se apaga como
 * siempre y el estudiante la toca. No es un error que reportarle.
 */
function usePantallaDespierta(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    type ConWakeLock = Navigator & {
      wakeLock?: {
        request: (t: "screen") => Promise<{ release: () => Promise<void> }>;
      };
    };
    const nav = navigator as ConWakeLock;
    if (!nav.wakeLock) return;

    let candado: { release: () => Promise<void> } | null = null;
    let vivo = true;

    nav.wakeLock
      .request("screen")
      .then((c) => {
        if (!vivo) {
          c.release().catch(() => undefined);
          return;
        }
        candado = c;
      })
      .catch(() => undefined);

    return () => {
      vivo = false;
      candado?.release().catch(() => undefined);
    };
  }, [activo]);
}

export function ModoMostrador({
  abierto,
  codigo,
  comercio,
  ubicacion,
  onCerrar,
}: {
  abierto: boolean;
  codigo: string;
  comercio: string;
  ubicacion?: string | null;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [verQr, setVerQr] = useState(false);

  usePantallaDespierta(abierto);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  // El generador se carga solo cuando alguien pide el QR: importarlo en la
  // carga inicial se lo cobraría a todos los que nunca lo abren.
  useEffect(() => {
    if (!verQr || qr) return;
    let vigente = true;
    import("qrcode")
      .then((m) =>
        m.default.toString(codigo, {
          type: "svg",
          margin: 0,
          errorCorrectionLevel: "M",
        }),
      )
      .then((svg) => vigente && setQr(svg))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [verQr, qr, codigo]);

  const alCerrar = useCallback(() => {
    // El QR se repliega acá y no en un efecto: cerrar es un evento, y un
    // `setState` síncrono dentro de un efecto encadena renders sin necesidad.
    setVerQr(false);
    onCerrar();
  }, [onCerrar]);

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      aria-label="Código de retiro"
      /* Colores literales y no tokens: este modo NO sigue el tema del usuario.
         Ver el comentario de arriba — se lee de lejos, con reflejos, y el QR
         necesita fondo claro para que lo tomen los lectores. */
      className="m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-white p-0 text-[#171717] backdrop:bg-black"
    >
      {/* Todo el fondo cierra: nadie busca una X con dos personas mirando. */}
      <button
        type="button"
        onClick={() => dialogo.current?.close()}
        aria-label="Salir del modo mostrador"
        className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center"
      >
        <span className="text-caption font-bold uppercase tracking-[0.28em] text-[#757575]">
          Código de retiro
        </span>

        {/* El dato, una sola vez y tan grande como la pantalla permita. Con
            color, que es lo que lo hace distinguible de otro código parecido
            justo cuando dos personas lo comparan con prisa. */}
        <CodigoPedido codigo={codigo} tamano="mostrador" />

        <span className="flex flex-col items-center gap-1">
          <span className="flex items-center gap-1.5 text-h3 font-semibold">
            <Icono nombre="local" size={20} />
            {comercio}
          </span>
          {ubicacion && (
            <span className="text-cuerpo text-[#6b6b6b]">{ubicacion}</span>
          )}
        </span>

        {verQr ? (
          <span className="block">
            {qr ? (
              <span
                className="block h-52 w-52 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            ) : (
              <span className="esqueleto-brillo block h-52 w-52 rounded-sm bg-[#f1f2f0]" />
            )}
          </span>
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              // El QR se abre sin cerrar el modo: el clic del fondo cierra.
              e.stopPropagation();
              setVerQr(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setVerQr(true);
              }
            }}
            className="rounded-md border border-[#e4e4e1] px-5 py-3 text-cuerpo font-semibold"
          >
            Mostrar QR
          </span>
        )}

        <span className="text-caption text-[#757575]">
          Tocá la pantalla para volver
        </span>
      </button>
    </dialog>
  );
}
