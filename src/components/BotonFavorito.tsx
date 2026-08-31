"use client";

/**
 * Favorito (§19). Responde antes que el servidor —es reversible y sin
 * consecuencias— y si falla, vuelve solo. A un invitado no se le esconde: el
 * corazón lo lleva a entrar, con la intención guardada.
 *
 * Nunca es la acción principal de una tarjeta: pedir lo es.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "@/components/iconos";
import { api } from "@/lib/cliente";

export function BotonFavorito({
  productoId,
  marcado,
  onCambio,
  autenticado,
}: {
  productoId: string;
  marcado: boolean;
  onCambio: (nuevo: boolean) => void;
  autenticado: boolean;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  const alternar = useCallback(async () => {
    if (!autenticado) {
      // La intención se conserva: después de entrar vuelve acá.
      router.push(`/entrar?volver=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (enviando) return;

    const nuevo = !marcado;
    onCambio(nuevo); // optimista
    setEnviando(true);
    try {
      await api("/api/favoritos", {
        method: nuevo ? "POST" : "DELETE",
        body: JSON.stringify({ productoId }),
      });
    } catch {
      // Vuelve solo. El corazón sin marcar ya dice lo que pasó; un cartel de
      // error por un favorito es desproporcionado.
      onCambio(!nuevo);
    } finally {
      setEnviando(false);
    }
  }, [autenticado, enviando, marcado, onCambio, productoId, router]);

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={marcado}
      aria-label={marcado ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={`toque flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
        marcado
          ? "border-marca-texto/40 bg-marca-suave text-marca-texto"
          : "border-borde bg-superficie text-texto-3"
      }`}
    >
      <Icono nombre="corazon" size={20} relleno={marcado} />
    </button>
  );
}
