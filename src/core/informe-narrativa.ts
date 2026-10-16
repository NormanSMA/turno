import type { Cifras, Ocupacion, PuntoHora } from "./informe";

export interface Narrativa {
  titular: string;
  frases: string[];
  tono: "bien" | "atencion" | "sin-datos";
}

/** Umbral de cumplimiento bajo el cual el informe pide atención. */
const CUMPLIMIENTO_MINIMO = 0.9;

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/**
 * Cuenta el período en frases cortas, antes de las cifras.
 * `periodoEtiqueta` abre la primera frase ("Hoy", "En 7 días").
 * Sin pedidos ni minutos no hay historia: no se inventa un pico.
 */
export function narrarInforme(args: {
  cifras: Cifras;
  ventasPorHora: PuntoHora[];
  ocupacion: Ocupacion;
  periodoEtiqueta: string;
}): Narrativa {
  const { cifras, ventasPorHora, ocupacion, periodoEtiqueta } = args;

  if (cifras.vendidos === 0 && cifras.minutosCocinados === 0) {
    return {
      titular: "Sin datos todavía",
      frases: ["Todavía no hay pedidos en este período."],
      tono: "sin-datos",
    };
  }

  const frases: string[] = [];
  const minutos = Math.round(cifras.minutosCocinados);
  frases.push(
    `${periodoEtiqueta} cocinaste ${minutos} ${plural(minutos, "minuto", "minutos")}.`,
  );

  const hora =
    ocupacion.pico?.hora ??
    (ventasPorHora.length > 0
      ? ventasPorHora.reduce((a, b) => (b.pedidos > a.pedidos ? b : a)).hora
      : null);
  if (hora) frases.push(`El pico fue a las ${hora}.`);

  const n = cifras.noShows;
  if (n > 0) {
    frases.push(
      `${n} ${plural(n, "pedido no se retiró", "pedidos no se retiraron")}.`,
    );
  }

  const bajo =
    cifras.cumplimiento !== null && cifras.cumplimiento < CUMPLIMIENTO_MINIMO;
  if (bajo) {
    frases.push(
      `Entregaste a tiempo el ${Math.round((cifras.cumplimiento as number) * 100)}% de los pedidos.`,
    );
  }

  return {
    titular: bajo ? "Hay algo para revisar" : "Te fue bien",
    frases,
    tono: bajo ? "atencion" : "bien",
  };
}
