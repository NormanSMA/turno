"use client";

/**
 * El icono del estado de un pedido, que se transforma en el siguiente.
 *
 * Esta es la única parte del sistema que usa `morphicons` (MIT, sin
 * dependencias de ejecución), y la razón es concreta: su aporte no son iconos
 * —los nuestros son trazos propios de 24×24 que ya existían— sino la
 * interpolación entre dos formas por análisis de Procrustes. Eso paga
 * exactamente donde un icono CAMBIA DE SIGNIFICADO EN SU SITIO.
 *
 * En la cocina, el botón de avance es ese sitio. Cuando el operador toca
 * "Empezar", el reloj se convierte en llama mientras la petición viaja. La
 * transformación no adorna: es el acuse de recibo. Antes ahí había puntos
 * suspensivos, que dicen "esperá" pero no dicen hacia qué.
 *
 * En la navegación NO se usa: ahí los iconos son constantes y un `<path>` suelto
 * pesa menos y hace lo mismo.
 *
 * Los trazos son los mismos que el resto del sistema —24×24, sin relleno,
 * extremos redondeados— porque morphicons acepta un atributo `d` crudo como
 * entrada y no impone una familia de iconos.
 */

import { MorphIcon } from "morphicons/react";

export type EstadoPedido =
  | "RECIBIDO"
  | "EN_PREPARACION"
  | "LISTO"
  | "RETIRADO";

/**
 * Un trazo por estado, contando la misma historia que la columna:
 * esperar → cocinar → avisar → entregado.
 */
export const TRAZO_ESTADO: Record<EstadoPedido, string> = {
  RECIBIDO: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  EN_PREPARACION:
    "M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 .5 2 1.5 2.5C11 8 12 6 12 3Z",
  LISTO: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
  RETIRADO: "M20 6 9 17l-5-5",
};

export function IconoEstado({
  estado,
  size = 18,
  className,
  label,
}: {
  estado: EstadoPedido;
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <MorphIcon
      icon={TRAZO_ESTADO[estado]}
      size={size}
      strokeWidth={2}
      spring="snappy"
      /* Con `prefers-reduced-motion` activo la transformación se vuelve un
         cambio instantáneo: el icono nuevo se ve igual, sin el recorrido. */
      reducedMotion="user"
      className={className}
      label={label}
    />
  );
}
