/**
 * Penalización por no-shows: con `maximo` o más dentro de la ventana, el
 * usuario no puede pedir hasta que el más antiguo de ellos salga de la ventana.
 * Función pura: recibe las fechas y la hora, no toca la base.
 */

export const MAX_NO_SHOWS = 3;
export const VENTANA_NO_SHOW_DIAS = 30;

const MS_DIA = 86_400_000;

export type ResultadoPenalizacion =
  | { bloqueado: false }
  | { bloqueado: true; puedePedirEn: Date; noShowsRecientes: number };

export function evaluarPenalizacion(
  fechasNoShow: Date[],
  ahora: Date,
  opciones: { maximo?: number; ventanaDias?: number } = {},
): ResultadoPenalizacion {
  const maximo = opciones.maximo ?? MAX_NO_SHOWS;
  const ventanaMs = (opciones.ventanaDias ?? VENTANA_NO_SHOW_DIAS) * MS_DIA;

  // Una fecha cuenta mientras `fecha + ventana` sea posterior a ahora.
  const recientes = fechasNoShow
    .filter((f) => f.getTime() + ventanaMs > ahora.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  if (recientes.length < maximo) return { bloqueado: false };

  // Se desbloquea cuando el conteo baja a `maximo - 1`.
  const clave = recientes[recientes.length - maximo]!;
  return {
    bloqueado: true,
    puedePedirEn: new Date(clave.getTime() + ventanaMs),
    noShowsRecientes: recientes.length,
  };
}
