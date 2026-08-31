/**
 * Piezas de estado compartidas: carga, vacío y error.
 *
 * Antes cada pantalla resolvía esto con un `<p>Cargando…</p>`, que es la
 * diferencia entre una app que se siente terminada y una que se siente a medio
 * hacer. Tres reglas:
 *
 *   - La CARGA imita la forma de lo que va a llegar (esqueleto), para que el
 *     contenido no salte cuando aparece.
 *   - El VACÍO nunca es un mensaje solo: es una invitación a hacer algo.
 *   - El ERROR dice qué pasó y ofrece la salida, sin disculparse ni culpar.
 */

import Link from "next/link";
import { MedidorFranja } from "./marca";

export function Esqueleto({ className = "" }: { className?: string }) {
  return <span className={`destello block rounded-sm ${className}`} aria-hidden />;
}

/** Esqueleto de una tarjeta de pedido. */
export function EsqueletoPedido() {
  return (
    <li className="tarjeta space-y-3 p-4">
      <div className="flex justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Esqueleto className="h-5 w-28 !rounded-full" />
          <Esqueleto className="h-7 w-32" />
        </div>
        <Esqueleto className="h-9 w-24" />
      </div>
      <Esqueleto className="h-3 w-full" />
      <Esqueleto className="h-3 w-2/3" />
    </li>
  );
}

/**
 * Estado vacío.
 *
 * La ilustración es el medidor de franja en cero: no hay nada acá todavía. Es
 * el mismo símbolo que el resto del sistema usa para "capacidad", así que una
 * pantalla vacía y una franja libre se leen igual — que es lo que son.
 */
export function Vacio({
  titulo,
  texto,
  accion,
}: {
  titulo: string;
  texto: string;
  accion?: { href: string; texto: string };
}) {
  return (
    <div className="tarjeta flex flex-col items-center px-6 py-10 text-center">
      <span className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-md text-tinta-tenue">
        <MedidorFranja ocupacion={0} size={54} grosor={6} />
      </span>
      <p className="font-semibold">{titulo}</p>
      <p className="mt-1 max-w-xs text-sm text-tinta-suave">{texto}</p>
      {accion && (
        <Link
          href={accion.href}
          className="presiona brillo mt-5 rounded-full bg-marca-fondo px-5 py-2.5 text-sm font-semibold text-white"
        >
          {accion.texto}
        </Link>
      )}
    </div>
  );
}

/** Error recuperable, con la salida a mano. */
export function ErrorVista({
  titulo = "Algo se cortó",
  texto,
  onReintentar,
}: {
  titulo?: string;
  texto: string;
  onReintentar?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-alerta bg-alerta-claro px-4 py-3"
    >
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="mt-0.5 text-sm text-tinta-suave">{texto}</p>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="presiona mt-2 text-sm font-semibold text-marca-texto underline underline-offset-2"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Etiqueta de estado del pedido, con el color del sistema. */
export function EtiquetaEstado({ estado }: { estado: string }) {
  const mapa: Record<string, { texto: string; clase: string }> = {
    RECIBIDO: { texto: "Recibido", clase: "bg-turno-claro text-turno-profundo" },
    EN_PREPARACION: {
      texto: "En preparación",
      clase: "bg-[color-mix(in_srgb,var(--color-maiz)_28%,white)] text-tinta",
    },
    LISTO: { texto: "Listo para retirar", clase: "bg-verde text-white" },
    RETIRADO: { texto: "Retirado", clase: "bg-papel-medio text-tinta-suave" },
    NO_SHOW: { texto: "No retirado", clase: "bg-brasa-claro text-tinta" },
    CANCELADO: { texto: "Cancelado", clase: "bg-papel-medio text-tinta-suave" },
  };
  const e = mapa[estado] ?? { texto: estado, clase: "bg-papel-medio" };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${e.clase}`}
    >
      {e.texto}
    </span>
  );
}
