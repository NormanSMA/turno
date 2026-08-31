"use client";

/**
 * Línea de tiempo del pedido.
 *
 * Es el equivalente de TURNO al seguimiento de una app de delivery — pero lo que
 * se sigue acá no es un repartidor moviéndose por un mapa, sino una promesa de
 * hora acercándose. Por eso el elemento dominante no es un vehículo: es la
 * CUENTA REGRESIVA hasta la hora comprometida, y la barra mide cuánto de la
 * ventana prometida ya transcurrió.
 *
 * Los cuatro pasos son los estados operacionales reales de `estados.ts`, no una
 * animación decorativa: cada uno lleva la marca de tiempo que quedó registrada
 * en `evento_pedido`, que es la misma que alimenta el Capítulo V.
 */

import { useEffect, useState } from "react";
import { fechaCorta, horaCorta } from "@/lib/cliente";

export interface EventoUI {
  estado: string;
  timestamp: string;
}

const PASOS = [
  { estado: "RECIBIDO", texto: "Pedido recibido", detalle: "El comercio ya lo tiene" },
  { estado: "EN_PREPARACION", texto: "En preparación", detalle: "Están cocinando" },
  { estado: "LISTO", texto: "Listo para retirar", detalle: "Podés pasar" },
  { estado: "RETIRADO", texto: "Retirado", detalle: "Gracias" },
] as const;

function minutosHasta(iso: string, ahora: Date): number {
  return Math.round((new Date(iso).getTime() - ahora.getTime()) / 60000);
}

/**
 * Cuánto falta, dicho como lo diría una persona. Pasadas las dos horas el número
 * de minutos deja de ayudar y lo que hace falta es el día; pasado el día, la
 * hora sola ya no ubica nada.
 */
function cuantoFalta(iso: string, ahora: Date): string {
  const m = minutosHasta(iso, ahora);
  if (m < 0) return `hace ${Math.abs(m)} min`;
  if (m === 0) return "ahora";
  if (m < 60) return `en ${m} min`;
  if (m < 120) return "en 1 h";
  const mismoDia =
    new Date(iso).toDateString() === ahora.toDateString();
  if (mismoDia) return `en ${Math.round(m / 60)} h`;
  return fechaCorta(iso);
}

export function LineaTiempo({
  estado,
  eventos,
  franjaInicio,
  franjaFin,
  creadoEn,
}: {
  estado: string;
  eventos: EventoUI[];
  franjaInicio: string;
  franjaFin: string;
  creadoEn: string;
}) {
  // Reloj propio: la cuenta regresiva tiene que moverse sin recargar la página.
  //
  // Arranca en null y se fija en el primer tick, no en el cuerpo del efecto.
  // Además de evitar un render en cascada, esto resuelve la discrepancia entre
  // servidor y cliente: el HTML del servidor no puede saber la hora del
  // dispositivo, así que la cuenta regresiva solo existe una vez hidratado.
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setAhora(new Date());
    const inmediato = setTimeout(tick, 0);
    const intervalo = setInterval(tick, 30000);
    return () => {
      clearTimeout(inmediato);
      clearInterval(intervalo);
    };
  }, []);

  const terminal = ["RETIRADO", "NO_SHOW", "CANCELADO"].includes(estado);
  const cancelado = estado === "CANCELADO" || estado === "NO_SHOW";

  const marca = (e: string) => eventos.find((x) => x.estado === e)?.timestamp;
  const indiceActual = PASOS.findIndex((p) => p.estado === estado);
  const alcanzado = (i: number) =>
    indiceActual >= 0 ? i <= indiceActual : terminal;

  // Progreso dentro de la ventana prometida: 0 al crear el pedido, 1 al fin de
  // la franja. Es tiempo real transcurrido, no una barra que avanza sola.
  const t0 = new Date(creadoEn).getTime();
  const t1 = new Date(franjaFin).getTime();
  const progreso = ahora
    ? Math.max(0, Math.min(1, (ahora.getTime() - t0) / (t1 - t0)))
    : 0;

  return (
    <div>
      {/* Cabecera: cuánto falta para la hora comprometida. */}
      {!cancelado && (
        <div className="rounded-xl bg-tinta p-4 text-papel">
          <p className="etiqueta !text-cocina-tinta">
            {estado === "LISTO" ? "Te está esperando" : "Tu pedido estará listo"}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="hora text-4xl font-bold">{horaCorta(franjaFin)}</p>
            {ahora && !terminal && (
              <p className="hora text-sm text-cocina-tinta">
                {cuantoFalta(franjaFin, ahora)}
              </p>
            )}
          </div>

          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-cocina-borde"
            role="progressbar"
            aria-valuenow={Math.round(progreso * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tiempo transcurrido de la ventana prometida"
          >
            <div
              className="h-full rounded-full bg-marca-fondo transition-[width] duration-700"
              style={{ width: `${progreso * 100}%` }}
            />
          </div>
          <div className="hora mt-1.5 flex justify-between text-[0.625rem] text-[#7fa8ab]">
            <span>pediste {horaCorta(creadoEn)}</span>
            <span>
              ventana {horaCorta(franjaInicio)}–{horaCorta(franjaFin)}
            </span>
          </div>
        </div>
      )}

      {cancelado && (
        <div className="rounded-xl border border-brasa bg-brasa-claro p-4">
          <p className="font-semibold">
            {estado === "CANCELADO" ? "Pedido cancelado" : "No retirado"}
          </p>
          <p className="mt-1 text-sm text-tinta-suave">
            {estado === "CANCELADO"
              ? "La hora que tenías reservada volvió a quedar disponible."
              : "El pedido estuvo listo pero nadie pasó a retirarlo."}
          </p>
        </div>
      )}

      {/* Los cuatro pasos, con la marca real de cada evento. */}
      {!cancelado && (
        <ol className="mt-5 space-y-0">
          {PASOS.map((p, i) => {
            const hecho = alcanzado(i);
            const actual = i === indiceActual;
            const cuando = marca(p.estado);
            return (
              <li key={p.estado} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      hecho
                        ? "border-marca-texto bg-marca-fondo"
                        : "border-borde bg-papel-alto"
                    }`}
                  >
                    {hecho && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3 w-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {/* Se dibuja en vez de aparecer: el paso se está
                            confirmando, no estaba confirmado desde siempre. */}
                        <path className="traza-palomita" d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  {i < PASOS.length - 1 && (
                    <span
                      aria-hidden
                      className={`w-0.5 flex-1 ${
                        alcanzado(i + 1) ? "traza bg-marca-fondo" : "bg-borde"
                      }`}
                      /* El retraso escalona el trazado paso por paso, de
                         arriba hacia abajo, que es el orden en que el pedido
                         los recorrió. */
                      style={{ animationDelay: `${0.1 + i * 0.14}s` }}
                    />
                  )}
                </div>

                <div className={`pb-5 ${hecho ? "" : "opacity-50"}`}>
                  <p
                    className={`text-sm leading-5 ${
                      actual ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {p.texto}
                  </p>
                  <p className="text-xs text-tinta-suave">
                    {cuando ? (
                      <span className="hora">{horaCorta(cuando)}</span>
                    ) : (
                      p.detalle
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
