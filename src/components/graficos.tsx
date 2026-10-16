"use client";

/**
 * Gráficos del panel. Envoltorio: textos, leyendas y cifras se renderizan
 * aquí; el dibujo (Recharts) se carga de forma diferida desde
 * graficos-recharts.tsx, con un esqueleto de la misma altura para que el CLS
 * siga en 0 (ADR-23 §4: recharts nunca en la carga inicial de otras rutas).
 *
 * Paleta por tokens: A = --chart-1, B = --chart-3, fallas = --color-error. No
 * se usa el rojo de marca: en estas pantallas señala acciones.
 *
 * La identidad nunca queda solo en el color: hay leyenda, etiqueta sobre el
 * pico y los mismos números en texto debajo de cada gráfico.
 */

import dynamic from "next/dynamic";

const A = "var(--chart-1)";
const B = "var(--chart-3)";

const Esqueleto = ({ className, style }: { className: string; style?: React.CSSProperties }) => (
  <div aria-hidden className={`${className} w-full rounded-sm bg-papel-medio`} style={style} />
);

const BarrasCarga = dynamic(
  () => import("./graficos-recharts").then((m) => m.BarrasCarga),
  { ssr: false, loading: () => <Esqueleto className="h-24" /> },
);
const LineaCumplimiento = dynamic(
  () => import("./graficos-recharts").then((m) => m.LineaCumplimiento),
  { ssr: false, loading: () => <Esqueleto className="h-32" /> },
);
const BarrasEmbudo = dynamic(
  () => import("./graficos-recharts").then((m) => m.BarrasEmbudo),
  { ssr: false, loading: () => <Esqueleto className="h-full" /> },
);

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
          serie="a"
          horas={horas}
          datos={a}
          maximo={maximo}
          razon={razonA}
        />
        <PanelSerie
          nombre="B · sugerencia activa"
          serie="b"
          horas={horas}
          datos={b}
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
  serie,
  horas,
  datos,
  maximo,
  razon,
}: {
  nombre: string;
  serie: "a" | "b";
  horas: string[];
  datos: PuntoFranja[];
  maximo: number;
  razon: number;
}) {
  const total = datos.reduce((acc, p) => acc + p.cargaMin, 0);
  const minutos = horas.map(
    (h) => datos.find((p) => p.hora === h)?.cargaMin ?? 0,
  );
  const valores = minutos.map((v) => (total === 0 ? 0 : (v / total) * 100));
  const pico = Math.max(...valores, 0);
  const indicePico = pico > 0 ? valores.indexOf(pico) : -1;
  const color = serie === "a" ? A : B;

  // La razón que se muestra es el INDICADOR 3, calculado por franja en el
  // servidor, no una razón derivada de esta silueta: son estadísticos
  // distintos y mostrar dos números con el mismo nombre y distinto valor es
  // lo primero que un jurado señala.

  // El promedio, dibujado: el indicador 3 es una razón pico/promedio.
  const conCarga = valores.filter((v) => v > 0);
  const promedio =
    conCarga.length > 0
      ? conCarga.reduce((s, v) => s + v, 0) / conCarga.length
      : 0;

  return (
    <figure>
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs font-semibold">{nombre}</span>
        <span className="hora text-xs text-tinta-suave tabular-nums">
          {pico.toFixed(0)}% en su hora pico ·{" "}
          <strong className="font-bold text-tinta">
            ind. 3: {razon.toFixed(2)}
          </strong>
        </span>
      </figcaption>

      <BarrasCarga
        serie={serie}
        nombre={nombre}
        horas={horas}
        minutos={minutos}
        valores={valores}
        maximo={maximo}
        promedio={promedio}
        indicePico={indicePico}
      />

      {/* Solo las horas de los extremos y la del pico. */}
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
  const ultimo = puntos.at(-1)!;
  const cumple = (ultimo.tasaCumplimiento ?? 0) >= META;
  const bajoMeta = puntos.filter((p) => p.tasaCumplimiento! < META).length;

  return (
    <figure>
      <LineaCumplimiento
        puntos={puntos.map((p) => ({
          dia: p.dia,
          pedidos: p.pedidos,
          tasa: p.tasaCumplimiento!,
        }))}
        piso={piso}
        meta={META}
        resumen={`Cumplimiento diario. Último día: ${((ultimo.tasaCumplimiento ?? 0) * 100).toFixed(0)} por ciento. ${bajoMeta} de ${puntos.length} días por debajo de la meta.`}
      />

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
    <div>
      <div style={{ height: 32 * ordenados.length }}>
        <BarrasEmbudo
          canales={ordenados.map((c) => ({
            canal: c.canal.replace(/_/g, " "),
            activados: c.activados,
            resto: Math.max(c.registros - c.activados, 0),
            total: c.registros,
          }))}
          maximo={maximo}
          altura={32 * ordenados.length}
        />
      </div>
      <ul className="mt-2 space-y-1">
      {ordenados.map((c) => {
        const tasa = c.tasaActivacion ?? 0;
        // Mejor o peor que el promedio del piloto: sin esa referencia, un 32 %
        // no se puede juzgar.
        const sobreMedia = global !== null && tasa > global;
        return (
          <li key={c.canal}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
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
            media del piloto: {(global * 100).toFixed(0)}%
          </span>
        )}
      </li>
      </ul>
    </div>
  );
}
