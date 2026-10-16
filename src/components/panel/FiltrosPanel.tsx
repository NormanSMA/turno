"use client";

/**
 * Filtro global del panel: período y comercio.
 * Es controlado: el estado vive en la URL y lo maneja la página.
 */

import { DIAS_VALIDOS, type FiltrosPanel as Filtros } from "@/core/panel-filtros";

export interface OpcionComercio {
  slug: string;
  nombre: string;
}

export function FiltrosPanel({
  filtros,
  comercios,
  onCambio,
}: {
  filtros: Filtros;
  comercios: OpcionComercio[];
  onCambio: (f: Filtros) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Período"
        className="flex gap-1 rounded-full border border-borde bg-superficie p-1"
      >
        {DIAS_VALIDOS.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={filtros.dias === d}
            onClick={() => onCambio({ ...filtros, dias: d })}
            className={`rounded-full px-3 py-2 text-chico font-semibold transition-colors ${
              filtros.dias === d
                ? "bg-marca-fondo text-white"
                : "text-texto-2 hover:text-texto"
            }`}
          >
            {d} días
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-chico text-texto-2">
        Comercio
        <select
          value={filtros.comercio ?? ""}
          onChange={(e) =>
            onCambio({ ...filtros, comercio: e.target.value || null })
          }
          className="min-h-11 rounded-full border border-borde bg-superficie px-3 text-chico font-semibold text-texto"
        >
          <option value="">Todos</option>
          {comercios.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
