"use client";

/**
 * "Tu sesión terminó" (§40). Antes, un 401 al confirmar empujaba al login sin
 * decir nada: se veía como que la aplicación expulsó al estudiante y le borró
 * el pedido.
 *
 * La regla de recuperación: **qué pasó, qué se conservó, qué podés hacer** —en
 * ese orden, antes de mandar a nadie a ningún lado.
 */

import { useState } from "react";
import { Icono } from "@/components/iconos";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

export function HojaSesion({
  abierta,
  volverA,
  unidades,
}: {
  abierta: boolean;
  /** Ruta a la que volver después de entrar. */
  volverA: string;
  /** Cuántas unidades quedaron guardadas, para poder nombrarlas. */
  unidades: number;
}) {
  // Sin `onCerrar` externo: cerrar deja la pantalla como estaba, con el carrito
  // intacto. Se muestra de nuevo si `abierta` cambia.
  const [descartada, setDescartada] = useState(false);
  const [ultima, setUltima] = useState(abierta);
  if (abierta !== ultima) {
    setUltima(abierta);
    setDescartada(false);
  }

  return (
    <Drawer
      open={abierta && !descartada}
      onOpenChange={(a) => {
        if (!a) setDescartada(true);
      }}
    >
      <DrawerContent
        className="mx-auto w-full max-w-md border-borde bg-superficie text-texto data-[vaul-drawer-direction=bottom]:max-h-[88dvh]"
      >
      <div className="p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-superficie-2 text-texto-2">
          <Icono nombre="entrar" size={24} />
        </span>

        <DrawerTitle className="titulo mt-3 text-h2">
          Tu sesión terminó
        </DrawerTitle>

        <DrawerDescription className="mt-2 text-cuerpo text-texto-2">
          Pasó el tiempo de inactividad y tuvimos que cerrarla.
        </DrawerDescription>

        {/* Con el número a la vista: "guardamos tu pedido" es una promesa;
            "tus 3 productos siguen ahí" es verificable. */}
        <p className="mt-4 flex items-center justify-center gap-2 rounded-md border border-exito/40 bg-exito-suave px-4 py-3 text-chico font-semibold">
          <Icono nombre="palomita" size={16} />
          {unidades === 1
            ? "Tu producto sigue en el carrito"
            : `Tus ${unidades} productos siguen en el carrito`}
        </p>

        <a
          href={`/entrar?volver=${encodeURIComponent(volverA)}`}
          className="presiona mt-4 flex min-h-12 w-full items-center justify-center rounded-md bg-marca-fondo px-4 text-cuerpo font-semibold text-white"
        >
          Entrar y seguir
        </a>

        <p className="mt-2 text-caption text-texto-2">
          Volvés a esta misma pantalla, con tu pedido armado.
        </p>
      </div>
      </DrawerContent>
    </Drawer>
  );
}
