/**
 * El isotipo de TURNO como SVG plano, para los iconos generados.
 *
 * Es el MISMO dibujo que `src/components/marca.tsx`, con dos diferencias
 * obligadas por el contexto:
 *
 *   1. **Colores literales, no tokens.** El icono se rasteriza en el servidor
 *      con `next/og`; ahí no hay hoja de estilos ni variables CSS. Y un icono
 *      de aplicación no cambia con el tema del sistema: es el mismo en la
 *      pantalla de inicio de todo el mundo.
 *   2. **Fondo propio.** En la interfaz la marca va sobre el fondo de la
 *      página; acá tiene que traer el suyo, porque un PNG con transparencia
 *      sobre el fondo negro de un launcher desaparece.
 *
 * Vive en su propio archivo para que `icon.tsx` y `apple-icon.tsx` no tengan
 * dos copias del trazo que puedan divergir.
 */

const ROJO = "#c91525";
const ROJO_FUERTE = "#a81020";
const AMBAR_A = "#f2b84b";
const AMBAR_B = "#e49b19";
const CREMA = "#fdf4ee";

/**
 * @param fondo  color de la placa. `null` deja el icono transparente.
 * @param radio  radio de la placa. iOS aplica el suyo, así que ahí va 0.
 */
export function svgMarca(fondo: string | null, radio: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<defs>
<linearGradient id="r" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${ROJO}"/><stop offset="100%" stop-color="${ROJO_FUERTE}"/>
</linearGradient>
<linearGradient id="a" x1="0" y1="0" x2="1" y2="0">
<stop offset="0%" stop-color="${AMBAR_A}"/><stop offset="100%" stop-color="${AMBAR_B}"/>
</linearGradient>
</defs>
${fondo ? `<rect width="64" height="64" rx="${radio}" fill="${fondo}"/>` : ""}
<g fill="url(#a)">
<rect x="1" y="25" width="22" height="6" rx="3"/>
<rect x="6" y="34" width="17" height="6" rx="3"/>
<rect x="12" y="43" width="7" height="6" rx="3"/>
</g>
<path fill="url(#r)" d="M18 8h34c4.4 0 8 2.7 8 6.6 0 3.9-3.6 6.4-8 6.4h-2.6l-9.6 30.2C38.6 55.3 35.4 58 31.4 58c-4.8 0-8-3.4-6.6-8l10.6-33H18c-3.4 0-6-2-6-4.9C12 9.9 14.6 8 18 8Z"/>
<path fill="none" stroke="${ROJO_FUERTE}" stroke-width="3.4" stroke-linecap="round" d="M44 30v-4.5a4.5 4.5 0 0 1 9 0V30"/>
<path fill="url(#r)" d="M41 30h15a2 2 0 0 1 2 2.2l-2 20A3 3 0 0 1 53 55H44a3 3 0 0 1-3-2.8l-2-20A2 2 0 0 1 41 30Z"/>
<g stroke="${CREMA}" stroke-width="2.1" stroke-linecap="round" fill="none">
<path d="M45 35v5M48.5 35v5M52 35v5"/><path d="M48.5 40v10" stroke-width="2.6"/>
</g>
</svg>`;
}

/** El SVG como `data:` URI, que es lo que `next/og` sabe pintar en un `<img>`. */
export function marcaComoDataUri(fondo: string | null, radio: number): string {
  return `data:image/svg+xml;base64,${Buffer.from(svgMarca(fondo, radio)).toString("base64")}`;
}
