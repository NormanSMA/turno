"use client";

import Link from "next/link";

/**
 * Panel del piloto. Solo ADMIN.
 *
 * No es un dashboard de vanidad: muestra exactamente los indicadores con umbral
 * de §14.5 y la comparación A/B, con el número crudo al lado de la meta. Si un
 * indicador no alcanza su meta, se ve — esconderlo sería el error 10 del
 * instructivo ("silencio sobre lo que falló").
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navegacion } from "@/components/Navegacion";
import { NumeroAnimado } from "@/components/NumeroAnimado";
import {
  CargaPorHora,
  CumplimientoPorDia,
  EmbudoCanales,
  type PuntoDia,
  type PuntoFranja,
} from "@/components/graficos";
import { api, ErrorApi } from "@/lib/cliente";

interface Resumen {
  condicion: string;
  pedidos: number;
  tasaCumplimiento: number | null;
  relacionPicoPromedio: number;
  tasaNoShow: number | null;
  anticipacionMedianaMin: number | null;
  cargaTotalMin: number;
  franjasUsadas: number;
}

interface Metricas {
  generadoEn: string;
  totales: { usuarios: number; pedidos: number; activados: number };
  comparacionAB: {
    a: Resumen;
    b: Resumen;
    todas: Resumen;
    deltaPicoPromedio: number | null;
    deltaCumplimiento: number | null;
  };
  embudo: {
    canal: string;
    registros: number;
    activados: number;
    tasaActivacion: number | null;
  }[];
  tiempoActivacionMedianaMin: number | null;
  usabilidad: {
    respuestas: number;
    promedio: number | null;
    mediana: number | null;
    sobreUmbral: number | null;
    adjetivo: string | null;
  };
  micro: { pregunta: string; opcion: string; conteo: number }[];
  microMinutos: {
    pregunta: string;
    texto: string;
    respuestas: number;
    promedioMin: number | null;
    medianaMin: number | null;
  }[];
  cargaPorHora: { a: PuntoFranja[]; b: PuntoFranja[] };
  porDia: PuntoDia[];
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null, d = 2) => (v === null ? "—" : v.toFixed(d));

export default function Pagina() {
  const router = useRouter();
  const [m, setM] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Metricas>("/api/admin/metricas")
      .then(setM)
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace("/entrar?volver=/panel");
          return;
        }
        setError(
          e instanceof ErrorApi
            ? e.message
            : "No se pudieron cargar las métricas.",
        );
      });
  }, [router]);

  if (error)
    return (
      <>
        <Navegacion />
        <main className="p-8 text-sm">{error}</main>
      </>
    );
  if (!m) return <main className="p-8 text-sm text-tinta-suave">Cargando…</main>;

  const c = m.comparacionAB;

  return (
    <>
    <Navegacion />
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-8 sm:px-5 sm:pb-12">
      <header className="mb-8">
        <p className="etiqueta">Piloto TURNO</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/panel/operacion"
            className="presiona inline-flex items-center gap-2 rounded-full border border-borde bg-superficie px-4 py-2 text-chico font-semibold"
          >
            Operación
          </Link>
          <Link
            href="/panel/usuarios"
            className="presiona inline-flex items-center gap-2 rounded-full border border-borde bg-superficie px-4 py-2 text-chico font-semibold"
          >
            Accesos
          </Link>
          <Link
            href="/panel/sistema"
            className="presiona inline-flex items-center gap-2 rounded-full border border-borde bg-superficie px-4 py-2 text-chico font-semibold"
          >
            Estado del sistema
          </Link>
        </div>
        <h1 className="titulo text-4xl">Indicadores</h1>
        <p className="mt-2 text-sm text-tinta-suave">
          {m.totales.pedidos} pedidos · {m.totales.usuarios} usuarios ·{" "}
          {m.totales.activados} activados
        </p>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          numero="2"
          titulo="Cumplimiento de la promesa"
          valor={pct(c.todas.tasaCumplimiento)}
          cifra={
            c.todas.tasaCumplimiento === null
              ? null
              : c.todas.tasaCumplimiento * 100
          }
          sufijo="%"
          meta="≥ 90%"
          alcanzada={
            c.todas.tasaCumplimiento !== null && c.todas.tasaCumplimiento >= 0.9
          }
        />
        <Tarjeta
          numero="3"
          titulo="Pico / promedio de carga"
          valor={num(c.todas.relacionPicoPromedio)}
          cifra={c.todas.relacionPicoPromedio}
          decimales={2}
          meta={c.deltaPicoPromedio === null ? "faltan datos de B" : "menor en B"}
          alcanzada={
            c.deltaPicoPromedio === null ? null : c.deltaPicoPromedio < 0
          }
        />
        <Tarjeta
          numero="4"
          titulo="Tasa de no-show"
          valor={pct(c.todas.tasaNoShow)}
          cifra={c.todas.tasaNoShow === null ? null : c.todas.tasaNoShow * 100}
          sufijo="%"
          meta="caracterizar"
          alcanzada={null}
        />
        <Tarjeta
          numero="7"
          titulo="Usabilidad (SUS)"
          valor={
            m.usabilidad.promedio === null
              ? "—"
              : m.usabilidad.promedio.toFixed(1)
          }
          meta={
            m.usabilidad.respuestas === 0
              ? "sin respuestas"
              : `≥ 68 · ${m.usabilidad.adjetivo}`
          }
          alcanzada={
            m.usabilidad.promedio === null ? null : m.usabilidad.promedio >= 68
          }
        />
      </section>

      {m.microMinutos.some((x) => x.respuestas > 0) && (
        <section className="mb-8">
          <h2 className="etiqueta mb-2">Percepción del usuario, en minutos</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {m.microMinutos
              .filter((x) => x.respuestas > 0)
              .map((x) => (
                <div key={x.pregunta} className="tarjeta p-4">
                  <p className="text-sm">{x.texto}</p>
                  <p className="hora mt-2 text-3xl font-bold">
                    {x.medianaMin === null ? (
                      "—"
                    ) : (
                      <NumeroAnimado valor={x.medianaMin} sufijo=" min" />
                    )}
                  </p>
                  <p className="hora text-xs text-tinta-suave">
                    mediana · promedio {num(x.promedioMin, 1)} ·{" "}
                    {x.respuestas} respuesta{x.respuestas === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
          </div>
          <p className="mt-2 max-w-2xl text-xs text-tinta-suave">
            Se pregunta con cifras y no con &ldquo;bastante&rdquo; o
            &ldquo;poco&rdquo; para poder promediarlas y contrastarlas con el
            ahorro que el sistema calcula. Si percepción y medición no coinciden,
            eso es un hallazgo — puede señalar un problema en cómo se comunica la
            hora prometida, no en el motor.
          </p>
        </section>
      )}

      {m.micro.length > 0 && (
        <section className="mb-8">
          <h2 className="etiqueta mb-2">Micro-encuesta posterior al retiro</h2>
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-borde text-left">
                <tr>
                  <th className="p-3 font-medium">Pregunta</th>
                  <th className="p-3 font-medium">Respuesta</th>
                  <th className="p-3 font-medium">Conteo</th>
                </tr>
              </thead>
              <tbody className="hora">
                {m.micro.map((r, i) => (
                  <tr key={i} className="border-b border-borde last:border-0">
                    <td className="p-3">{r.pregunta.replace(/_/g, " ")}</td>
                    <td className="p-3">{r.opcion.replace(/_/g, " ")}</td>
                    <td className="p-3">{r.conteo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 max-w-lg text-xs text-tinta-suave">
            Las encuestas opcionales las contesta sobre todo quien quedó
            contento. Estos datos son direccionales; el peso del análisis lo
            cargan los duros — tiempos, cumplimiento y distribución.
          </p>
        </section>
      )}

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="tarjeta p-5">
          <h2 className="etiqueta mb-1">Indicador 3 · distribución de la carga</h2>
          <p className="mb-3 text-sm text-tinta-suave">
            ¿La sugerencia aplana el pico del receso?
          </p>
          <CargaPorHora
            a={m.cargaPorHora.a}
            b={m.cargaPorHora.b}
            razonA={c.a.relacionPicoPromedio}
            razonB={c.b.relacionPicoPromedio}
          />
        </div>

        <div className="tarjeta flex flex-col gap-6 p-5">
          <div>
            <h2 className="etiqueta mb-1">Indicador 2 · cumplimiento por día</h2>
            <p className="mb-3 text-sm text-tinta-suave">
              ¿El comercio sostiene la promesa a lo largo del piloto?
            </p>
            <CumplimientoPorDia dias={m.porDia} />
          </div>

          <div>
            <h2 className="etiqueta mb-1">Indicador 6 · embudo de captación</h2>
            <p className="mb-3 text-sm text-tinta-suave">
              De los que escanearon y se registraron, ¿cuántos llegaron a pedir?
            </p>
            <EmbudoCanales canales={m.embudo} />
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="etiqueta mb-1">Comparación A / B</h2>
        <p className="mb-3 max-w-2xl text-sm text-tinta-suave">
          La hipótesis de §6.4 se cumple si el pico/promedio baja en B y el
          cumplimiento no se degrada.
        </p>

        {/*
         * El veredicto primero.
         *
         * La tabla respondía la pregunta del experimento en la cuarta columna
         * de la segunda fila, y había que saber que un delta negativo es bueno
         * ahí y malo en cumplimiento. Esto lo dice en una línea; la tabla queda
         * abajo para auditar el número.
         */}
        <VeredictoAB
          deltaPico={c.deltaPicoPromedio}
          deltaCumplimiento={c.deltaCumplimiento}
        />

        <div className="mt-3 overflow-hidden rounded-xl border border-borde bg-papel-alto">
          <ul>
            <BarraAB
              nombre="Pedidos"
              a={c.a.pedidos}
              b={c.b.pedidos}
              formato={(v) => String(Math.round(v))}
            />
            <BarraAB
              nombre="Pico / promedio"
              nota="más bajo es mejor: la carga está más repartida"
              a={c.a.relacionPicoPromedio}
              b={c.b.relacionPicoPromedio}
              formato={(v) => v.toFixed(2)}
              menorEsMejor
            />
            <BarraAB
              nombre="Cumplimiento"
              a={c.a.tasaCumplimiento}
              b={c.b.tasaCumplimiento}
              formato={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <BarraAB
              nombre="No-show"
              nota="más bajo es mejor"
              a={c.a.tasaNoShow}
              b={c.b.tasaNoShow}
              formato={(v) => `${(v * 100).toFixed(0)}%`}
              menorEsMejor
            />
            <BarraAB
              nombre="Anticipación mediana"
              a={c.a.anticipacionMedianaMin}
              b={c.b.anticipacionMedianaMin}
              formato={(v) => `${Math.round(v)} min`}
            />
          </ul>

          <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-borde px-4 py-2.5 text-[0.6875rem] text-tinta-suave">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "#009ca6" }}
              />
              A · elección libre
            </span>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "#c26208" }}
              />
              B · sugerencia activa
            </span>
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="etiqueta mb-2">Activación</h2>
        <p className="text-sm text-tinta-suave">
          Tiempo mediano entre registrarse y hacer el primer pedido:{" "}
          <strong className="hora text-tinta">
            {num(m.tiempoActivacionMedianaMin, 0)} min
          </strong>
          . Sirve para no malinterpretar el primer día, donde hay muchos
          registros y pocos pedidos — que es lo esperable, no un fracaso.
        </p>
      </section>

      {/* Ancla normal y no <Link>: esto es una DESCARGA, no una navegación.
          Con el enrutador de Next, el navegador intentaría renderizar la
          respuesta en vez de guardarla como archivo. */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/admin/metricas?formato=csv&datos=pedidos"
          className="inline-flex min-h-11 items-center rounded-full border border-marca-texto px-5 text-sm font-semibold text-marca-texto"
        >
          Pedidos en CSV
        </a>
        <a
          href="/api/admin/metricas?formato=csv&datos=franjas"
          className="inline-flex min-h-11 items-center rounded-full border border-borde px-5 text-sm font-semibold"
        >
          Franjas en CSV
        </a>
      </div>
      <p className="mt-3 max-w-lg text-xs text-tinta-suave">
        Datos crudos, sin agregar: el análisis tiene que poder reproducirlo un
        tercero con sus propias herramientas. <strong>Pedidos</strong> trae una
        fila por pedido y ya calculadas la anticipación, la preparación real y
        la espera de retiro, en minutos. <strong>Franjas</strong> trae la
        capacidad declarada, la efectiva y la ocupación de cada ventana.
      </p>
    </main>
    </>
  );
}

function Tarjeta({
  numero,
  titulo,
  valor,
  cifra,
  decimales = 1,
  sufijo = "",
  meta,
  alcanzada,
}: {
  numero: string;
  titulo: string;
  /** Texto ya formateado; es lo que se muestra si no hay cifra que animar. */
  valor: string;
  /**
   * La cifra cruda detrás de `valor`, cuando existe. Con ella el indicador
   * cuenta hasta su valor al entrar en pantalla; sin ella (un guion largo
   * porque todavía no hay datos) no hay nada que contar y se muestra el texto.
   */
  cifra?: number | null;
  decimales?: number;
  sufijo?: string;
  meta: string;
  alcanzada: boolean | null;
}) {
  const tono =
    alcanzada === null
      ? "var(--color-texto-3)"
      : alcanzada
        ? "var(--color-exito)"
        : "var(--color-aviso)";

  return (
    <div className="relative overflow-hidden rounded-xl border border-borde bg-papel-alto p-4 pl-5">
      {/* Riel de estado.
          Cumplida, corta o sin datos son tres cosas distintas y antes solo se
          distinguían por el color de una línea de texto de doce píxeles. El
          riel las separa desde el borde de la tarjeta, y el texto de la meta
          sigue diciendo lo mismo para quien no lo vea por color. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: tono, opacity: alcanzada === null ? 0.35 : 1 }}
      />

      {/* La numeración es la del cuadro de indicadores de §14.5, no decorativa:
          permite citar "indicador 2" en la tesis y encontrarlo acá. */}
      <p className="etiqueta">Indicador {numero}</p>
      <p className="mt-1 text-sm">{titulo}</p>
      <p className="hora mt-2 text-3xl font-bold">
        {cifra === null || cifra === undefined ? (
          valor
        ) : (
          <NumeroAnimado valor={cifra} decimales={decimales} sufijo={sufijo} />
        )}
      </p>
      <p
        className={`hora mt-1 text-xs ${
          alcanzada === null
            ? "text-tinta-suave"
            : alcanzada
              ? "text-verde"
              : "text-brasa"
        }`}
      >
        {/* La palabra solo se pone cuando hay juicio. Con `null` no es que
            falten datos —el indicador 4 tiene cifra y su meta es
            "caracterizar"—: es que no hay umbral contra el cual juzgar. */}
        {alcanzada === null ? "" : alcanzada ? "cumple · " : "corta · "}
        meta {meta}
      </p>
    </div>
  );
}

/**
 * El veredicto del experimento, en una línea.
 *
 * Un delta negativo es bueno en pico/promedio y malo en cumplimiento; pedirle
 * al lector que recuerde de qué lado está cada uno es cómo un panel deja de
 * responder la pregunta que existía para responder.
 */
function VeredictoAB({
  deltaPico,
  deltaCumplimiento,
}: {
  deltaPico: number | null;
  deltaCumplimiento: number | null;
}) {
  if (deltaPico === null) {
    return (
      <p className="rounded-lg border border-dashed border-borde bg-papel-alto px-4 py-3 text-sm text-tinta-suave">
        Todavía no hay pedidos suficientes en las dos condiciones para comparar.
      </p>
    );
  }

  const reparteMejor = deltaPico < 0;
  // Cinco puntos de tolerancia: la hipótesis pide que el cumplimiento no se
  // degrade, no que mejore.
  const sostiene = deltaCumplimiento === null || deltaCumplimiento >= -0.05;
  const apoya = reparteMejor && sostiene;

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 ${
        apoya ? "border-verde bg-verde-claro" : "border-borde bg-papel-alto"
      }`}
    >
      <p className="text-sm font-bold">
        {apoya
          ? "Los datos apoyan la hipótesis"
          : reparteMejor
            ? "B reparte mejor, pero el cumplimiento se degradó"
            : "B no repartió mejor que A"}
      </p>
      <p className="hora mt-1 text-xs text-tinta-suave tabular-nums">
        pico/promedio {deltaPico > 0 ? "+" : ""}
        {deltaPico.toFixed(2)}
        {deltaCumplimiento !== null && (
          <>
            {" · "}cumplimiento {deltaCumplimiento > 0 ? "+" : ""}
            {(deltaCumplimiento * 100).toFixed(1)} pts
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Una métrica, con las dos condiciones a la misma escala.
 *
 * Dos números en columnas contiguas obligan a restarlos mentalmente; dos
 * barras alineadas se comparan sin hacer nada. La escala es común a A y B
 * dentro de la fila, nunca entre filas: son magnitudes distintas.
 */
function BarraAB({
  nombre,
  nota,
  a,
  b,
  formato,
  menorEsMejor,
}: {
  nombre: string;
  nota?: string;
  a: number | null;
  b: number | null;
  formato: (v: number) => string;
  menorEsMejor?: boolean;
}) {
  const hayDatos = a !== null && b !== null;
  const techo = Math.max(a ?? 0, b ?? 0, 0.0001);
  const gana =
    !hayDatos || a === b ? null : menorEsMejor ? (b! < a! ? "b" : "a") : b! > a! ? "b" : "a";

  const fila = (
    etiqueta: string,
    valor: number | null,
    color: string,
    esGanadora: boolean,
  ) => (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-[0.6875rem] font-bold text-tinta-suave">
        {etiqueta}
      </span>
      <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-papel-medio">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${((valor ?? 0) / techo) * 100}%`,
            background: color,
            // La que gana va entera; la otra, atenuada. El ganador se ve antes
            // de leer los números.
            opacity: esGanadora ? 1 : 0.5,
          }}
        />
      </span>
      <span className="hora w-16 shrink-0 text-right text-xs tabular-nums">
        {valor === null ? "—" : formato(valor)}
      </span>
    </div>
  );

  return (
    <li className="border-b border-borde px-4 py-3 last:border-0">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">{nombre}</span>
        {nota && (
          <span className="text-[0.6875rem] text-tinta-suave">{nota}</span>
        )}
      </div>
      <div className="space-y-1">
        {fila("A", a, "#009ca6", gana !== "b")}
        {fila("B", b, "#c26208", gana !== "a")}
      </div>
    </li>
  );
}

