import { ImageResponse } from "next/og";
import { marcaComoDataUri } from "./icono-marca";

/**
 * Icono para iOS.
 *
 * Sin esquinas redondeadas propias —el sistema aplica las suyas— pero CON
 * fondo: iOS no admite transparencia en el icono de la pantalla de inicio y la
 * rellena de negro, lo que dejaría el tenedor invisible.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function IconoApple() {
  return new ImageResponse(
    (
      /* eslint-disable-next-line @next/next/no-img-element --
         Esto lo rasteriza Satori en el servidor para producir un PNG, no lo
         pinta un navegador: `next/image` no existe en ese contexto y no hay
         LCP que optimizar. */
      <img
        src={marcaComoDataUri("#171717", 0)}
        width={180}
        height={180}
        alt=""
      />
    ),
    size,
  );
}
