"use client";

/**
 * Conversión de fotos a WebP, EN EL NAVEGADOR.
 *
 * Por qué acá y no en el servidor:
 *
 *   1. **Se sube 40 KB en vez de 4 MB.** El comercio saca la foto con el
 *      teléfono; esa foto pesa varios megas. Convertir antes de enviarla
 *      significa que el operador de una cocina con WiFi de campus no espera
 *      medio minuto por cada plato.
 *   2. **Sin dependencia nativa.** Procesar imágenes en el servidor exige un
 *      binario (`sharp` y compañía) que hay que compilar por plataforma. En
 *      serverless eso es peso de arranque en frío para todas las peticiones,
 *      incluidas las que no tocan una imagen (ADR-18).
 *   3. **El trabajo lo hace el aparato que ya lo tiene.** Cualquier teléfono
 *      de los últimos años decodifica y recomprime una foto sin despeinarse.
 *
 * El servidor NO confía en esto: valida tipo, tamaño y firma antes de guardar.
 * Convertir en el cliente es una optimización, no un control de seguridad.
 */

/** Lado mayor de la imagen guardada. Con 4:3 quedan 1200×900. */
const LADO_MAX = 1200;

/**
 * Calidad de WebP.
 *
 * 0.82 es donde una foto de comida deja de mejorar a la vista y sigue
 * engordando el archivo. Por encima se pagan kilobytes que nadie percibe en una
 * tarjeta de 200 px.
 */
const CALIDAD = 0.82;

export interface FotoLista {
  blob: Blob;
  ancho: number;
  alto: number;
  /** Para la vista previa. Hay que revocarla al desmontar. */
  vistaPrevia: string;
}

export class ErrorImagen extends Error {}

/**
 * Lee un archivo, lo reduce y lo devuelve en WebP.
 *
 * Respeta la proporción y NO agranda: una foto de 400 px se guarda a 400 px, no
 * estirada a 1200 con la nitidez inventada.
 */
export async function prepararFoto(archivo: File): Promise<FotoLista> {
  if (!archivo.type.startsWith("image/")) {
    throw new ErrorImagen("Eso no parece una imagen.");
  }
  // Tope generoso: es lo que sale de la cámara de un teléfono. El límite real
  // lo pone el tamaño DESPUÉS de convertir, que es lo que se envía.
  if (archivo.size > 25 * 1024 * 1024) {
    throw new ErrorImagen("La imagen pesa más de 25 MB. Probá con otra.");
  }

  const bitmap = await leerBitmap(archivo);

  try {
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new ErrorImagen("Este navegador no puede procesar la imagen.");
    // Sin esto, reducir una foto grande produce bordes dentados.
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolver) =>
      lienzo.toBlob(resolver, "image/webp", CALIDAD),
    );
    // Safari viejo puede no soportar WebP en `toBlob` y devolver PNG o null.
    // El servidor solo acepta WebP, así que es mejor decirlo acá y claro.
    if (!blob || blob.type !== "image/webp") {
      throw new ErrorImagen(
        "Este navegador no puede convertir a WebP. Probá con Chrome, Firefox o un Safari reciente.",
      );
    }

    return { blob, ancho, alto, vistaPrevia: URL.createObjectURL(blob) };
  } finally {
    bitmap.close();
  }
}

/**
 * Decodifica el archivo.
 *
 * `createImageBitmap` va primero: decodifica fuera del hilo principal, así que
 * una foto de 12 megapíxeles no congela la interfaz mientras se procesa. El
 * camino con `<img>` queda como respaldo para navegadores que no lo tienen.
 */
async function leerBitmap(archivo: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo);
    } catch {
      // Formato que el decodificador rápido no maneja (algunos HEIC). Cae al
      // camino de abajo, que usa el decodificador del propio navegador.
    }
  }

  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } catch {
    throw new ErrorImagen("No pudimos leer esa imagen. Probá con un JPG o PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
