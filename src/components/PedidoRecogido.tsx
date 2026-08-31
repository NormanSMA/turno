"use client";

/**
 * Pedido recogido (§16). Antes seguía mostrando el código enorme y el botón del
 * mostrador: un código gigante sobre algo terminado hace dudar de si se cerró.
 *
 * Un cierre confirma que terminó, devuelve el resultado —los minutos que ese
 * pedido ahorró, cobrados donde ocurrieron— y ofrece la próxima acción, que
 * casi siempre es repetir.
 */

import Link from "next/link";
import { Icono } from "@/components/iconos";
import { cordobas } from "@/lib/cliente";
import { equivalenciaDeTiempo, tiempoRecuperado } from "@/lib/tiempo";

export function PedidoRecogido({
  pedidoId,
  comercio,
  slug,
  total,
  minutosAhorrados,
  retiradoEn,
  items,
}: {
  pedidoId: string;
  comercio: string;
  slug: string;
  total: string;
  /** Los minutos de cocina que este pedido no le costó al estudiante. */
  minutosAhorrados: number;
  retiradoEn: string | null;
  items: { nombre: string; cantidad: number }[];
}) {
  const equivalencia = equivalenciaDeTiempo(minutosAhorrados);

  const hora = retiradoEn
    ? new Date(retiradoEn).toLocaleTimeString("es-NI", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Por id, no por lista: `?repetir=` rearma contra el menú de HOY y nombra lo
  // que ya no está.
  const repetir = `/c/${slug}?repetir=${pedidoId}`;

  return (
    <div className="space-y-4">
      <section className="entra rounded-lg border border-exito/40 bg-exito-suave px-5 py-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-exito text-white">
          <Icono nombre="palomita" size={26} />
        </span>

        <h2 className="titulo mt-3 text-h2">Pedido entregado</h2>
        <p className="mt-1 text-cuerpo text-texto-2">
          {comercio}
          {hora && <> · {hora}</>}
        </p>
      </section>

      {/* Cifra conservadora a propósito: solo los minutos de cocina ya
          comprometidos. Inflarla sería mentir sobre el tiempo de otro. */}
      {minutosAhorrados > 0 && (
        <section className="entra entra-2 rounded-lg border border-borde bg-superficie px-5 py-5 text-center">
          <p className="etiqueta">Tiempo recuperado</p>
          <p className="hora mt-1 text-[2.25rem] font-extrabold leading-none text-marca-texto">
            {tiempoRecuperado(minutosAhorrados)}
          </p>
          <p className="mt-2 text-chico text-texto-2">
            Es lo que esta comida habría tardado en salir si la hubieras pedido
            en el mostrador.
          </p>
          {equivalencia && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-borde px-3 py-1 text-caption font-semibold">
              <Icono nombre="reloj" size={14} />
              {equivalencia}
            </p>
          )}
        </section>
      )}

      <section className="entra entra-3 rounded-lg border border-borde bg-superficie p-4">
        <ul className="space-y-1.5 text-chico">
          {items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3">
              <span>
                <span className="hora font-semibold">{i.cantidad}×</span>{" "}
                {i.nombre}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-borde pt-2 text-chico">
          <span className="text-texto-2">Pagado al retirar</span>
          <span className="hora font-bold">{cordobas(total)}</span>
        </p>
      </section>

      {/* La acción, antes de cualquier pregunta. */}
      <div className="entra entra-3 grid gap-2 sm:grid-cols-2">
        <Link
          href={repetir}
          className="presiona flex min-h-12 items-center justify-center gap-2 rounded-md bg-marca-fondo px-4 text-cuerpo font-semibold text-white"
        >
          <Icono nombre="repetir" size={18} />
          Pedir lo mismo
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
