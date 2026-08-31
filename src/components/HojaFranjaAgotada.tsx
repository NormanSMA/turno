"use client";

/**
 * "Tu hora cambió" — recuperación cuando la franja se llenó.
 *
 * EL DEFECTO QUE ARREGLA. El servidor ya devolvía alternativas en el 409:
 * `detalle.alternativas`, con la franja, la holgura y cuál sugiere. El cliente
 * las tiraba: se quedaba con `e.message`, pintaba un cartel rojo y encima hacía
 * `setElegida(null)`. Desde el asiento del estudiante eso era «error» + su hora
 * desapareció sin explicación, con el carrito armado y ninguna salida.
 *
 * Las tres preguntas que toda recuperación tiene que responder:
 *
 *   ¿Qué pasó?          otra persona tomó la última capacidad de esa hora
 *   ¿Qué se conservó?   el pedido entero, intacto
 *   ¿Qué puedo hacer?   estas horas sí entran; elegí una y seguimos
 *
 * Por eso NO es un cartel de error sino una hoja con acción: llega con una
 * opción ya preseleccionada —la que el servidor sugiere— para que salir del
 * problema cueste un solo toque.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Icono } from "@/components/iconos";
import { horaCorta } from "@/lib/cliente";

export interface AlternativaFranja {
  franjaId: string;
  inicio: string;
  fin: string;
  holguraMin: number;
  sugerida: boolean;
}

/**
 * Cada motivo de rechazo tiene su propia explicación.
 *
 * "Se llenó" y "ya no da tiempo" son cosas distintas y el estudiante las vive
 * distinto: una es mala suerte, la otra es que tardó. Darle el mismo texto a
 * las dos es lo que hace que un sistema se sienta genérico.
 */
const MOTIVOS: Record<string, { titulo: string; porque: string }> = {
  SIN_FRANJA_DISPONIBLE: {
    titulo: "Esa hora se llenó",
    porque:
      "Otra persona reservó la última capacidad mientras armabas tu pedido.",
  },
  FUERA_DE_CUTOFF: {
    titulo: "Ya no da tiempo",
    porque:
      "Tu pedido necesita más minutos de cocina de los que quedan hasta esa hora.",
  },
  CARGA_EXCEDE_CAPACIDAD_TOTAL: {
    titulo: "El pedido no entra en una sola hora",
    porque:
      "Junto ocupa más cocina de la que cabe en una ventana. Probá dividirlo en dos pedidos.",
  },
};

const GENERICO = {
  titulo: "Tu hora cambió",
  porque: "La hora que elegiste ya no tiene capacidad suficiente.",
};

export function HojaFranjaAgotada({
  motivo,
  alternativas,
  onElegir,
  onCerrar,
}: {
  /** `null` = cerrada. */
  motivo: string | null;
  alternativas: AlternativaFranja[];
  /** Reintenta con la franja elegida, sin tocar el carrito. */
  onElegir: (franjaId: string) => void;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  // Llega con la sugerida ya marcada: salir del problema tiene que costar un
  // toque, no dos.
  const preferida =
    alternativas.find((a) => a.sugerida)?.franjaId ??
    alternativas[0]?.franjaId ??
    null;
  const [elegida, setElegida] = useState<string | null>(preferida);
  const [ultimoMotivo, setUltimoMotivo] = useState(motivo);

  // Reset al abrirse con un rechazo nuevo: arrastrar la selección del anterior
  // haría que el botón dijera una hora que ya no está en la lista.
  if (motivo !== ultimoMotivo) {
    setUltimoMotivo(motivo);
    setElegida(preferida);
  }

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (motivo && !d.open) d.showModal();
    if (!motivo && d.open) d.close();
  }, [motivo]);

  const alCerrar = useCallback(() => onCerrar(), [onCerrar]);

  if (!motivo) {
    return <dialog ref={dialogo} className="hidden" onClose={alCerrar} />;
  }

  const texto = MOTIVOS[motivo] ?? GENERICO;
  const hayOpciones = alternativas.length > 0;

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      aria-labelledby="franja-agotada-titulo"
      className="hoja m-0 mt-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-borde bg-superficie p-0 text-texto backdrop:bg-texto/60 sm:mx-auto sm:mb-auto sm:max-h-[88dvh] sm:rounded-xl"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <span
          aria-hidden
          className="mx-auto mb-4 block h-1 w-10 rounded-full bg-borde sm:hidden"
        />

        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-aviso">
            <Icono nombre="reloj" size={24} />
          </span>
          <div className="min-w-0">
            <h2 id="franja-agotada-titulo" className="titulo text-h2">
              {texto.titulo}
            </h2>
            <p className="mt-1 text-cuerpo text-texto-2">{texto.porque}</p>
          </div>
        </div>

        {/* Lo primero que hay que decir, antes que las opciones: no perdiste
            nada. Es la diferencia entre un problema y un desastre. */}
        <p className="mt-4 flex items-center gap-2 rounded-md bg-exito-suave px-3.5 py-3 text-chico font-medium text-exito">
          <Icono nombre="palomita" size={16} />
          Tu pedido sigue armado. No hay que empezar de nuevo.
        </p>

        {hayOpciones ? (
          <>
            <p className="mt-5 text-chico font-medium">
              Estas horas sí entran:
            </p>
            <ul
              role="radiogroup"
              aria-label="Horas disponibles"
              className="mt-2 space-y-2"
            >
              {alternativas.map((a) => {
                const activa = elegida === a.franjaId;
                return (
                  <li key={a.franjaId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activa}
                      onClick={() => setElegida(a.franjaId)}
                      className={`presiona flex min-h-14 w-full items-center gap-3 rounded-md border px-4 text-left transition-colors ${
                        activa
                          ? "border-marca-texto bg-marca-suave"
                          : "border-borde bg-superficie hover:border-texto-3"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          activa ? "border-marca-texto" : "border-borde"
                        }`}
                      >
                        {activa && (
                          <span className="h-2.5 w-2.5 rounded-full bg-marca-fondo" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="hora block text-h3 font-bold">
                          {horaCorta(a.inicio)} — {horaCorta(a.fin)}
                        </span>
                        {/* Holgura en palabras, no en fórmula: al estudiante le
                            sirve saber si va justo, no cuántos minutos-cocina
                            quedan libres (§51). */}
                        <span className="block text-caption text-texto-2">
                          {a.holguraMin >= 15
                            ? "Con lugar de sobra"
                            : a.holguraMin >= 5
                              ? "Todavía con lugar"
                              : "Últimos lugares"}
                        </span>
                      </span>

                      {a.sugerida && (
                        <span className="shrink-0 rounded-full bg-exito-suave px-2.5 py-1 text-caption font-semibold text-exito">
                          Mejor opción
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="mt-5 rounded-md bg-atencion-suave px-3.5 py-3 text-chico">
            No quedan horas para este pedido hoy. Podés quitar algo para que
            ocupe menos cocina, o probar en otro comercio.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-borde bg-superficie px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {hayOpciones && elegida && (
          <button
            type="button"
            onClick={() => onElegir(elegida)}
            className="presiona flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-marca-fondo px-4 text-cuerpo font-semibold text-white"
          >
            Reservar{" "}
            <span className="hora font-bold">
              {horaCorta(
                alternativas.find((a) => a.franjaId === elegida)?.inicio ?? "",
              )}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => dialogo.current?.close()}
          className="presiona mt-2 min-h-11 w-full rounded-md px-4 text-chico font-semibold text-texto-2"
        >
          Volver al pedido
        </button>
      </div>
    </dialog>
  );
}
