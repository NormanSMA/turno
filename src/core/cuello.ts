/**
 * El próximo cuello de botella (§28). El tablero decía cuánto trabajo hay, no
 * cuándo va a doler: doce pedidos en dos horas es calma; siete en diez
 * minutos, un incumplimiento en camino.
 *
 * Compara minutos de cocina comprometidos contra minutos de persona
 * disponibles en una ventana corta. Es `carga(f) ≤ α·C(f)` mirado desde el
 * otro lado: no qué se acepta, sino qué tan cerca del límite quedó.
 */

export interface PedidoEnCurso {
  estado: string;
  /** Minutos de cocina que ocupa. */
  cargaMin: number;
  /** Fin de su ventana: es el momento en que hay que haberlo entregado. */
  franjaFin: Date;
}

export type NivelPresion = "HOLGADO" | "AJUSTADO" | "EN_RIESGO";

export interface Cuello {
  nivel: NivelPresion;
  /** Cuántos pedidos vencen dentro de la ventana. */
  pedidos: number;
  /** Minutos de cocina que exigen esos pedidos. */
  cargaMin: number;
  /** Minutos de cocina realmente disponibles en la ventana. */
  disponibleMin: number;
  /** Minutos de la ventana mirada. */
  ventanaMin: number;
}

/**
 * @param ventanaMin cuánto hacia adelante mirar. Diez minutos por defecto: es
 *   el horizonte en que una cocina todavía puede reaccionar —adelantar algo,
 *   pedir una mano—. Una hora hacia adelante es información, no una alerta.
 * @param puestos cuántas preparaciones simultáneas admite la cocina. Con dos
 *   personas, diez minutos de reloj son veinte minutos de cocina.
 */
export function proximoCuello(
  pedidos: readonly PedidoEnCurso[],
  ahora: Date,
  ventanaMin = 10,
  puestos = 1,
): Cuello {
  const limite = new Date(ahora.getTime() + ventanaMin * 60_000);

  // Un pedido LISTO ya no ocupa fuego: contarlo infla la alarma.
  const enJuego = pedidos.filter(
    (p) =>
      ["RECIBIDO", "EN_PREPARACION"].includes(p.estado) &&
      p.franjaFin <= limite,
  );

  const cargaMin = enJuego.reduce((a, p) => a + p.cargaMin, 0);
  const disponibleMin = ventanaMin * Math.max(1, puestos);

  /*
   * Al 100 % ya se incumple, así que la alerta suena al 85 %, con margen para
   * reaccionar. Bajo 60 % no se dice nada: a quien se le avisa siempre, deja
   * de mirar el aviso.
   */
  const uso = disponibleMin > 0 ? cargaMin / disponibleMin : 1;
  const nivel: NivelPresion =
    uso >= 1 ? "EN_RIESGO" : uso >= 0.85 ? "AJUSTADO" : "HOLGADO";

  return {
    nivel,
    pedidos: enJuego.length,
    cargaMin: Math.round(cargaMin),
    disponibleMin,
    ventanaMin,
  };
}
