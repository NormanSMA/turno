import { ImageResponse } from "next/og";
import { marcaComoDataUri } from "./icono-marca";

/**
 * Icono de la aplicación.
 *
 * Se genera desde el mismo trazo que usa la interfaz (`icono-marca.ts`) en vez
 * de guardarse como PNG, para que no existan dos versiones de la marca que
 * puedan divergir. Cambiar el logo en un solo archivo cambia también el icono
 * de la pantalla de inicio.
 */
/**
 * 512 y no 192.
 *
 * La auditoría (punto 22) encontró que el manifiesto declaraba un solo tamaño
 * de 192 px. Android exige **al menos uno de 512** para la pantalla de inicio:
 * sin él la aplicación se instala igual pero el sistema rasteriza el de 192
 * hacia arriba y el icono se ve borroso justo donde más se mira. Un solo
 * tamaño grande cubre los dos usos —el sistema escala hacia abajo sin pérdida—
 * y evita mantener dos trazos que pueden divergir, que es la razón por la que
 * este icono se genera desde `icono-marca.ts` en primer lugar.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icono() {
  return new ImageResponse(
    (
      /* eslint-disable-next-line @next/next/no-img-element --
         Esto lo rasteriza Satori en el servidor para producir un PNG, no lo
         pinta un navegador: `next/image` no existe en ese contexto y no hay
         LCP que optimizar. */
      <img
        src={marcaComoDataUri("#171717", 14)}
        width={512}
        height={512}
        alt=""
      />
    ),
    size,
  );
}
