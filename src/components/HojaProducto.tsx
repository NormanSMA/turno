"use client";

/**
 * Detalle de producto, como hoja inferior.
 *
 * Existe para arreglar un problema concreto de Explorar: la tarjeta de un
 * producto se lee como "voy a pedir esto", y al tocarla te mandaba al menú del
 * comercio a buscarlo otra vez. Prometía una acción y entregaba una lista.
 *
 * Ahora la tarjeta abre el producto ahí mismo, con lo que hace falta para
 * decidir —foto, qué es, cuánto cuesta, cuánto tarda, dónde se retira— y una
 * sola acción que lleva al menú **con el producto ya en el carrito**. El toque
 * que antes no servía para nada ahora adelanta el pedido.
 *
 * ESTRUCTURA — tres franjas fijas: foto, cuerpo que scrollea, acción anclada
 * abajo. La primera versión era un bloque único con la foto en 4:3, y en un
 * teléfono eso empujaba el botón de pedir fuera de la pantalla: había que hacer
 * scroll para comprar. En una hoja de producto la acción no puede depender de
 * que el usuario descubra que hay más abajo.
 *
 * Es una hoja y no una pantalla nueva por dos razones (Design System §24):
 * conserva el contexto detrás —seguís viendo la lista que estabas mirando— y
 * cerrarla no te saca del lugar en el que estabas.
 *
 * Sobre `<dialog>` nativo y no un div con `role="dialog"`, por lo mismo que
 * `RevisarPedido`: atrapa el foco, cierra con Escape y devuelve el foco al
 * elemento que lo abrió, sin una línea de código.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagenProducto } from "@/components/ImagenProducto";
import { Icono } from "@/components/iconos";
import { cordobas } from "@/lib/cliente";
import { BotonFavorito } from "@/components/BotonFavorito";

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
  const dialogo = useRef<HTMLDialogElement>(null);
  const [cantidad, setCantidad] = useState(1);

  /*
   * La cantidad vuelve a 1 con cada producto: arrastrar el 3 del anterior es la
   * clase de error que solo se descubre al llegar al mostrador.
   *
   * Se ajusta DURANTE el render comparando contra el id anterior, que es el
   * patrón que React documenta para estado derivado de props. Hacerlo en un
   * efecto encadenaría un render de más y, peor, dejaría un cuadro en el que la
   * hoja nueva se ve con la cantidad de la anterior.
   */
  const [ultimoId, setUltimoId] = useState(producto?.id);
  if (producto?.id !== ultimoId) {
    setUltimoId(producto?.id);
    setCantidad(1);
  }

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (producto && !d.open) d.showModal();
    if (!producto && d.open) d.close();
  }, [producto]);

  // Escape y el botón de atrás del navegador disparan `close`; los dos tienen
  // que avisar hacia arriba o el estado quedaría diciendo que sigue abierta.
  const alCerrar = useCallback(() => onCerrar(), [onCerrar]);

  if (!producto) {
    return <dialog ref={dialogo} className="hidden" onClose={alCerrar} />;
  }

  const cerrado = !producto.comercioAbierto;
  const agotado = !producto.disponible;
  const bloqueado = cerrado || agotado;

  function pedir() {
    if (!producto) return;
    // El producto viaja en la URL y el menú lo siembra en el carrito. Así el
    // toque en Explorar adelanta trabajo en vez de generar otro toque.
    router.push(
      `/c/${producto.comercioSlug}?agregar=${producto.id}&cant=${cantidad}`,
    );
  }

  return (
    <dialog
      ref={dialogo}
      onClose={alCerrar}
      aria-labelledby="hoja-producto-titulo"
      /* `dvh` y no `vh`: en móvil la barra del navegador aparece y desaparece,
         y con `vh` el pie de la hoja queda tapado justo cuando sube. */
      className="hoja m-0 mt-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-borde bg-superficie p-0 text-texto backdrop:bg-texto/60 sm:mx-auto sm:mb-auto sm:max-h-[88dvh] sm:rounded-xl"
    >
      {/* ------------------------------------------------------------ Foto */}
      <div className="relative shrink-0 overflow-hidden bg-superficie-2">
        {/* Acotada por ALTURA además de por proporción: en un teléfono angosto
            un 4:3 se comía media pantalla, y la foto no es la decisión — el
            precio y el botón sí. */}
        <div className="relative aspect-[16/10] max-h-[32dvh] w-full">
          <ImagenProducto
            nombre={producto.nombre}
            url={producto.imagenUrl}
            sizes="(min-width: 640px) 32rem, 100vw"
          />
        </div>

        {/* Asa: la señal de que esto es una hoja y se cierra hacia abajo. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/70 sm:hidden"
        />

        <button
          type="button"
          onClick={() => dialogo.current?.close()}
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
        </button>

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
          <h2 id="hoja-producto-titulo" className="titulo min-w-0 flex-1 text-h2">
            {producto.nombre}
          </h2>

          {/* El corazón vive acá y no en la tarjeta del catálogo por dos
              razones: la tarjeta ya es un botón entero y anidar botones es HTML
              inválido, y este es el momento en que alguien de verdad decide que
              algo le gusta — después de abrirlo y leerlo. */}
          {onFavorito && (
            <BotonFavorito
              productoId={producto.id}
              marcado={favorito ?? false}
              onCambio={(nuevo) => onFavorito(producto.id, nuevo)}
              autenticado={autenticado ?? false}
            />
          )}
        </div>

        {producto.descripcion && (
          <p className="mt-1 text-cuerpo text-texto-2">
            {producto.descripcion}
          </p>
        )}

        {/* Una sola fila para las tres señales: cuánto cuesta, cuánto tarda y
            si hay. Antes ocupaban tres bloques y empujaban todo hacia abajo. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="hora text-h2 font-bold">
            {cordobas(producto.precio)}
          </span>
          <span className="flex items-center gap-1.5 text-chico text-texto-2">
            <Icono nombre="reloj" size={15} />
            {producto.minutos} min de cocina
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
            <span className="font-semibold">{producto.comercio}</span>
            {producto.comercioUbicacion && (
              <span className="text-texto-2">
                {" · "}
                {producto.comercioUbicacion}
              </span>
            )}
          </span>
        </p>

        {!producto.anticipable && (
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
          {producto.anticipable && !bloqueado && (
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
            type="button"
            onClick={pedir}
            disabled={bloqueado || !producto.anticipable}
            className="presiona flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md bg-marca-fondo px-4 text-cuerpo font-semibold text-white disabled:opacity-40"
          >
            {bloqueado ? (
              agotado ? (
                "Agotado por hoy"
              ) : (
                "El comercio está cerrado"
              )
            ) : !producto.anticipable ? (
              "Solo en el mostrador"
            ) : (
              <>
                <span>Pedir</span>
                <span className="hora font-bold">
                  {cordobas(String(Number(producto.precio) * cantidad))}
                </span>
              </>
            )}
          </button>
        </div>

        {!bloqueado && producto.anticipable && (
          <p className="mt-2 text-center text-caption text-texto-2">
            Elegís la hora de retiro en el siguiente paso.
          </p>
        )}
      </div>
    </dialog>
  );
}
