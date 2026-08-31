/**
 * Carteles con QR — el instrumento de captación de §14.4.
 *
 * El QR no es solo un enlace: es un **embudo medible**.
 *
 *     escaneos → registros → primer pedido → pedido recurrente
 *
 * Cada cartel lleva su propio parámetro `canal`, y ese parámetro viaja hasta
 * `usuario.canalCaptacion` y `pedido.canalCaptacion`. Sin eso, el panel puede
 * decir cuánta gente se registró pero no de dónde vino, y la pregunta "¿qué
 * canal capta mejor?" —que es un resultado del estudio, no un detalle de
 * marketing— queda sin responder.
 *
 * La corrección de errores va en nivel medio (M): recupera hasta el 15% del
 * código. Un cartel pegado en un pasillo se raya, se moja y se despega de una
 * esquina; con nivel bajo, un QR dañado deja de escanear y el canal deja de
 * medir.
 */

import QRCode from "qrcode";

export interface Canal {
  id: string;
  nombre: string;
  donde: string;
}

/**
 * Los canales del piloto. Son pocos y fijos a propósito: el análisis compara
 * entre ellos, y una lista abierta produciría categorías de una sola
 * observación que no se pueden comparar con nada.
 */
export const CANALES: Canal[] = [
  {
    id: "qr_mostrador",
    nombre: "Mostrador",
    donde: "Junto a la caja, donde se hace la fila.",
  },
  {
    id: "qr_pasillo",
    nombre: "Pasillo",
    donde: "En el camino hacia el comercio, antes de llegar.",
  },
  {
    id: "qr_aula",
    nombre: "Aula",
    donde: "Volante o proyección en clase, antes del receso.",
  },
  {
    id: "qr_mesa",
    nombre: "Mesas",
    donde: "En las mesas del área de comida.",
  },
];

export function enlaceDeCanal(
  baseUrl: string,
  slug: string,
  canal: string,
): string {
  return `${baseUrl}/c/${slug}?canal=${encodeURIComponent(canal)}`;
}

/** QR como SVG, listo para imprimir a cualquier tamaño sin pixelarse. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    // Nivel M: un cartel de pasillo se raya y se moja. Con nivel bajo, un QR
    // dañado deja de escanear y el canal deja de medir.
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
}
