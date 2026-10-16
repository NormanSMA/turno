"use client";

/**
 * Detalle de producto, como hoja inferior (Drawer de shadcn sobre Vaul).
 *
 * La tarjeta abre el producto ahí mismo, con lo que hace falta para decidir
 * —foto, qué es, cuánto cuesta, cuánto tarda, dónde se retira— y una sola
 * acción que lleva al menú con el producto ya en el carrito.
 *
 * ESTRUCTURA — tres franjas fijas: foto, cuerpo que scrollea, acción anclada
 * abajo. En un teléfono la acción no puede quedar fuera de la pantalla.
 *
 * Vaul da arrastre, Escape, foco atrapado y devolución del foco. La foto entra
 * con un resorte propio y no con `layoutId` desde la tarjeta: Motion carga
 * `domAnimation` (ADR-23), que no incluye las funciones de layout, y el drawer
 * vive en un portal con su propia animación. Con `layoutId` sin layout activo
 * no hay viaje, solo ruido. La altura de la foto se reserva con aspect-ratio.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "motion/react";
import { ImagenProducto } from "@/components/ImagenProducto";
import { Icono } from "@/components/iconos";
import { cordobas } from "@/lib/cliente";
import { BotonFavorito } from "@/components/BotonFavorito";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

export interface ProductoDetalle {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precio: string;
  minutos: number;
  anticipable: boolean;
  disponible: boolean;
  comercio: string;
  comercioSlug: string;
  comercioUbicacion: string | null;
  comercioAbierto: boolean;
}

export function HojaProducto({
  producto,
  onCerrar,
  favorito,
  onFavorito,
  autenticado,
}: {
  producto: ProductoDetalle | null;
  onCerrar: () => void;
  /** `undefined` en pantallas que no manejan favoritos: el corazón no aparece. */
  favorito?: boolean;
  onFavorito?: (productoId: string, nuevo: boolean) => void;
  autenticado?: boolean;
}) {
  const router = useRouter();
  const pedirRef = useRef<HTMLButtonElement>(null);
  const [cantidad, setCantidad] = useState(1);

  /*
   * La cantidad vuelve a 1 con cada producto. Se ajusta DURANTE el render
   * comparando contra el id anterior (patrón de React para estado derivado).
   * `mostrado` conserva el último producto para que la salida del drawer no
   * quede vacía mientras anima.
   */
  const [ultimoId, setUltimoId] = useState(producto?.id);
  const [mostrado, setMostrado] = useState(producto);
  if (producto?.id !== ultimoId) {
    setUltimoId(producto?.id);
    setCantidad(1);
  }
  if (producto && producto !== mostrado) setMostrado(producto);

  const alCambiar = useCallback(
    (abierto: boolean) => {
      if (!abierto) onCerrar();
    },
    [onCerrar],
  );

  const actual = producto ?? mostrado;
  if (!actual) return null;

  const cerrado = !actual.comercioAbierto;
  const agotado = !actual.disponible;
  const bloqueado = cerrado || agotado;

  function pedir() {
    if (!actual) return;
    // El producto viaja en la URL y el menú lo siembra en el carrito.
    router.push(
      `/c/${actual.comercioSlug}?agregar=${actual.id}&cant=${cantidad}`,
    );
  }

  return (
    <Drawer open={producto !== null} onOpenChange={alCambiar}>
      <DrawerContent
        onOpenAutoFocus={(e) => {
          const b = pedirRef.current;
          if (b && !b.disabled) {
            e.preventDefault();
            b.focus();
          }
        }}
        className="mx-auto w-full max-w-lg border-borde bg-superficie text-texto data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
      >
      {/* ------------------------------------------------------------ Foto */}
      <div className="relative shrink-0 overflow-hidden bg-superficie-2">
        {/* Acotada por ALTURA además de por proporción: en un teléfono angosto
            un 4:3 se comía media pantalla, y la foto no es la decisión — el
            precio y el botón sí. */}
        <div className="relative aspect-[16/10] max-h-[32dvh] w-full">
          <m.div
            key={actual.id}
            className="absolute inset-0"
            initial={{ scale: 1.08, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <ImagenProducto
              nombre={actual.nombre}
              url={actual.imagenUrl}
              sizes="(min-width: 640px) 32rem, 100vw"
            />
          </m.div>
        </div>

        <DrawerClose
          aria-label="Cerrar"
          /*
           * Oscuro y no claro: sobre una foto de comida —casi siempre clara y
           * con mucho detalle— un círculo blanco se pierde.
           *
           * **Sin `.toque`, y con 44 px de verdad.** `.toque` da el área táctil
           * con un `::after`, pero para colocarlo se pone `position: relative`
           * sobre el elemento — y eso pisa el `absolute`. El botón dejaba de
           * estar anclado, caía al flujo del documento y aparecía a la
           * izquierda, medio cortado por el borde de la hoja. Cuando el área
           * táctil hace falta sobre algo posicionado, se consigue con el tamaño
           * real del botón, no con la clase.
           */
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
        >
          <Icono nombre="cerrar" size={18} />
        </DrawerClose>

        {bloqueado && (
          <span className="absolute inset-0 flex items-center justify-center bg-texto/60">
            <span className="rounded-full bg-superficie px-4 py-2 text-chico font-bold uppercase tracking-wide">
              {agotado ? "Agotado" : "Comercio cerrado"}
            </span>
          </span>
        )}
      </div>

      {/* --------------------------------------------------------- Cuerpo */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-4">
        <div className="flex items-start gap-3">
          <DrawerTitle className="titulo min-w-0 flex-1 text-h2 text-texto">
            {actual.nombre}
          </DrawerTitle>

          {/* El corazón vive acá y no en la tarjeta del catálogo por dos
              razones: la tarjeta ya es un botón entero y anidar botones es HTML
              inválido, y este es el momento en que alguien de verdad decide que
              algo le gusta — después de abrirlo y leerlo. */}
          {onFavorito && (
            <BotonFavorito
              productoId={actual.id}
              marcado={favorito ?? false}
              onCambio={(nuevo) => onFavorito(actual.id, nuevo)}
              autenticado={autenticado ?? false}
            />
          )}
        </div>

        <DrawerDescription className="mt-1 text-cuerpo text-texto-2">
          {actual.descripcion ??
            `${actual.comercio}. ${actual.minutos} min de cocina.`}
        </DrawerDescription>

        {/* Una sola fila para las tres señales: cuánto cuesta, cuánto tarda y
            si hay. Antes ocupaban tres bloques y empujaban todo hacia abajo. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="hora text-h2 font-bold">
            {cordobas(actual.precio)}
          </span>
          <span className="flex items-center gap-1.5 text-chico text-texto-2">
            <Icono nombre="reloj" size={15} />
            {actual.minutos} min de cocina
          </span>
          {!bloqueado && (
            <span className="flex items-center gap-1.5 text-chico font-semibold text-exito">
              <Icono nombre="palomita" size={15} />
              Disponible
            </span>
          )}
        </div>

        {/* Dónde se retira. Sin esto, el estudiante elige un plato sin saber si
            le queda de camino en su receso. */}
        <p className="mt-3 flex items-center gap-2 text-chico">
          <span className="shrink-0 text-texto-2">
            <Icono nombre="local" size={16} />
          </span>
          <span className="min-w-0">
            <span className="font-semibold">{actual.comercio}</span>
            {actual.comercioUbicacion && (
              <span className="text-texto-2">
                {" · "}
                {actual.comercioUbicacion}
              </span>
            )}
          </span>
        </p>

        {!actual.anticipable && (
          <p className="mt-4 rounded-md bg-atencion-suave px-3.5 py-3 text-chico">
            Este producto no admite pedido anticipado: se prepara en menos
            tiempo del que toma reservarlo. Pedilo directo en el mostrador.
          </p>
        )}
      </div>

      {/* --------------------------------------------------------- Acción
          Anclada al pie y siempre a la vista: la decisión de pedir no puede
          depender de que alguien descubra que hay más abajo. */}
      <div className="shrink-0 border-t border-borde bg-superficie px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-3">
          {actual.anticipable && !bloqueado && (
            <div className="flex shrink-0 items-center rounded-full border border-borde">
              <button
                type="button"
                aria-label="Quitar uno"
                disabled={cantidad <= 1}
                onClick={() => setCantidad((n) => Math.max(1, n - 1))}
                className="toque flex h-11 w-11 items-center justify-center rounded-full text-texto disabled:opacity-30"
              >
                <Icono nombre="menos" size={18} />
              </button>
              <span
                className="hora w-6 text-center text-cuerpo font-bold"
                aria-live="polite"
                aria-label={`Cantidad: ${cantidad}`}
              >
                {cantidad}
              </span>
              <button
                type="button"
                aria-label="Agregar uno"
                onClick={() => setCantidad((n) => Math.min(20, n + 1))}
                className="toque flex h-11 w-11 items-center justify-center rounded-full text-texto"
              >
                <Icono nombre="mas" size={18} />
              </button>
            </div>
          )}

          {/* El total va DENTRO del botón: es lo que se está por comprometer, y
              tenerlo aparte obliga a mirar a dos lados antes de tocar. */}
          <button
            ref={pedirRef}
            type="button"
            onClick={pedir}
            disabled={bloqueado || !actual.anticipable}
            className="presiona flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md bg-marca-fondo px-4 text-cuerpo font-semibold text-white disabled:opacity-40"
          >
            {bloqueado ? (
              agotado ? (
                "Agotado por hoy"
              ) : (
                "El comercio está cerrado"
              )
            ) : !actual.anticipable ? (
              "Solo en el mostrador"
            ) : (
              <>
                <span>Pedir</span>
                <span className="hora font-bold">
                  {cordobas(String(Number(actual.precio) * cantidad))}
                </span>
              </>
            )}
          </button>
        </div>

        {!bloqueado && actual.anticipable && (
          <p className="mt-2 text-center text-caption text-texto-2">
            Elegís la hora de retiro en el siguiente paso.
          </p>
        )}
      </div>
    </DrawerContent>
    </Drawer>
  );
}
