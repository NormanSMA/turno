"use client";

/**
 * "No puedo prepararlo" (§32): se acabó el pollo DESPUÉS de aceptar el pedido.
 * Sin esta salida quedaban dos opciones malas — cancelar sin decir por qué, o
 * dejarlo ocupando capacidad que ya no se puede honrar.
 *
 * El motivo le da al estudiante una explicación real, deja rastro de operación
 * (tres "agotado" en una semana es inventario, no mala suerte) y libera la
 * franja. La confirmación es explícita: le arruina el almuerzo a alguien.
 */

import { useCallback, useRef, useState } from "react";
import { Icono } from "@/components/iconos";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

const MOTIVOS = [
  {
    id: "AGOTADO",
    texto: "Se agotó un producto",
    nota: "Se agotó un producto del pedido",
  },
  {
    id: "EQUIPO",
    texto: "Se dañó un equipo",
    nota: "Equipo averiado en la cocina",
  },
  {
    id: "ERROR",
    texto: "Error en la preparación",
    nota: "Error en la preparación, no se pudo rehacer a tiempo",
  },
  {
    id: "TIEMPO",
    texto: "No llegamos con el tiempo",
    nota: "La cocina no alcanzó a prepararlo dentro de la ventana",
  },
  { id: "OTRO", texto: "Otro motivo", nota: "Otro motivo operativo" },
] as const;

export function HojaProblemaCocina({
  pedido,
  onCerrar,
  onConfirmar,
}: {
  /** `null` = cerrada. */
  pedido: { id: string; codigo: string } | null;
  onCerrar: () => void;
  onConfirmar: (pedidoId: string, nota: string) => Promise<void>;
}) {
  const primero = useRef<HTMLButtonElement>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const alCerrar = useCallback(() => {
    setMotivo(null);
    onCerrar();
  }, [onCerrar]);

  async function confirmar() {
    if (!pedido || !motivo || enviando) return;
    const elegido = MOTIVOS.find((m) => m.id === motivo);
    setEnviando(true);
    try {
      await onConfirmar(pedido.id, elegido?.nota ?? "Otro motivo operativo");
      alCerrar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Drawer
      open={pedido !== null}
      dismissible={!enviando}
      onOpenChange={(abierto) => {
        if (!abierto && !enviando) alCerrar();
      }}
    >
      <DrawerContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          primero.current?.focus();
        }}
        className="mx-auto w-full max-w-md border-borde bg-papel-alto text-tinta data-[vaul-drawer-direction=bottom]:max-h-[88dvh]"
      >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <DrawerTitle className="titulo text-xl text-tinta">
          No podemos preparar este pedido
        </DrawerTitle>
        <DrawerDescription className="mt-1 text-sm text-tinta-suave">
          {pedido?.codigo} se va a cancelar y su capacidad vuelve a quedar libre.
          Al estudiante le avisamos con el motivo.
        </DrawerDescription>

        <ul className="mt-4 space-y-2">
          {MOTIVOS.map((m, n) => (
            <li key={m.id}>
              <button
                ref={n === 0 ? primero : undefined}
                type="button"
                role="radio"
                disabled={enviando}
                aria-checked={motivo === m.id}
                onClick={() => setMotivo(m.id)}
                className={`presiona flex min-h-12 w-full items-center gap-3 rounded-md border px-4 text-left text-sm font-medium ${
                  motivo === m.id
                    ? "border-marca-texto bg-turno-claro"
                    : "border-borde"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    motivo === m.id ? "border-marca-texto" : "border-borde"
                  }`}
                >
                  {motivo === m.id && (
                    <span className="h-2 w-2 rounded-full bg-marca-fondo" />
                  )}
                </span>
                {m.texto}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="shrink-0 space-y-2 border-t border-borde px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          disabled={!motivo || enviando}
          onClick={confirmar}
          className="presiona flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-alerta px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Icono nombre="cerrar" size={16} />
          {enviando ? "Cancelando…" : "Cancelar el pedido"}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={alCerrar}
          className="presiona flex min-h-12 w-full items-center justify-center rounded-md border border-borde px-4 text-sm font-semibold disabled:opacity-40"
        >
          Volver al tablero
        </button>
      </div>
      </DrawerContent>
    </Drawer>
  );
}
