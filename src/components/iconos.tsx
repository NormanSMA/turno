/**
 * Familia única de iconos (Design System §13).
 *
 * UNA sola familia en todo el producto. Mezclar Font Awesome + Material +
 * Lucide + SVG sueltos rompe la identidad más rápido que cualquier error de
 * color, porque el ojo detecta la inconsistencia de trazo antes que la de tono.
 *
 * Todos comparten la misma construcción, que es la que ya usaba `IconoEstado`:
 * lienzo 24×24, sin relleno, trazo 1.75, extremos y uniones redondeados. Eso
 * permite que cualquiera de estos trazos se pase a `MorphIcon` para animarse
 * entre formas cuando un icono cambia de significado en su sitio.
 *
 * Tamaños (§13):
 *   16  información secundaria
 *   20  interfaz
 *   24  acciones principales
 *   28  iconos destacados
 *
 * NUNCA se usan emojis en su lugar. Un emoji cambia de dibujo según el sistema
 * operativo, no hereda el color del texto y no se puede alinear con el resto.
 */

export type NombreIcono =
  | "inicio"
  | "explorar"
  | "pedidos"
  | "perfil"
  | "campana"
  | "reloj"
  | "fuego"
  | "listo"
  | "palomita"
  | "grafico"
  | "ajustes"
  | "entrar"
  | "salir"
  | "carrito"
  | "mas"
  | "menos"
  | "atras"
  | "cerrar"
  | "local"
  | "buscar"
  | "repetir"
  | "correo"
  | "luna"
  | "corazon";

/**
 * Los trazos, sueltos, para poder pasarlos a `MorphIcon` sin arrastrar el
 * componente. Cada uno es el atributo `d` de uno o más `<path>`.
 */
export const TRAZOS: Record<NombreIcono, string[]> = {
  inicio: ["M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"],
  explorar: ["M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"],
  pedidos: [
    "M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Z",
    "M9 8h6M9 12h6",
  ],
  perfil: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0"],
  campana: [
    "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
  ],
  reloj: ["M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  fuego: [
    "M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 .5 2 1.5 2.5C11 8 12 6 12 3Z",
  ],
  listo: [
    "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
  ],
  palomita: ["M20 6 9 17l-5-5"],
  grafico: ["M4 20V10M10 20V4M16 20v-7M22 20H2"],
  ajustes: ["M4 7h10M18 7h2M4 17h2M10 17h10M15 4v6M7 14v6"],
  entrar: ["M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"],
  salir: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"],
  carrito: [
    "M3 4h2l2.4 11.2A2 2 0 0 0 9.4 17h7.5a2 2 0 0 0 2-1.6L20.5 8H6",
    "M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  ],
  mas: ["M12 5v14M5 12h14"],
  menos: ["M5 12h14"],
  atras: ["M19 12H5M12 19l-7-7 7-7"],
  cerrar: ["M18 6 6 18M6 6l12 12"],
  local: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  buscar: ["M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"],
  repetir: ["M3 12a9 9 0 0 1 15.3-6.4L21 8M21 3v5h-5", "M21 12a9 9 0 0 1-15.3 6.4L3 16M3 21v-5h5"],
  correo: ["M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z", "m3 7 9 6 9-6"],
  luna: ["M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"],
  corazon: [
    "M12 20.3s-7.5-4.6-7.5-9.6a4.3 4.3 0 0 1 7.5-2.9 4.3 4.3 0 0 1 7.5 2.9c0 5-7.5 9.6-7.5 9.6Z",
  ],
};

/**
 * El icono. `size` en píxeles del sistema (16/20/24/28) y color heredado de
 * `currentColor`, para que un icono dentro de un botón rojo salga blanco sin
 * que nadie tenga que pasarle el color.
 */
export function Icono({
  nombre,
  size = 20,
  className = "",
  strokeWidth = 1.75,
  relleno = false,
}: {
  nombre: NombreIcono;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /**
   * Pinta el interior con el color actual.
   *
   * Existe para el corazón de favoritos: marcado y sin marcar tienen que ser el
   * MISMO dibujo, lleno o vacío. Dos siluetas distintas para los dos estados de
   * una misma cosa se leen como dos cosas.
   */
  relleno?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={relleno ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {TRAZOS[nombre].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
