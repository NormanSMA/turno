"use client";

/**
 * Detalle por comercio, ordenable por columna.
 * TanStack Table solo entra por la carga diferida (ADR-23, sección 4).
 */

import { useMemo } from "react";
import {
  type ColumnDef,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { PresionComercio } from "@/core/sistema";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});
const col = createColumnHelper<typeof features, PresionComercio>();
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default function TablaComercios({ filas }: { filas: PresionComercio[] }) {
  const columnas = useMemo(
    // Las columnas mezclan tipos de valor; la unión exige `any` aquí.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (): ColumnDef<typeof features, PresionComercio, any>[] => [
      col.accessor("comercio", { header: "Comercio" }),
      col.accessor("franjas", { header: "Franjas" }),
      col.accessor("ocupacionMedia", {
        header: "Ocupación media",
        cell: (c) => pct(c.getValue()),
        sortUndefined: "last",
      }),
      col.accessor("picoOcupacion", {
        header: "Pico",
        cell: (c) => pct(c.getValue()),
      }),
      col.accessor("saturadas", { header: "Saturadas" }),
      col.accessor("vacias", { header: "Vacías" }),
    ],
    [],
  );

  const table = useTable(
    { features, data: filas, columns: columnas },
    (estado) => ({ sorting: estado.sorting }),
  );

  return (
    <div className="tarjeta overflow-x-auto">
      <table className="w-full text-chico">
        <thead className="border-b border-borde text-left">
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => {
                const orden = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={
                      orden === "asc"
                        ? "ascending"
                        : orden === "desc"
                          ? "descending"
                          : "none"
                    }
                    className="p-0 font-medium"
                  >
                    <button
                      type="button"
                      onClick={h.column.getToggleSortingHandler()}
                      className="flex min-h-11 w-full items-center gap-1 px-3 text-left font-medium hover:text-marca-texto"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <span aria-hidden className="text-texto-3">
                        {orden === "asc" ? "↑" : orden === "desc" ? "↓" : ""}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="hora tabular-nums">
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="border-b border-borde last:border-0">
              {r.getAllCells().map((c) => (
                <td key={c.id} className="px-3 py-2">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
