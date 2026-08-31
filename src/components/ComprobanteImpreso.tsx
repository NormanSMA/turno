"use client";

/**
 * El comprobante que "se imprime" al confirmar.
 *
 * Se ganó su lugar contra la regla del ADR-11 —«el movimiento informa o no
 * existe»— por tres razones, no por quedar lindo:
 *
 *   1. **Cubre una latencia real.** La admisión toma un lock sobre la franja y
 *      escribe la reserva. En hora pico esa espera se siente, y el papel
 *      saliendo es una barra de progreso honesta en vez de un giro sin destino.
 *   2. **Marca un umbral irreversible.** Antes estabas eligiendo; ahora la
 *      cocina te reservó minutos que ya no tiene para nadie más. Un cambio de
 *      pantalla no comunica eso. Un comprobante que se imprime, sí.
 *   3. **Revela la estructura en el orden correcto.** El papel sale de arriba
 *      hacia abajo: primero el comercio y la hora, después los ítems, al final
 *      el código. Es el mismo orden en que el estudiante necesita leerlo.
 *
 * Y con dos condiciones que no se negocian: con `prefers-reduced-motion` el
 * comprobante aparece completo al instante, y el CÓDIGO es legible y
 * seleccionable desde el primer cuadro — nadie espera dos segundos para ver el
 * dato que vino a buscar.
 *
 * Todo es CSS: máscara cónica para el borde dentado y `steps()` para el avance
 * mecánico. Cero kilobytes de librería de animación (ADR-19).
 */

import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/iconos";
import { cordobas, horaCorta } from "@/lib/cliente";
import { prefiereMenosMovimiento } from "@/lib/movimiento";

export interface LineaComprobante {
  nombre: string;
  cantidad: number;
  subtotal: string;
  minutos: number;
}

export function ComprobanteImpreso({
  codigo,
  comercio,
  ubicacion,
  franjaInicio,
  franjaFin,
  total,
  cargaMin,
  lineas,
}: {
  codigo: string;
  comercio: string;
  ubicacion?: string | null;
  franjaInicio: string;
  franjaFin: string;
  total: string;
  cargaMin: number;
  lineas: LineaComprobante[];
}) {
  const quieto = prefiereMenosMovimiento();
  const [imprimiendo, setImprimiendo] = useState(!quieto);
  const led = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (quieto) return;
    const t = window.setTimeout(() => setImprimiendo(false), 1900);
    return () => window.clearTimeout(t);
  }, [quieto]);

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* --------------------------------------------------------- Máquina */}
      <div className="relative z-30 rounded-t-lg rounded-b-sm bg-gradient-to-b from-[#23282e] to-[#171b20] px-4 pb-2 pt-3 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-caption font-extrabold tracking-[0.22em] text-[#7d858e]">
            TURNO
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-exito shadow-[0_0_6px_var(--color-exito)]" />
            <span
              ref={led}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                imprimiendo
                  ? "bg-atencion shadow-[0_0_6px_var(--color-atencion)]"
                  : "bg-[#3b4149]"
              }`}
            />
          </span>
        </div>
        {/* La ranura por donde sale el papel. */}
        <div className="h-2 rounded-sm bg-[#05070a] shadow-[inset_0_2px_4px_rgba(0,0,0,.95)]" />
      </div>

      {/* ---------------------------------------------------------- Papel */}
      <div className="relative -mt-1 overflow-hidden">
        <div
          className={`recibo mx-auto ${imprimiendo ? "recibo-saliendo" : ""}`}
        >
          <div className="border-b border-dashed border-current pb-2 text-center">
            <span className="block text-h3 font-extrabold tracking-[0.3em]">
              TURNO
            </span>
            <span className="text-[0.6rem] tracking-[0.12em] opacity-60">
              COMPROBANTE DE ADMISIÓN
            </span>
          </div>

          <div className="mt-2 space-y-0.5">
            <Fila etiqueta="Retirás" valor={`${horaCorta(franjaInicio)} — ${horaCorta(franjaFin)}`} />
            <Fila etiqueta="Dónde" valor={comercio} />
            {ubicacion && <Fila etiqueta="" valor={ubicacion} tenue />}
          </div>

          <div className="mt-3 border-b border-current pb-0.5 text-[0.6rem] font-bold tracking-[0.13em]">
            TU PEDIDO
          </div>
          <div className="mt-1 space-y-0.5">
            {lineas.map((l, i) => (
              <div key={i}>
                <Fila
                  etiqueta={`${l.cantidad}× ${l.nombre}`}
                  valor={cordobas(l.subtotal)}
                />
                <Fila etiqueta="  carga estimada" valor={`${l.minutos} min`} tenue />
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-between border-t border-dashed border-current pt-1 font-bold">
            <span>TOTAL</span>
            <span>{cordobas(total)}</span>
          </div>
          <Fila etiqueta="Se paga al retirar" valor={`${cargaMin} min cocina`} tenue />

          {/* El código: lo más grande del papel, y presente desde el primer
              cuadro aunque la animación siga corriendo. */}
          <div className="mt-3 border-t border-dashed border-current pt-2 text-center">
            <span className="block text-[0.58rem] tracking-[0.1em] opacity-60">
              CÓDIGO DE RETIRO
            </span>
            <strong className="mt-0.5 block text-[1.7rem] font-extrabold leading-tight tracking-[0.16em]">
              {codigo}
            </strong>
          </div>

          <div className="barras mt-2" aria-hidden />

          <p className="mt-1.5 text-center text-[0.56rem] tracking-[0.09em] opacity-50">
            MOSTRÁ ESTE CÓDIGO EN EL MOSTRADOR
          </p>
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-caption text-texto-2">
        <Icono nombre="palomita" size={14} />
        Tu turno quedó reservado.
      </p>
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  tenue,
}: {
  etiqueta: string;
  valor: string;
  tenue?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 ${tenue ? "text-[0.6rem] opacity-55" : ""}`}
    >
      <span className="whitespace-pre">{etiqueta}</span>
      <span className="whitespace-nowrap tabular-nums">{valor}</span>
    </div>
  );
}
