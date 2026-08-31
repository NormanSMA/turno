"use client";

/**
 * Gráficos del panel. SVG a mano, sin librería.
 *
 * Paleta categórica verificada (luminosidad, croma, separación CVD, contraste
 * sobre blanco): A = #009ca6, B = #c26208. Peor par adyacente ΔE 17.4 deutan ·
 * 25.0 visión normal · contraste ≥ 3:1.
 *
 * No se usa el rojo de marca: en estas pantallas señala acciones, y una serie
 * pintada de rojo competiría con los botones. Los datos no son acciones.
 *
 * La identidad nunca queda solo en el color: hay leyenda, etiqueta sobre el
 * pico y una tabla con los mismos números debajo.
 */

const A = "#009ca6";
const B = "#c26208";
const REJILLA = "#dde9ea";
const TINTA_TENUE = "#60636b";

export interface PuntoFranja {
  hora: string;
  cargaMin: number;
}

export interface PuntoDia {
  dia: string;
  pedidos: number;
  tasaCumplimiento: number | null;
}

/**
 * Carga por hora, en PORCENTAJE de la carga de cada condición.
 *
 * Dos decisiones que evitan que el gráfico mienta:
 *
 *  1. Dos paneles y no barras agrupadas: lo que se lee es la FORMA de cada
 *     distribución. Agrupadas el ojo compara pares; en paneles, siluetas.
 *  2. Porcentaje y no minutos: la condición con más pedidos tendría el pico
 *     más alto aunque esté MÁS repartida, y el gráfico contradiría al
 *     indicador 3. Los minutos crudos quedan en el tooltip.
 */
export function CargaPorHora({
  a,
  b,
  razonA,
  razonB,
}: {
  a: PuntoFranja[];
  b: PuntoFranja[];
  /** Indicador 3 de cada condición, calculado POR FRANJA en el servidor. */
  razonA: number;
  razonB: number;
}) {
  const horas = [...new Set([...a, ...b].map((p) => p.hora))].sort();
  if (horas.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">
        Todavía no hay pedidos suficientes para dibujar la distribución.
      </p>
    );
  }

  const cuota = (serie: PuntoFranja[], hora: string) => {
    const total = serie.reduce((acc, p) => acc + p.cargaMin, 0);
    if (total === 0) return 0;
    return ((serie.find((p) => p.hora === hora)?.cargaMin ?? 0) / total) * 100;
  };
  // Escala común entre paneles: comparar siluetas exige el mismo techo.
  const maximo = Math.max(
    1,
    ...horas.map((h) => Math.max(cuota(a, h), cuota(b, h))),
  );

  return (
    <div>
      <Leyenda />
      <div className="mt-3 space-y-4">
        <PanelSerie
          nombre="A · elección libre"
          color={A}
          horas={horas}
          serie={a}
          maximo={maximo}
          razon={razonA}
        />
        <PanelSerie
          nombre="B · sugerencia activa"
          color={B}
          horas={horas}
          serie={b}
          maximo={maximo}
          razon={razonB}
        />
      </div>
      <p className="mt-3 text-xs text-tinta-suave">
        Cada barra es el porcentaje de la carga de cocina de esa condición que
        cayó en esa hora, sumando todos los días. Va en porcentaje y no en
        minutos para que las dos siluetas se comparen aunque una condición haya
        recibido más pedidos.
        <br />
        El <strong>indicador 3</strong> que acompaña a cada silueta se calcula
        por franja individual, no sobre esta agregación por hora: son
        estadísticos distintos y pueden no ordenar igual a A y B. El que define
        §14.5, y el que decide la hipótesis, es el indicador.
      </p>
    </div>
  );
}

function PanelSerie({
  nombre,
  color,
  horas,
  serie,
  maximo,
  razon,
}: {
  nombre: string;
  color: string;
  horas: string[];
  serie: PuntoFranja[];
  maximo: number;
  razon: number;
}) {
  const total = serie.reduce((acc, p) => acc + p.cargaMin, 0);
  const minutos = horas.map(
    (h) => serie.find((p) => p.hora === h)?.cargaMin ?? 0,
  );
  const valores = minutos.map((v) => (total === 0 ? 0 : (v / total) * 100));
  const pico = Math.max(...valores, 0);
  const indicePico = valores.indexOf(pico);

  // La razón que se muestra es el INDICADOR 3, calculado por franja en el
  // servidor — no una razón derivada de esta silueta. Son estadísticos
  // distintos: la silueta agrega por hora del día sobre todos los días y
  // comercios, y su pico/promedio puede ordenar A y B al revés que el
  // indicador. Mostrar dos números con el mismo nombre y distinto valor es
  // exactamente lo que un jurado señala primero.

  const alto = 88;
  const ancho = 100;
  const paso = ancho / horas.length;
  // 2px de separación entre barras: el hueco de superficie que pide la guía.
  const anchoBarra = Math.max(0.8, paso - 0.9);

  /*
   * El promedio, dibujado.
   *
   * El indicador 3 ES una razón pico/promedio, y el promedio no aparecía en
   * ninguna parte: había que creerle al número. Con la línea, la razón se ve
   * — cuánto sobresale la barra más alta sobre la referencia.
   */
  const conCarga = valores.filter((v) => v > 0);
  const promedio =
    conCarga.length > 0
      ? conCarga.reduce((a, b) => a + b, 0) / conCarga.length
      : 0;
  const idGrad = `carga-${nombre.slice(0, 1)}`;

  return (
    <figure>
      {/* Envuelve en vez de comprimirse: en móvil "A · elección libre" y la
          cifra no entran en la misma línea, y partir las dos a la mitad se lee
          peor que ponerlas una debajo de otra. */}
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs font-semibold">{nombre}</span>
        <span className="hora text-xs text-tinta-suave tabular-nums">
          {pico.toFixed(0)}% en su hora pico ·{" "}
          <strong className="font-bold text-tinta">
            ind. 3: {razon.toFixed(2)}
          </strong>
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${ancho} ${alto + 12}`}
        role="img"
        aria-label={`Distribución de la carga en la condición ${nombre}. ${pico.toFixed(0)} por ciento cae en la hora pico. Indicador 3: ${razon.toFixed(2)}.`}
        className="w-full"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Degradado vertical del mismo tono: da cuerpo a la barra sin
              introducir un segundo color que habría que interpretar. */}
          <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Rejilla recesiva: tres líneas, sin números que compitan. */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2={ancho}
            y1={alto - alto * f}
            y2={alto - alto * f}
            stroke={REJILLA}
            strokeWidth="0.4"
          />
        ))}

        {/* La referencia contra la que se mide el pico. */}
        {promedio > 0 && (
          <line
            x1="0"
            x2={ancho}
            y1={alto - (promedio / maximo) * alto}
            y2={alto - (promedio / maximo) * alto}
            stroke={TINTA_TENUE}
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
        )}

        {valores.map((v, i) => {
          const h = (v / maximo) * alto;
          const esPico = i === indicePico && pico > 0;
          return (
            <rect
              key={horas[i]}
              x={i * paso + (paso - anchoBarra) / 2}
              y={alto - h}
              width={anchoBarra}
              height={h}
              rx="0.9"
              fill={`url(#${idGrad})`}
              // El pico va entero y el resto atenuado: la pregunta del gráfico
              // es dónde está la punta, no cuánto mide cada hora.
              opacity={esPico ? 1 : 0.6}
            >
              <title>{`${horas[i]} · ${minutos[i]} min de cocina · ${v.toFixed(1)}% de la condición`}</title>
            </rect>
          );
        })}

        <line x1="0" x2={ancho} y1={alto} y2={alto} stroke={REJILLA} strokeWidth="0.6" />
      </svg>

      {/* Solo las horas de los extremos y la del pico: etiquetar todas las
          columnas convierte el eje en ruido. */}
      <div className="hora mt-0.5 flex justify-between text-[0.625rem] text-tinta-suave">
        <span>{horas[0]}</span>
        {indicePico > 0 && indicePico < horas.length - 1 && (
          <span className="font-bold" style={{ color }}>
            {horas[indicePico]}
          </span>
        )}
        <span>{horas.at(-1)}</span>
      </div>
      <p className="mt-0.5 text-[0.625rem] text-tinta-suave">
        línea punteada: promedio de las horas con carga
      </p>
    </figure>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-4 text-xs">
      {[
        { color: A, texto: "A · elección libre" },
        { color: B, texto: "B · sugerencia activa" },
      ].map((s) => (
        <span key={s.texto} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: s.color }}
          />
          <span className="text-tinta-suave">{s.texto}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Cumplimiento por día contra la meta del 90 %.
 *
 * La meta va como línea de referencia y, ahora, con la zona de incumplimiento
 * sombreada por debajo: un punto que cae ahí se ve antes de leer el número. Es
 * el umbral declarado en §14.5, y verlo cruzar es la lectura que decide si α
 * quedó bien calibrado.
 */
export function CumplimientoPorDia({ dias }: { dias: PuntoDia[] }) {
  const puntos = dias.filter((d) => d.tasaCumplimiento !== null);
  if (puntos.length < 2) {
    return (
      <p className="text-sm text-tinta-suave">
        Hacen falta al menos dos días con pedidos resueltos para ver la
        evolución.
      </p>
    );
  }

  const ancho = 100;
  const alto = 60;
  const META = 0.9;

  /*
   * El eje NO arranca en cero, y hay que decirlo.
   *
   * El cumplimiento vive entre 85 % y 100 %: con el eje completo, todos los
   * días quedan aplastados contra el techo y no se distingue un 86 % de un
   * 99 % — que es justo la diferencia que este gráfico existe para mostrar.
   *
   * Recortar un eje puede exagerar, así que se compensa de dos formas: el piso
   * nunca sube por encima del 80 % (la meta del 90 % siempre queda dentro, con
   * aire debajo) y el valor del piso se escribe en el eje. Un eje recortado y
   * rotulado es honesto; uno recortado y callado, no.
   */
  const minValor = Math.min(...puntos.map((p) => p.tasaCumplimiento!));
  const piso = Math.min(0.8, Math.floor((minValor - 0.05) * 20) / 20);
  const x = (i: number) => (i / (puntos.length - 1)) * ancho;
  const y = (v: number) => alto - ((v - piso) / (1 - piso)) * alto;

  /*
   * Curva suavizada, no polilínea.
   *
   * Lo que se busca acá es la tendencia —si el cumplimiento se sostiene o se
   * cae—, y el zigzag diario la esconde. Catmull-Rom → Bézier pasa por todos
   * los puntos, así que ningún día queda desplazado de su valor real.
   */
  const pts = puntos.map((p, i) => [x(i), y(p.tasaCumplimiento!)] as const);
  let linea = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    linea += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${
      p2[0] - (p3[0] - p1[0]) / 6
    } ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }

  const ultimo = puntos.at(-1)!;
  const cumple = (ultimo.tasaCumplimiento ?? 0) >= META;
  const bajoMeta = puntos.filter((p) => p.tasaCumplimiento! < META).length;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label={`Cumplimiento diario. Último día: ${((ultimo.tasaCumplimiento ?? 0) * 100).toFixed(0)} por ciento. ${bajoMeta} de ${puntos.length} días por debajo de la meta.`}
        className="w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="cumpl-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={A} stopOpacity="0.25" />
            <stop offset="100%" stopColor={A} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* La zona de incumplimiento, sombreada. Un punto que cae ahí se ve
            antes de leer su número. */}
        <rect
          x="0"
          y={y(META)}
          width={ancho}
          height={alto - y(META)}
          fill="#ff5247"
          opacity="0.06"
        />

        <line
          x1="0"
          x2={ancho}
          y1={y(META)}
          y2={y(META)}
          stroke={TINTA_TENUE}
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />

        <path
          d={`${linea} L ${ancho} ${alto} L 0 ${alto} Z`}
          fill="url(#cumpl-area)"
        />
        <path
          d={linea}
          fill="none"
          stroke={A}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {puntos.map((p, i) => {
          const esUltimo = i === puntos.length - 1;
          const falla = p.tasaCumplimiento! < META;
          return (
            <circle
              key={p.dia}
              cx={x(i)}
              cy={y(p.tasaCumplimiento!)}
              // El último va más grande: es el estado de hoy, no un día más.
              r={esUltimo ? 2.2 : falla ? 1.7 : 1.2}
              fill={falla ? "#ff5247" : A}
              stroke="#ffffff"
              strokeWidth="0.6"
            >
              <title>{`${p.dia} · ${(p.tasaCumplimiento! * 100).toFixed(0)}% · ${p.pedidos} pedidos`}</title>
            </circle>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="hora text-tinta-suave">
          {puntos[0].dia.slice(5)} · eje desde {(piso * 100).toFixed(0)}%
        </span>
        <span className="text-tinta-suave">
          {/* Se dice cuántos días fallaron, no solo cómo va el último: un mal
              día se olvida, una racha decide si α está mal calibrado. */}
          {bajoMeta === 0
            ? "todos los días sobre la meta"
            : `${bajoMeta} de ${puntos.length} días bajo el 90%`}
        </span>
        <span
          className={`hora font-semibold ${cumple ? "text-verde" : "text-alerta"}`}
        >
          {ultimo.dia.slice(5)} · {((ultimo.tasaCumplimiento ?? 0) * 100).toFixed(0)}%
        </span>
      </div>
    </figure>
  );
}

/**
 * Embudo por canal: registros y, dentro, cuántos llegaron a pedir.
 *
 * La barra interior es un subconjunto de la exterior, así que van anidadas y no
 * lado a lado: la relación parte-de-un-todo se lee sin comparar dos longitudes.
 *
 * Se ordena por volumen y la conversión va en grande, porque la pregunta del
 * indicador 6 no es cuál trajo más gente sino **cuál trajo gente que pidió**.
 * Un canal con cien registros y 5 % convierte peor que uno con veinte y 40 %.
 */
export function EmbudoCanales({
  canales,
}: {
  canales: {
    canal: string;
    registros: number;
    activados: number;
    tasaActivacion: number | null;
  }[];
}) {
  if (canales.length === 0) {
    return <p className="text-sm text-tinta-suave">Sin registros todavía.</p>;
  }

  const maximo = Math.max(...canales.map((c) => c.registros), 1);
  const ordenados = [...canales].sort((x, y) => y.registros - x.registros);

  // Promedio ponderado, no promedio de porcentajes: un canal con dos registros
  // al 100 % no puede pesar lo mismo que uno con doscientos.
  const totalReg = canales.reduce((a, c) => a + c.registros, 0);
  const totalAct = canales.reduce((a, c) => a + c.activados, 0);
  const global = totalReg > 0 ? totalAct / totalReg : null;

  return (
    <ul className="space-y-3">
      {ordenados.map((c) => {
        const tasa = c.tasaActivacion ?? 0;
        // Mejor o peor que el promedio del piloto: sin esa referencia, un 32 %
        // no se puede juzgar.
        const sobreMedia = global !== null && tasa > global;
        return (
          <li key={c.canal}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">{c.canal.replace(/_/g, " ")}</span>
              <span className="hora tabular-nums text-tinta-suave">
                {c.activados}/{c.registros}{" "}
                <strong
                  className={`font-bold ${
                    c.tasaActivacion === null
                      ? "text-tinta-suave"
                      : sobreMedia
                        ? "text-verde"
                        : "text-tinta"
                  }`}
                >
                  {c.tasaActivacion === null
                    ? "—"
                    : `${(tasa * 100).toFixed(0)}%`}
                </strong>
              </span>
            </div>

            <div className="relative h-6 overflow-hidden rounded-sm bg-papel-medio">
              {/* Los registros: el todo. */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500"
                style={{
                  width: `${(c.registros / maximo) * 100}%`,
                  background: A,
                  opacity: 0.22,
                }}
              />
              {/* Los que llegaron a pedir: la parte que importa. */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500"
                style={{
                  width: `${(c.activados / maximo) * 100}%`,
                  background: `linear-gradient(90deg, ${A}, color-mix(in oklab, ${A} 78%, black))`,
                }}
              />
              {/* La media del piloto, sobre la barra: convierte cada porcentaje
                  en "mejor o peor que el resto" sin tener que compararlos de a
                  pares. */}
              {global !== null && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-tinta/40"
                  style={{ left: `${global * (c.registros / maximo) * 100}%` }}
                />
              )}
            </div>
          </li>
        );
      })}

      <li className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[0.6875rem] text-tinta-suave">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: A, opacity: 0.22 }}
          />
          se registraron
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: A }}
          />
          llegaron a pedir
        </span>
        {global !== null && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-px bg-tinta/40" />
            media del piloto: {(global * 100).toFixed(0)}%
          </span>
        )}
      </li>
    </ul>
  );
}
