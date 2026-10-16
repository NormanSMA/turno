/**
 * Resumen de la cola de avisos (tabla `notificacion`), por canal.
 *
 * Pura: recibe filas ya leídas y la hora actual. No expone destinatarios ni
 * contenido, solo números y el último mensaje de error.
 */

export type CanalAviso = "CORREO" | "PUSH";

export interface FilaAviso {
  canal: CanalAviso;
  estado: "PENDIENTE" | "ENVIANDO" | "ENVIADA" | "FALLIDA";
  intentos: number;
  ultimoError: string | null;
  reclamadaEn: Date | null;
  creadaEn: Date;
  enviadaEn: Date | null;
}

export interface ResumenCanal {
  pendientes: number;
  enviando: number;
  fallidas: number;
  enviadasUltimas24h: number;
  /** Minutos del pendiente más viejo; null si no hay pendientes. */
  masAntiguaPendienteMin: number | null;
  /** ENVIANDO con el reclamo vencido (el proceso murió a mitad del envío). */
  atascadas: number;
  ultimoError: string | null;
  intentosMax: number;
}

/** Vencimiento del reclamo, igual que en src/lib/correo.ts. */
export const RECLAMO_VENCE_MIN = 10;
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

export function resumirBandeja(
  filas: FilaAviso[],
  ahora: Date,
): Record<CanalAviso, ResumenCanal> {
  const resumir = (canal: CanalAviso): ResumenCanal => {
    const propias = filas.filter((f) => f.canal === canal);
    const pendientes = propias.filter((f) => f.estado === "PENDIENTE");
    const abiertas = propias.filter((f) => f.estado !== "ENVIADA");
    const conError = abiertas
      .filter((f) => f.ultimoError)
      .sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime())[0];

    return {
      pendientes: pendientes.length,
      enviando: propias.filter((f) => f.estado === "ENVIANDO").length,
      fallidas: propias.filter((f) => f.estado === "FALLIDA").length,
      enviadasUltimas24h: propias.filter(
        (f) =>
          f.estado === "ENVIADA" &&
          f.enviadaEn !== null &&
          ahora.getTime() - f.enviadaEn.getTime() <= DIA,
      ).length,
      masAntiguaPendienteMin:
        pendientes.length === 0
          ? null
          : Math.max(
              0,
              Math.floor(
                (ahora.getTime() -
                  Math.min(...pendientes.map((f) => f.creadaEn.getTime()))) /
                  MIN,
              ),
            ),
      atascadas: propias.filter(
        (f) =>
          f.estado === "ENVIANDO" &&
          f.reclamadaEn !== null &&
          ahora.getTime() - f.reclamadaEn.getTime() > RECLAMO_VENCE_MIN * MIN,
      ).length,
      ultimoError: conError?.ultimoError?.slice(0, 160) ?? null,
      intentosMax: abiertas.reduce((m, f) => Math.max(m, f.intentos), 0),
    };
  };

  return { CORREO: resumir("CORREO"), PUSH: resumir("PUSH") };
}
