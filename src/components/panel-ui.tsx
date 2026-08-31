/**
 * Piezas del panel. SVG a mano, sin librería. Nada de esto agrega información:
 * dibuja mejor la que ya había.
 *
 *   - **El umbral se dibuja.** Un 72 % no dice nada sin saber dónde empieza el
 *     problema; la marca convierte el número en un juicio.
 *   - **El color nunca va solo.** Siempre hay número, y palabra si hay riesgo.
 *   - **Curvas, no escalones.** En un panel se busca la tendencia, y una
 *     polilínea dentada la esconde detrás del ruido.
 */

export type Tono = "bueno" | "aviso" | "malo" | "neutro";

const COLOR: Record<Tono, string> = {
  bueno: "var(--color-exito)",
  aviso: "var(--color-aviso)",
  malo: "var(--color-error)",
  neutro: "var(--color-texto-2)",
};

const TEXTO: Record<Tono, string> = {
  bueno: "text-exito",
  aviso: "text-aviso",
  malo: "text-error",
  neutro: "text-texto",
};

/** Clasifica un valor contra dos umbrales. Más alto = peor. */
export function tonoPorUmbral(
  valor: number,
  aviso: number,
  malo: number,
): Tono {
  if (valor >= malo) return "malo";
  if (valor >= aviso) return "aviso";
  return "bueno";
}

/**
 * Barra con marca de umbral. Sin la marca, el relleno solo se compara con otras
 * barras, no con lo aceptable.
 */
export function BarraNivel({
  pct,
  tono,
  umbral,
  alto = 10,
}: {
  /** 0–100. Se recorta a ese rango. */
  pct: number;
  tono: Tono;
  /** 0–100. Dónde empieza a preocupar. `null` = sin marca. */
  umbral?: number | null;
  alto?: number;
}) {
  const valor = Math.max(0, Math.min(100, pct));

  return (
    <div
      className="relative w-full overflow-hidden rounded-full bg-superficie-2"
      style={{ height: alto }}
      role="img"
      aria-label={`${Math.round(valor)} por ciento`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${valor}%`,
          // Degradado del mismo tono: volumen sin inventar un segundo color.
          background: `linear-gradient(90deg, color-mix(in oklab, ${COLOR[tono]} 65%, white), ${COLOR[tono]})`,
        }}
      />
      {umbral != null && umbral > 0 && umbral < 100 && (
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-texto/35"
          style={{ left: `${umbral}%` }}
        />
      )}
    </div>
  );
}

/**
 * Medidor de arco: para una magnitud con techo conocido se lee desde lejos, que
 * es como se mira un panel colgado.
 */
export function Medidor({
  valor,
  max,
  tono,
  umbral,
  etiqueta,
  unidad,
}: {
  valor: number;
  max: number;
  tono: Tono;
  /** Desde qué valor empieza la zona de riesgo. */
  umbral?: number;
  etiqueta: string;
  unidad?: string;
}) {
  const r = 42;
  const cx = 50;
  const cy = 50;
  /*
   * 240° centrado arriba: la abertura evita confundirlo con una torta, que
   * responde otra pregunta. Con 0° arriba, empezar en 240° deja inicio y fin
   * simétricos abajo.
   */
  const inicio = 240;
  const barrido = 240;
  const largo = (barrido / 360) * 2 * Math.PI * r;
  // Piso visible: sin él, 5 ms sobre 600 no pinta nada y el medidor parece
  // roto en vez de sano.
  const crudo = max > 0 ? valor / max : 0;
  const fraccion = crudo <= 0 ? 0 : Math.max(0.015, Math.min(1, crudo));

  const punto = (grados: number) => {
    const rad = ((grados - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  const [x0, y0] = punto(inicio);
  const [x1, y1] = punto(inicio + barrido);
  const riel = `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1}`;

  const inicioRiesgo =
    umbral != null && max > 0 ? Math.min(1, umbral / max) : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 78" className="w-full max-w-[9rem]" aria-hidden>
        <path
          d={riel}
          fill="none"
          stroke="var(--color-superficie-2)"
          strokeWidth={9}
          strokeLinecap="round"
        />
        {/* El umbral es una MARCA, no una zona pintada: con 5 ms sobre 600 el
            tramo rojo ocupaba un tercio y un valor sano se veía alarmante. */}
        {inicioRiesgo != null && inicioRiesgo < 1 && (
          <path
            d={riel}
            fill="none"
            stroke="var(--color-texto-3)"
            strokeWidth={13}
            strokeLinecap="butt"
            strokeDasharray={`1.5 ${largo}`}
            strokeDashoffset={-largo * inicioRiesgo}
          />
        )}
        <path
          d={riel}
          fill="none"
          stroke={COLOR[tono]}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${largo * fraccion} ${largo}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>

      <p className={`hora -mt-7 text-h2 font-bold leading-none ${TEXTO[tono]}`}>
        {valor}
        {unidad && (
          <span className="text-chico font-semibold text-texto-2">
            {" "}
            {unidad}
          </span>
        )}
      </p>
      <p className="mt-2 text-caption text-texto-2">{etiqueta}</p>
    </div>
  );
}

/**
 * Serie corta, suavizada con Catmull-Rom → Bézier. El último punto va marcado:
 * es el que se está mirando.
 */
export function Chispa({
  valores,
  color = "var(--color-marca)",
  alto = 40,
}: {
  valores: number[];
  color?: string;
  alto?: number;
}) {
  if (valores.length < 2) {
    return <div style={{ height: alto }} aria-hidden />;
  }

  const W = 100;
  const H = 32;
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const rango = max - min || 1;

  const pts = valores.map((v, i) => [
    (i / (valores.length - 1)) * W,
    H - ((v - min) / rango) * (H - 4) - 2,
  ]);

  // Conversión estándar: pasa por todos los puntos sin sobrepasarlos.
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${
      p2[0] - (p3[0] - p1[0]) / 6
    } ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }

  const ultimo = pts[pts.length - 1]!;
  const id = `chispa-${valores.length}-${Math.round(max)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height: alto }}
      className="w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${id})`} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={ultimo[0]} cy={ultimo[1]} r={2} fill={color} />
    </svg>
  );
}

/**
 * Tarjeta de dato, con serie o barra opcionales: no todo dato tiene historia
 * que mostrar, y una barra vacía es peor que nada.
 */
export function TarjetaDato({
  titulo,
  valor,
  nota,
  tono = "neutro",
  serie,
  barra,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  tono?: Tono;
  serie?: number[];
  barra?: { pct: number; umbral?: number | null };
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-borde bg-superficie p-3.5">
      <p className="etiqueta">{titulo}</p>
      <p
        className={`hora mt-1 text-h3 font-bold leading-none tabular-nums ${TEXTO[tono]}`}
      >
        {valor}
      </p>
      {nota && (
        <p className="mt-1 text-caption leading-tight text-texto-2">{nota}</p>
      )}

      {barra && (
        <div className="mt-2.5">
          <BarraNivel
            pct={barra.pct}
            tono={tono}
            umbral={barra.umbral}
            alto={6}
          />
        </div>
      )}

      {serie && serie.length > 1 && (
        <div className="-mx-3.5 -mb-3.5 mt-2">
          <Chispa valores={serie} color={COLOR[tono]} alto={34} />
        </div>
      )}
    </div>
  );
}

/**
 * Fila comparativa. En pantalla ancha las barras quedan alineadas en columna,
 * que es lo que permite compararlas de un vistazo.
 */
export function FilaBarra({
  nombre,
  pct,
  tono,
  umbral,
  cifra,
  detalle,
}: {
  nombre: string;
  pct: number;
  tono: Tono;
  umbral?: number | null;
  cifra: string;
  detalle?: string;
}) {
  return (
    <li className="rounded-lg border border-borde bg-superficie px-4 py-3">
      {/* En móvil el nombre va completo y la barra debajo: recortarlo a "Café
          de la Biblio…" por cuarenta píxeles no vale la pena. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 truncate text-chico font-semibold sm:w-40 sm:flex-none">
          {nombre}
        </span>
        {/* El DOM va nombre → barra → cifra; móvil solo reordena con `order`,
            para que el lector de pantalla reciba siempre lo mismo. */}
        <span className="order-2 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
          <BarraNivel pct={pct} tono={tono} umbral={umbral} alto={10} />
        </span>
        <span
          className={`hora order-1 shrink-0 text-right text-chico font-bold tabular-nums sm:order-none sm:w-14 ${TEXTO[tono]}`}
        >
          {cifra}
        </span>
      </div>
      {detalle && (
        <p className="mt-1.5 text-caption text-texto-2">{detalle}</p>
      )}
    </li>
  );
}
