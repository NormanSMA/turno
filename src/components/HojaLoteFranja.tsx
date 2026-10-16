"use client";

import { horaCorta } from "@/lib/cliente";
import type { FranjaCocina } from "@/lib/consultas-cocina";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * Confirmación del avance en lote. Avanzar una franja entera es difícil de
 * deshacer (pasar a LISTO avisa a cada estudiante), así que dice cuántos
 * pedidos toca antes de hacerlo.
 */
export function HojaLoteFranja({
  lote,
  enviando,
  onCerrar,
  onConfirmar,
}: {
  /** `null` = cerrada. */
  lote: {
    franja: FranjaCocina;
    hacia: "EN_PREPARACION" | "LISTO";
    cantidad: number;
  } | null;
  enviando: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  const listo = lote?.hacia === "LISTO";
  const pedidos = lote?.cantidad === 1 ? "pedido" : "pedidos";
  return (
    <Drawer
      open={lote !== null}
      dismissible={!enviando}
      onOpenChange={(abierto) => {
        if (!abierto && !enviando) onCerrar();
      }}
    >
      <DrawerContent className="mx-auto w-full max-w-md border-borde bg-papel-alto text-tinta">
        <div className="p-4">
          <DrawerTitle className="titulo text-xl text-tinta">
            {listo ? "Marcar la franja como lista" : "Iniciar la franja"}
          </DrawerTitle>
          <DrawerDescription className="mt-1 text-sm text-tinta-suave">
            {lote &&
              (listo
                ? `${lote.cantidad} ${pedidos} de las ${horaCorta(lote.franja.inicio)} pasan a listo y se avisa a cada estudiante.`
                : `${lote.cantidad} ${pedidos} de las ${horaCorta(lote.franja.inicio)} pasan a preparación.`)}
          </DrawerDescription>
        </div>
        <div className="space-y-2 border-t border-borde px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            disabled={enviando}
            onClick={onConfirmar}
            className="presiona flex min-h-12 w-full items-center justify-center rounded-md bg-marca-fondo px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {enviando ? "Guardando…" : listo ? "Marcar listos" : "Empezar todos"}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={onCerrar}
            className="presiona flex min-h-12 w-full items-center justify-center rounded-md border border-borde px-4 text-sm font-semibold disabled:opacity-40"
          >
            Volver al tablero
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
