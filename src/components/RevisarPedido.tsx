"use client";

/**
 * Revisión antes de confirmar.
 *
 * Confirmar un pedido en TURNO no es agregar algo a un carrito: **compromete
 * minutos de cocina de una hora concreta** y le hace una promesa al usuario. Un
 * pedido creado por accidente ocupa capacidad que otro estudiante no va a poder
 * usar, y si nadie lo retira se convierte en un no-show que ensucia el
 * indicador 4.
 *
 * Por eso hay un paso explícito de revisión, y por eso repite las dos cosas que
 * el usuario no puede deshacer solo: QUÉ pidió y PARA CUÁNDO. La alternativa
 * —confirmar de un toque— es más rápida para el usuario y peor para el dato.
 *
 * Está construido sobre `<dialog>` nativo y no sobre un div con `role="dialog"`.
 * La diferencia no es cosmética: el elemento nativo **atrapa el foco** dentro
 * del diálogo, cierra con Escape y vuelve el foco al botón que lo abrió, todo
 * sin código. La versión a mano dejaba tabular hacia los controles de atrás,
 * que para alguien navegando con teclado o lector de pantalla significa poder
 * tocar el carrito mientras cree que está confirmando.
 */

import { useCallback, useEffect, useRef } from "react";
import { cordobas, horaCorta } from "@/lib/cliente";

export interface LineaRevision {
  nombre: string;
  cantidad: number;
  subtotal: string;
}

export function RevisarPedido({
  comercio,
  lineas,
  total,
  cargaMin,
  franjaInicio,
  franjaFin,
  enviando,
  onConfirmar,
  onVolver,
}: {
  comercio: string;
  lineas: LineaRevision[];
  total: string;
  cargaMin: number;
  franjaInicio: string;
  franjaFin: string;
  enviando: boolean;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  // El callback se guarda en una ref para que el efecto de apertura no dependa
  // de su identidad. `onVolver` llega como una función anónima nueva en cada
  // render del padre; si el efecto dependiera de ella, cerraría y reabriría el
  // diálogo constantemente — y reabrirlo reinicia el foco y la animación.
  const alVolver = useRef(onVolver);
  useEffect(() => {
    alVolver.current = onVolver;
  }, [onVolver]);

  useEffect(() => {
    const el = dialogo.current;
    if (!el || el.open) return;
    el.showModal();
    return () => el.close();
  }, []);

  // Escape y clic en el fondo cierran, salvo mientras se está confirmando:
  // cerrar a mitad del envío dejaría al usuario sin saber si su pedido entró.
  const cerrar = useCallback(
    (e: Event) => {
      e.preventDefault();
      if (!enviando) alVolver.current();
    },
    [enviando],
  );

  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    el.addEventListener("cancel", cerrar);
    return () => el.removeEventListener("cancel", cerrar);
  }, [cerrar]);

  return (
    <dialog
      ref={dialogo}
      aria-labelledby="revisar-titulo"
      onClick={(e) => {
        // El backdrop es parte del propio <dialog>: un clic sobre él tiene al
        // diálogo como target, mientras que un clic dentro lo tiene en un hijo.
        if (e.target === dialogo.current && !enviando) onVolver();
      }}
      className="m-0 max-h-dvh w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-tinta/45 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-md sm:p-5"
    >
      <div className="entra max-h-[92dvh] w-full overflow-y-auto rounded-t-lg bg-papel-alto p-5 sm:rounded-lg">
        <p className="etiqueta">Revisá antes de confirmar</p>
        <h2 id="revisar-titulo" className="titulo mt-1 text-2xl">
          ¿Eso es todo?
        </h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Al confirmar, {comercio} aparta estos minutos de cocina para vos.
        </p>

        <ul className="mt-5 space-y-1.5 border-y border-borde py-4 text-sm">
          {lineas.map((l) => (
            <li key={l.nombre} className="flex justify-between gap-3">
              <span>
                <span className="hora font-bold">{l.cantidad}×</span> {l.nombre}
              </span>
              <span className="hora shrink-0 text-tinta-suave">
                {cordobas(l.subtotal)}
              </span>
            </li>
          ))}
          <li className="flex justify-between gap-3 pt-2 font-semibold">
            <span>Total</span>
            <span className="hora">{cordobas(total)}</span>
          </li>
        </ul>

        <div className="mt-4 rounded-md bg-turno-claro p-4">
          <p className="etiqueta">Tu hora de retiro</p>
          <p className="hora mt-0.5 text-3xl font-bold">
            {horaCorta(franjaInicio)}–{horaCorta(franjaFin)}
          </p>
          <p className="mt-1 text-xs text-tinta-suave">
            Ocupa {cargaMin} minutos de cocina. Se paga al retirar.
          </p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onVolver}
            disabled={enviando}
            className="presiona flex-1 rounded-full border border-borde px-6 py-3 font-medium disabled:opacity-40"
          >
            Agregar algo más
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={enviando}
            className="presiona brillo flex-1 rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            {enviando ? "Confirmando…" : "Sí, confirmar"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
