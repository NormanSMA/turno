/**
 * Filtros globales del panel: período y comercio.
 *
 * Viven en la URL (`?dias=30&comercio=slug`) para compartir el enlace. Todo
 * valor inválido cae al defecto: una URL editada a mano no rompe el panel.
 */

export const DIAS_VALIDOS = [7, 30, 90] as const;
export type Dias = (typeof DIAS_VALIDOS)[number];

export interface FiltrosPanel {
  dias: Dias;
  /** Slug del comercio, o null para todos. */
  comercio: string | null;
}

export const DIAS_DEFECTO: Dias = 30;
const DIA_MS = 86_400_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Params = { get(nombre: string): string | null };

export function leerFiltros(params: Params): FiltrosPanel {
  const crudo = params.get("dias");
  const n = crudo !== null && /^\d+$/.test(crudo) ? Number(crudo) : NaN;
  const dias = DIAS_VALIDOS.find((d) => d === n) ?? DIAS_DEFECTO;
  const slug = params.get("comercio");
  const comercio = slug !== null && slug.length <= 100 && SLUG.test(slug) ? slug : null;
  return { dias, comercio };
}

/** Rango en ISO UTC: `hasta` es `ahora` y `desde` retrocede `dias` días de 24 h. */
export function aRango(filtros: FiltrosPanel, ahora: Date) {
  return {
    desde: new Date(ahora.getTime() - filtros.dias * DIA_MS).toISOString(),
    hasta: ahora.toISOString(),
  };
}

/** Query string para la URL de la página; omite los valores por defecto. */
export function aQuery(filtros: FiltrosPanel): string {
  const q = new URLSearchParams();
  if (filtros.dias !== DIAS_DEFECTO) q.set("dias", String(filtros.dias));
  if (filtros.comercio) q.set("comercio", filtros.comercio);
  return q.toString();
}
