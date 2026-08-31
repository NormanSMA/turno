"use client";

/**
 * Control de avisos del pedido (ADR-14).
 *
 * Un solo componente para los seis estados posibles, porque el que importa no
 * es "activar/desactivar" sino `requiere-instalar`: en iOS los avisos solo
 * llegan si el sitio está en la pantalla de inicio, y Safari no ofrece ningún
 * botón para llegar ahí. Hay que explicar el gesto o el estudiante nunca va a
 * recibir un aviso y no va a saber por qué.
 *
 * Se muestra solo mientras el pedido está en curso. Ofrecer avisos de algo ya
 * retirado es ruido, y pedir un permiso sin motivo visible es la forma más
 * rápida de conseguir un "no" permanente.
 */

import { useSuscripcionPush } from "@/lib/push-cliente";

export function AvisosPush({ enCurso }: { enCurso: boolean }) {
  const { estado, activar, desactivar, trabajando } = useSuscripcionPush();

  if (!enCurso) return null;
  // `cargando` no dibuja nada a propósito: un control que aparece y cambia de
  // forma medio segundo después se siente roto.
  if (estado === "cargando" || estado === "sin-configurar") return null;

  if (estado === "requiere-instalar") {
    return (
      <div className="mt-4 rounded-md border border-borde bg-papel-alto px-4 py-3 text-sm">
        <p className="font-semibold">Para que te avisemos, agregá TURNO a tu inicio</p>
        <p className="mt-1 text-tinta-suave">
          En iPhone y iPad los avisos solo llegan desde la pantalla de inicio.
          Tocá <span className="font-semibold">Compartir</span> y después{" "}
          <span className="font-semibold">Agregar a inicio</span>. Abrís TURNO
          igual que una aplicación y te avisamos aunque lo tengas cerrado.
        </p>
        <p className="mt-2 text-xs text-tinta-suave">
          Mientras tanto te escribimos por correo.
        </p>
      </div>
    );
  }

  if (estado === "sin-soporte") {
    return (
      <p className="mt-4 text-center text-xs text-tinta-suave">
        Este navegador no puede mostrar avisos. Te escribimos por correo en
        cuanto tu pedido esté listo.
      </p>
    );
  }

  if (estado === "denegada") {
    return (
      <p className="mt-4 text-center text-xs text-tinta-suave">
        Bloqueaste los avisos para este sitio. Podés reactivarlos desde los
        permisos del navegador; mientras tanto te escribimos por correo.
      </p>
    );
  }

  if (estado === "activa") {
    return (
      <p className="mt-4 text-center text-xs text-tinta-suave">
        Te avisamos en cuanto lo marquen listo, aunque cierres TURNO. Podés
        guardar el teléfono.{" "}
        <button
          type="button"
          onClick={desactivar}
          disabled={trabajando}
          className="underline underline-offset-2 disabled:opacity-40"
        >
          No avisarme
        </button>
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={activar}
      disabled={trabajando}
      className="presiona mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-marca-texto px-4 py-2.5 text-sm font-semibold text-marca-texto disabled:opacity-40"
    >
      {trabajando ? "Activando…" : "Avisame cuando esté listo"}
    </button>
  );
}
