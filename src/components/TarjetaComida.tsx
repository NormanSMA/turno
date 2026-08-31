"use client";

/**
 * Food Card (Design System §18, §19, §44).
 *
 * Vive acá y no dentro de una pantalla porque el §44 lo exige: el mismo
 * componente en Inicio, Explorar, búsqueda y recomendados. Cinco versiones casi
 * iguales es como se pierde la consistencia sin que nadie tome la decisión de
 * perderla.
 *
 * Jerarquía fija: producto → precio → disponibilidad → acción. Solo lo que se
 * lee de un vistazo; la descripción larga vive en el detalle.
 *
 * Es un BOTÓN, no un enlace. La distinción importa: esto abre el producto ahí
 * mismo. Cuando era un enlace al menú del comercio, la tarjeta prometía una
 * acción y entregaba una lista, y el toque no adelantaba nada.
 */

import { ImagenProducto } from "@/components/ImagenProducto";
import { Icono } from "@/components/iconos";
import type { ProductoDetalle } from "@/components/HojaProducto";
import { cordobas } from "@/lib/cliente";

export type ProductoTarjeta = ProductoDetalle;

export function TarjetaComida({
  p,
  onAbrir,
  prioridad,
}: {
  p: ProductoTarjeta;
  onAbrir: () => void;
  /** Para la primera fila visible: evita que la foto entre tarde. */
  prioridad?: boolean;
}) {
  const cerrado = !p.comercioAbierto;
  const agotado = !p.disponible;
  const bloqueado = cerrado || agotado;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="presiona group block h-full w-full overflow-hidden rounded-lg border border-borde bg-superficie text-left transition-colors hover:border-texto-3"
    >
      {/* Proporción 4:3 en TODAS las tarjetas (§43). Mezclar 1:1, 4:3 y 16:9
          sin una razón es lo que hace que una cuadrícula se vea desprolija. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-superficie-2">
        <ImagenProducto
          nombre={p.nombre}
          url={p.imagenUrl}
          prioridad={prioridad}
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 40vw, 60vw"
        />

        {bloqueado && (
          <span className="absolute inset-0 flex items-center justify-center bg-texto/55">
            <span className="rounded-full bg-superficie px-3 py-1.5 text-caption font-bold uppercase tracking-wide">
              {agotado ? "Agotado" : "Cerrado"}
            </span>
          </span>
        )}

        {!bloqueado && p.anticipable && (
          <span className="absolute left-2 top-2 rounded-full bg-superficie/95 px-2.5 py-1 text-caption font-semibold text-exito">
            Pedido anticipado
          </span>
        )}
      </div>

      <div className="p-3.5">
        <p className="truncate text-cuerpo font-semibold">{p.nombre}</p>

        {/* Comercio y DÓNDE queda. Sin la ubicación, el estudiante elige un
            plato sin saber si le queda de camino en su receso. */}
        <p className="mt-0.5 flex items-center gap-1 text-caption text-texto-2">
          <Icono nombre="local" size={13} />
          <span className="truncate">
            {p.comercio}
            {p.comercioUbicacion ? ` · ${p.comercioUbicacion}` : ""}
          </span>
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="hora text-h3 font-bold">{cordobas(p.precio)}</span>
          <span className="flex items-center gap-1 text-caption text-texto-2">
            <Icono nombre="reloj" size={14} />
            {p.minutos} min
          </span>
        </div>
      </div>
    </button>
  );
}
