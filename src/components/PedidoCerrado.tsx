"use client";

/**
 * Pedido cerrado sin entrega. Regla de microcopy §20: **nunca se dice
 * "NO_SHOW"** —es una etiqueta interna y suena a expediente— y **no se
 * regaña**: quien no llegó fue porque una clase se alargó, que es el problema
 * que el producto dice resolver.
 *
 * Y una regla que salió de un error real: **no se le atribuye al estudiante
 * algo que no hizo**. La pantalla daba por hecho que toda cancelación era suya
 * —"lo cancelaste antes de que la cocina empezara"— incluso cuando la había
 * cancelado el comercio. Ahora cada caso tiene su texto, y cuando cancela la
 * cocina se muestra **el motivo que escribió**, que es lo que la hoja de cocina
 * le promete al operador.
 *
 * Siempre termina en una salida hacia adelante, nunca en un callejón.
 */

import Link from "next/link";
import { Icono } from "@/components/iconos";

export function PedidoCerrado({
  estado,
  slug,
  pedidoId,
  franjaFin,
  cancelacion,
}: {
  estado: string;
  slug: string;
  pedidoId: string;
  franjaFin: string;
  /** Quién canceló y por qué. `null` si el pedido no se canceló. */
  cancelacion?: { quien: string; motivo: string | null } | null;
}) {
  const cancelado = estado === "CANCELADO";
  const porComercio = cancelado && cancelacion?.quien === "COMERCIO";
  const porSistema = cancelado && cancelacion?.quien === "SISTEMA";

  const hora = new Date(franjaFin).toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const titulo = !cancelado
    ? "No se pudo entregar"
    : porComercio
      ? "El comercio canceló tu pedido"
      : porSistema
        ? "Tu pedido se venció"
        : "Cancelaste tu pedido";

  const explicacion = !cancelado
    ? /* Reemplaza a "NO_SHOW": el hecho y el motivo, sin adjetivos. */
      `Pasó la hora de retiro (${hora}) y el comercio liberó el pedido. Pasa: una clase se alarga y no se llega.`
    : porComercio
      ? "No pudieron prepararlo. No se te cobra nada y esa hora quedó libre."
      : porSistema
        ? `Pasó su hora de retiro (${hora}) sin llegar a prepararse, así que el sistema lo liberó.`
        : "Lo cancelaste antes de que la cocina empezara, así que no se preparó nada y la capacidad volvió a quedar libre.";

  return (
    <div className="space-y-4">
      <section className="entra rounded-lg border border-borde bg-superficie px-5 py-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-superficie-2 text-texto-2">
          <Icono nombre="cerrar" size={24} />
        </span>

        <h2 className="titulo mt-3 text-h2">{titulo}</h2>
        <p className="mt-2 text-cuerpo text-texto-2">{explicacion}</p>

        {/*
         * El motivo que escribió la cocina.
         *
         * Va aparte y no dentro del párrafo porque responde la única pregunta
         * que importa acá —"¿por qué?"— y porque la hoja de cocina le prometió
         * al operador que iba a llegar. Una promesa que el sistema hace de un
         * lado del mostrador tiene que cumplirse del otro.
         */}
        {porComercio && cancelacion?.motivo && (
          <p className="mt-4 inline-flex items-start gap-2 rounded-md border border-borde bg-superficie-2 px-4 py-3 text-left text-chico">
            <span className="mt-0.5 shrink-0 text-texto-2">
              <Icono nombre="local" size={15} />
            </span>
            <span>
              <span className="block text-caption text-texto-2">
                Motivo del comercio
              </span>
              <span className="block font-medium">{cancelacion.motivo}</span>
            </span>
          </p>
        )}
      </section>

      {/* El consejo solo tiene sentido cuando el estudiante pudo haber hecho
          algo distinto. Si canceló el comercio, no hay nada que aconsejarle. */}
      {!cancelado && (
        <section className="entra entra-2 rounded-md border border-borde bg-superficie px-4 py-3">
          <p className="text-chico font-semibold">
            Para la próxima, si ves que no llegás
          </p>
          <p className="mt-1 text-chico text-texto-2">
            Cancelá desde la aplicación mientras el pedido todavía no entró a
            cocina, o avisá en el mostrador. La cocina puede reacomodar su
            trabajo y esa capacidad la aprovecha alguien más.
          </p>
        </section>
      )}

      <div className="entra entra-3 grid gap-2 sm:grid-cols-2">
        <Link
          href={`/c/${slug}?repetir=${pedidoId}`}
          className="presiona flex min-h-12 items-center justify-center gap-2 rounded-md bg-marca-fondo px-4 text-cuerpo font-semibold text-white"
        >
          <Icono nombre="repetir" size={18} />
          Pedirlo de nuevo
        </Link>
        <Link
          href="/explorar"
          className="presiona flex min-h-12 items-center justify-center rounded-md border border-borde px-4 text-cuerpo font-semibold"
        >
          Ver otros comercios
        </Link>
      </div>
    </div>
  );
}
