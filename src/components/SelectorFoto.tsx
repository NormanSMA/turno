"use client";

/**
 * Elegir la foto de un producto.
 *
 * Antes no había forma de subir una: el catálogo solo podía apuntar a URLs
 * externas, así que en la práctica los comercios se quedaban sin fotos y el
 * menú entero se veía con mosaicos de respaldo.
 *
 * La conversión a WebP ocurre en el navegador ANTES de enviar (ver
 * `lib/imagen-cliente.ts`). Eso importa acá por una razón muy concreta: el
 * operador de una cocina saca la foto con el teléfono, y esa foto pesa varios
 * megas. Con el WiFi del campus, subirla cruda serían treinta segundos por
 * plato. Convertida son ~40 KB y se siente instantáneo.
 *
 * La vista previa se muestra apenas se convierte, sin esperar a la subida: el
 * comercio ve enseguida si la foto quedó bien encuadrada, y si no, cambia sin
 * haber gastado la red.
 */

import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/iconos";
import { ImagenProducto } from "@/components/ImagenProducto";
import { ErrorImagen, prepararFoto } from "@/lib/imagen-cliente";

export function SelectorFoto({
  nombre,
  urlActual,
  onElegir,
  onQuitar,
}: {
  /** Nombre del producto: alimenta el mosaico de respaldo. */
  nombre: string;
  urlActual: string | null;
  /** Recibe el WebP ya convertido. Quien llama decide cuándo subirlo. */
  onElegir: (foto: { blob: Blob; ancho: number; alto: number }) => void;
  onQuitar: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [peso, setPeso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Una URL de objeto retiene el blob hasta que se revoca. Sin esto, cambiar
  // de foto cinco veces deja cinco imágenes en memoria.
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa);
    };
  }, [previa]);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setProcesando(true);
    try {
      const foto = await prepararFoto(archivo);
      if (previa) URL.revokeObjectURL(previa);
      setPrevia(foto.vistaPrevia);
      setPeso(foto.blob.size);
      onElegir({ blob: foto.blob, ancho: foto.ancho, alto: foto.alto });
    } catch (e) {
      setError(
        e instanceof ErrorImagen
          ? e.message
          : "No pudimos procesar esa imagen.",
      );
    } finally {
      setProcesando(false);
      // Se limpia el input para que elegir DOS VECES el mismo archivo vuelva a
      // disparar `change`. Sin esto, quien se equivoca y reelige lo mismo cree
      // que la aplicación se colgó.
      if (entrada.current) entrada.current.value = "";
    }
  }

  function quitar() {
    if (previa) URL.revokeObjectURL(previa);
    setPrevia(null);
    setPeso(null);
    setError(null);
    onQuitar();
  }

  const hayFoto = Boolean(previa ?? urlActual);

  return (
    <div>
      <p className="mb-1.5 text-chico font-medium">Foto (opcional)</p>

      <div className="flex items-start gap-3">
        {/* Vista previa cuadrada: es como se ve en la tarjeta del menú. */}
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-borde bg-superficie-2">
          {previa ? (
            // Es un blob local recién creado, no una imagen remota: `next/image`
            // no puede optimizar lo que todavía no existe en ningún servidor.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previa}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImagenProducto nombre={nombre || "Producto"} url={urlActual} sizes="96px" />
          )}

          {procesando && (
            <span className="absolute inset-0 flex items-center justify-center bg-superficie/80 text-caption font-semibold">
              Procesando…
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => elegir(e.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={procesando}
            className="presiona flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-borde px-4 text-chico font-semibold disabled:opacity-40"
          >
            <Icono nombre="mas" size={16} />
            {hayFoto ? "Cambiar foto" : "Subir foto"}
          </button>

          {hayFoto && (
            <button
              type="button"
              onClick={quitar}
              className="presiona mt-2 min-h-9 w-full rounded-md px-4 text-caption font-semibold text-error"
            >
              Quitar
            </button>
          )}

          <p className="mt-2 text-caption leading-tight text-texto-2">
            {peso !== null
              ? `Se guardará en WebP, ${Math.round(peso / 1024)} KB.`
              : "Se convierte a WebP en tu teléfono antes de subirla, así pesa poco y sube rápido."}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-chico text-error">
          {error}
        </p>
      )}
    </div>
  );
}
