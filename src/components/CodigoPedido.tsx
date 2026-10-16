/**
 * Código de retiro, mostrado de forma DISTINGUIBLE.
 *
 * Dos códigos como `XLZ-Y4B` y `YLZ-Y4B` se leen casi igual a un metro de
 * distancia y en una cocina con prisa. La entrega equivocada es un fallo real de
 * operación, y encima contamina el dato: el pedido queda marcado retirado por
 * alguien que no lo retiró.
 *
 * Se atacan tres canales a la vez, porque ninguno alcanza solo:
 *
 *   1. COLOR derivado del código completo. Dos códigos distintos casi siempre
 *      caen en colores distintos, y el color se percibe antes que el texto.
 *   2. SEPARACIÓN tipográfica del prefijo, que es la parte que cambia.
 *   3. El color nunca es la única señal — el texto sigue ahí completo, para
 *      quien no distinga colores.
 */

/*
 * Seis tonos de la familia Gourmet Minimal (ADR-22: pizarra, dorado, ciruela,
 * terracota, oliva y arena oscura) con el mismo contraste entre sí, y ninguno es
 * el rojo ni el ámbar de urgencia:
 * el código identifica un pedido, no señala una acción. Si el código usara el
 * color de marca competiría con los botones primarios de la misma pantalla.
 *
 * Son literales y no tokens a propósito: este componente se imprime, se
 * fotografía y se mira en la cocina bajo luz distinta. Un color que cambia con
 * el tema haría que el mismo pedido se viera de dos colores en dos pantallas,
 * y el color ES parte del identificador.
 */
const TONOS = [
  { fondo: "#e1e8ec", texto: "#26414f", borde: "#4d7388" },
  { fondo: "#f4ead9", texto: "#6b4a14", borde: "#b68d59" },
  { fondo: "#ece1e6", texto: "#5a2e48", borde: "#8c5470" },
  { fondo: "#f6e4da", texto: "#7a3a1c", borde: "#b8623a" },
  { fondo: "#e3e8df", texto: "#2c4234", borde: "#5f7d63" },
  { fondo: "#ebe4d6", texto: "#4a4030", borde: "#8a7a5a" },
] as const;

function huella(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 33 + texto.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tonoDeCodigo(codigo: string) {
  return TONOS[huella(codigo) % TONOS.length];
}

const TAMANOS = {
  md: "px-2 py-0.5 text-xl",
  lg: "px-2.5 py-1 text-3xl",
  xl: "px-3.5 py-1.5 text-[2.5rem] leading-none",
  // Ocupa lo que la pantalla dé: es lo único que se mira en ese momento.
  mostrador: "px-4 py-2 text-[clamp(2.75rem,16vw,5.5rem)] leading-none",
} as const;

export function CodigoPedido({
  codigo,
  tamano = "md",
}: {
  codigo: string;
  /**
   * `md` en listados, `lg` para la cocina (se lee a un metro), `xl` cuando ES
   * el contenido de la pantalla, y `mostrador` para el instante de la entrega.
   */
  tamano?: "md" | "lg" | "xl" | "mostrador";
}) {
  const tono = tonoDeCodigo(codigo);
  const [prefijo, sufijo] = codigo.split("-");

  return (
    <span
      className={`hora inline-flex items-center gap-1.5 rounded-sm font-bold ${
        TAMANOS[tamano]
      }`}
      style={{
        background: tono.fondo,
        color: tono.texto,
        boxShadow: `inset 0 0 0 1.5px ${tono.borde}`,
      }}
    >
      {/* El prefijo va más marcado: es la parte que distingue dos códigos que
          comparten el resto. */}
      <span className="tracking-widest">{prefijo}</span>
      <span aria-hidden style={{ opacity: 0.4 }}>
        ·
      </span>
      <span className="tracking-widest" style={{ opacity: 0.75 }}>
        {sufijo}
      </span>
    </span>
  );
}
