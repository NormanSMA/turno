"use client";

/**
 * Pantalla de retiro: el código en grande y su QR.
 *
 * Es el final del recorrido y el único momento en que el estudiante y el
 * comercio comparten una pantalla. Todo acá está optimizado para ese instante:
 * mostrador, prisa, dos personas mirando el mismo teléfono, a veces con ruido
 * de fondo y sin poder oírse.
 *
 * Tres decisiones que salen de ese contexto:
 *
 *   1. **El código va enorme y siempre visible.** No detrás de un botón, no
 *      dentro de un acordeón. Es el dato por el que se abrió la pantalla.
 *   2. **El QR es opcional y secundario.** Acelera al comercio, pero exige que
 *      el mostrador tenga con qué escanear. Si no lo tiene, el código dictado
 *      sigue funcionando — y por eso el QR nunca lo reemplaza.
 *   3. **El brillo sube al abrirlo.** No se puede controlar el brillo desde la
 *      web, pero sí se puede pedir que la pantalla no se apague mientras el
 *      código está a la vista, que es el fallo real: el teléfono se bloquea
 *      justo cuando llega el turno.
 */

import { useEffect, useRef, useState } from "react";
import { CodigoPedido } from "@/components/CodigoPedido";
import { ModoMostrador } from "@/components/ModoMostrador";
import { Icono } from "@/components/iconos";
import { pulso } from "@/lib/movimiento";

/**
 * Mantiene la pantalla encendida mientras el código está visible.
 *
 * `wakeLock` no existe en todos los navegadores y puede ser revocado por el
 * sistema en cualquier momento. Las dos cosas se tratan como normales: si no
 * hay, la pantalla se apaga como siempre y el estudiante la toca. No es un
 * error que haya que reportarle.
 */
function usePantallaDespierta(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    type ConWakeLock = Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
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

export function CodigoRetiro({
  codigo,
  comercio,
  ubicacion,
  listo,
}: {
  codigo: string;
  comercio: string;
  ubicacion?: string | null;
  /** true cuando el comercio ya lo marcó LISTO. Cambia el tono de la pantalla. */
  listo: boolean;
}) {
  const [mostrador, setMostrador] = useState(false);
  const cajaCodigo = useRef<HTMLDivElement>(null);

  usePantallaDespierta(true);


  // Al pasar a LISTO el código late una vez: el estudiante puede estar mirando
  // la pantalla cuando ocurre, y el cambio de color solo no se nota.
  useEffect(() => {
    if (listo) pulso(cajaCodigo.current);
  }, [listo]);

  return (
    <section
      className={`overflow-hidden rounded-lg border-2 transition-colors ${
        listo
          ? "border-exito bg-exito-suave"
          : "border-borde bg-superficie"
      }`}
    >
      <div ref={cajaCodigo} className="px-5 py-6 text-center">
        <p className="etiqueta">
          {listo ? "Ya podés retirarlo" : "Código de retiro"}
        </p>

        {/*
         * El código, UNA sola vez.
         *
         * Antes se pintaba dos veces seguidas: primero en texto plano y grande,
         * y debajo la versión con color. La idea era que la segunda fuera "la
         * que compara la cocina", pero apiladas a diez píxeles una de otra esa
         * distinción no existe — se leen como el mismo dato repetido, y repetir
         * un dato hace dudar de cuál de los dos es el bueno.
         *
         * Queda la versión con color porque hace todo lo que hacía la plana y
         * además distingue `XLZ-Y4B` de `YLZ-Y4B` a un metro de distancia. Es
         * también la misma forma que ve la cocina en su lista.
         */}
        <div className="mt-3 flex justify-center">
          <CodigoPedido codigo={codigo} tamano="xl" />
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-chico text-texto-2">
          <Icono nombre="local" size={16} />
          {comercio}
        </p>
      </div>

      <div className="border-t border-borde/60 p-4">
        {/*
         * Una sola acción: abrir el modo mostrador.
         *
         * Antes acá se desplegaba el QR dentro de la tarjeta, con la navegación
         * y el resto de la pantalla alrededor. Pero el momento de entregar dura
         * tres segundos y lo mira otra persona: todo lo que no sea el código
         * estorba. Por eso el QR se fue a una pantalla propia (§07).
         */}
        <button
          type="button"
          onClick={() => setMostrador(true)}
          className={`presiona flex min-h-13 w-full items-center justify-center gap-2 rounded-md px-4 text-cuerpo font-semibold ${
            listo
              ? "bg-exito text-white"
              : "border border-borde text-texto"
          }`}
        >
          <Icono nombre="buscar" size={18} />
          Mostrar en el mostrador
        </button>
        <p className="mt-2 text-center text-caption text-texto-2">
          Sirve cualquiera de los dos: el número dictado o el QR.
        </p>
      </div>

      <ModoMostrador
        abierto={mostrador}
        codigo={codigo}
        comercio={comercio}
        ubicacion={ubicacion}
        onCerrar={() => setMostrador(false)}
      />
    </section>
  );
}
