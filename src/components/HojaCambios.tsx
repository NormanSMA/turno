"use client";

/**
 * "Tu pedido cambió" — resumen de lo que se movió mientras armabas.
 *
 * Entre que el estudiante arma el pedido y lo confirma pasan minutos, y en esos
 * minutos el comercio puede agotar algo, cambiar un precio o archivar un plato.
 * Antes eso terminaba de dos formas, las dos malas: el producto desaparecía del
 * carrito sin decir nada, o el rechazo llegaba al confirmar con un mensaje que
 * no decía cuál de los cinco productos era el problema.
 *
 * La regla del sistema no cambia —el servidor gana siempre— pero el usuario
 * tiene derecho a enterarse y a decidir con eso a la vista. Nunca una sorpresa
 * silenciosa, y menos una que se descubre en el mostrador.
 *
 * Se ordena por gravedad: primero lo que salió del carrito, después lo que solo
 * cambió de precio. Si lo primero que se lee es "subió C$5", el producto que
 * desapareció pasa desapercibido.
 */

import { useCallback, useEffect, useRef } from "react";
import { Icono, type NombreIcono } from "@/components/iconos";
import { cordobas } from "@/lib/cliente";
import type { Cambio } from "@/core/revalidar";

const FORMA: Record<
  Cambio["tipo"],
  { titulo: string; detalle: string; icono: NombreIcono; color: string }
> = {
  AGOTADO: {
    titulo: "Se agotó",
    detalle: "El comercio lo apagó mientras armabas el pedido.",
    icono: "cerrar",
    color: "text-error",
  },
  RETIRADO: {
    titulo: "Ya no está en el menú",
    detalle: "El comercio lo quitó del catálogo.",
    icono: "cerrar",
    color: "text-error",
  },
  NO_ANTICIPABLE: {
    titulo: "Ya no se puede reservar",
    detalle: "Sigue habiendo, pero ahora solo se pide en el mostrador.",
    icono: "reloj",
    color: "text-aviso",
  },
  PRECIO: {
    titulo: "Cambió de precio",
    detalle: "",
    icono: "repetir",
    color: "text-aviso",
  },
};

export function HojaCambios({
  cambios,
  onContinuar,
  onCerrar,
}: {
  /** Vacío = cerrada. */
  cambios: Cambio[];
  onContinuar: () => void;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const abierta = cambios.length > 0;

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  const alCerrar = useCallback(() => onCerrar(), [onCerrar]);

  if (!abierta) {
    return <dialog ref={dialogo} className="hidden" onClose={alCerrar} />;
  }

  // Primero lo que salió del carrito: es la noticia, el precio es el detalle.
  const ordenados = [...cambios].sort(
    (a, b) => Number(b.bloqueante) - Number(a.bloqueante),
  );
  const fuera = cambios.filter((c) => c.bloqueante).length;
  const quedaAlgo = cambios.some((c) => !c.bloqueante) || fuera < cambios.length;

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      aria-labelledby="cambios-titulo"
      className="hoja m-0 mt-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-borde bg-superficie p-0 text-texto backdrop:bg-texto/60 sm:mx-auto sm:mb-auto sm:max-h-[88dvh] sm:rounded-xl"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <span
          aria-hidden
          className="mx-auto mb-4 block h-1 w-10 rounded-full bg-borde sm:hidden"
        />

        <h2 id="cambios-titulo" className="titulo text-h2">
          Tu pedido cambió
        </h2>
        <p className="mt-1 text-cuerpo text-texto-2">
          {fuera > 0
            ? "El comercio movió algo mientras armabas. Te lo mostramos antes de confirmar."
            : "Hubo un cambio de precio desde que lo agregaste."}
        </p>

        <ul className="mt-5 space-y-2">
          {ordenados.map((c) => {
            const f = FORMA[c.tipo];
            return (
              <li
                key={`${c.productoId}-${c.tipo}`}
                className={`flex items-start gap-3 rounded-md border px-4 py-3 ${
                  c.bloqueante
                    ? "border-error/30 bg-error-suave"
                    : "border-borde bg-superficie"
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${f.color}`}>
                  <Icono nombre={f.icono} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-cuerpo font-semibold">
                    {c.nombre}
                  </span>
                  <span className="block text-chico text-texto-2">
                    {f.titulo}
                    {c.tipo === "PRECIO" &&
                      c.precioAntes &&
                      c.precioAhora && (
                        <>
                          {": "}
                          <span className="hora line-through">
                            {cordobas(c.precioAntes)}
                          </span>{" "}
                          <span className="hora font-bold text-texto">
                            {cordobas(c.precioAhora)}
                          </span>
                        </>
                      )}
                  </span>
                  {f.detalle && (
                    <span className="mt-0.5 block text-caption text-texto-2">
                      {f.detalle}
                    </span>
                  )}
                </span>
                {c.bloqueante && (
                  <span className="shrink-0 rounded-full bg-superficie px-2.5 py-1 text-caption font-semibold text-error">
                    Quitado
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {fuera > 0 && (
          <p className="mt-4 text-chico text-texto-2">
            {fuera === 1 ? "Ese producto salió" : `Esos ${fuera} productos salieron`}{" "}
            del carrito para que puedas seguir. El resto quedó como estaba.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-borde bg-superficie px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onContinuar}
          className="presiona flex min-h-12 w-full items-center justify-center rounded-md bg-marca-fondo px-4 text-cuerpo font-semibold text-white"
        >
          {quedaAlgo ? "Revisar mi pedido" : "Entendido"}
        </button>
      </div>
    </dialog>
  );
}
