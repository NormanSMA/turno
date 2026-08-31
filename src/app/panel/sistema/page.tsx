"use client";

/**
 * Consola del sistema — "¿está funcionando bien?".
 *
 * El panel del piloto mide el experimento. Esto mide la PLATAFORMA, y está
 * pensado para quien la opera: si algo se rompe un martes al mediodía y nadie
 * se entera hasta el jueves, se pierden dos días de datos irrecuperables.
 *
 * Tres bloques, en orden de urgencia:
 *
 *   1. Salud       lo que hay que mirar primero cuando algo anda mal
 *   2. Presión     dónde el sistema ya está rechazando estudiantes
 *   3. Calibración si el modelo de admisión sigue siendo cierto
 *
 * El tercero es el que ninguna otra pantalla da, y el más importante a la
 * larga: todo el control de admisión descansa sobre que `t(p)` sea verdad.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Navegacion } from "@/components/Navegacion";
import { Icono } from "@/components/iconos";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import {
  BarraNivel,
  FilaBarra,
  Medidor,
  TarjetaDato,
  tonoPorUmbral,
} from "@/components/panel-ui";
import { api, ErrorApi } from "@/lib/cliente";
import type { Desvio, Embudo, PresionComercio } from "@/core/sistema";

interface Datos {
  dias: number;
  salud: {
    baseMs: number;
    correoPendiente: number;
    correoFallido: number;
    pushPendiente: number;
    pushFallido: number;
    suscripciones: number;
    sesionesVivas: number;
    franjas: number;
    pedidos: number;
  };
  presion: PresionComercio[];
  embudo: Embudo;
  calibracion: {
    muestras: number;
    porComercio: Desvio[];
    porProducto: Desvio[];
  };
  auditoria: {
    id: string;
    accion: string;
    entidad: string;
    actor: string;
    timestamp: string;
  }[];
}

const PERIODOS = [
  { dias: 1, texto: "Hoy" },
  { dias: 7, texto: "7 días" },
  { dias: 30, texto: "30 días" },
];

export default function Pagina() {
  const [dias, setDias] = useState(7);
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Datos>(`/api/admin/sistema?dias=${dias}`)
      .then((r) => {
        setError(null);
        setD(r);
      })
      .catch((e) =>
        setError(
          e instanceof ErrorApi && (e.status === 401 || e.status === 403)
            ? "Esta consola es solo para el administrador de la plataforma."
            : "No pudimos cargar el estado del sistema.",
        ),
      );
  }, [dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <Navegacion />
      <main
        id="contenido"
        className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 sm:px-5 sm:pb-12"
      >
        <header className="mb-5">
          <Link
            href="/panel"
            className="etiqueta inline-flex items-center gap-1.5 hover:text-texto"
          >
            <Icono nombre="atras" size={14} />
            Panel del piloto
          </Link>
          <h1 className="titulo mt-2 text-h1">Estado del sistema</h1>
          <p className="text-chico text-texto-2">
            Salud, presión de capacidad y calibración del modelo
          </p>
        </header>

        <div
          role="radiogroup"
          aria-label="Período"
          className="mb-6 flex gap-1 rounded-full border border-borde bg-superficie p-1"
        >
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              role="radio"
              aria-checked={dias === p.dias}
              onClick={() => setDias(p.dias)}
              className={`flex-1 rounded-full px-3 py-2 text-chico font-semibold transition-colors ${
                dias === p.dias
                  ? "bg-marca-fondo text-white"
                  : "text-texto-2 hover:text-texto"
              }`}
            >
              {p.texto}
            </button>
          ))}
        </div>

        {error && <ErrorVista texto={error} onReintentar={cargar} />}

        {!d && !error && (
          <div className="space-y-4">
            <Esqueleto className="h-28 w-full" />
            <Esqueleto className="h-40 w-full" />
            <Esqueleto className="h-52 w-full" />
          </div>
        )}

        {d && (
          <>
            {/* ------------------------------------------------- 1. Salud */}
            <Seccion
              titulo="Salud"
              nota="La latencia se mide con una consulta real a la base. Un «ok» que no toca nada da tranquilidad falsa."
            >
              <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                {/* La latencia va en medidor y no en tarjeta: es la única cifra
                    de la que depende todo lo demas, y un arco se lee desde
                    lejos, que es como se mira un panel colgado. */}
                <div className="flex items-center justify-center rounded-lg border border-borde bg-superficie px-6 py-4">
                  <Medidor
                    valor={d.salud.baseMs}
                    max={600}
                    umbral={400}
                    unidad="ms"
                    etiqueta="Base de datos"
                    tono={tonoPorUmbral(d.salud.baseMs, 150, 400)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <TarjetaDato
                    titulo="Correo en cola"
                    valor={String(d.salud.correoPendiente)}
                    nota={
                      d.salud.correoFallido > 0
                        ? `${d.salud.correoFallido} fallidos`
                        : "sin fallos"
                    }
                    tono={d.salud.correoFallido > 0 ? "malo" : "neutro"}
                  />
                  <TarjetaDato
                    titulo="Push en cola"
                    valor={String(d.salud.pushPendiente)}
                    nota={
                      d.salud.pushFallido > 0
                        ? `${d.salud.pushFallido} fallidos`
                        : `${d.salud.suscripciones} dispositivos`
                    }
                    tono={d.salud.pushFallido > 0 ? "malo" : "neutro"}
                  />
                  <TarjetaDato
                    titulo="Sesiones vivas"
                    valor={String(d.salud.sesionesVivas)}
                    nota={`${d.salud.pedidos} pedidos en el período`}
                  />
                </div>
              </div>
            </Seccion>

            {/* ---------------------------------------------- 2. Presión */}
            <Seccion
              titulo="Presión de capacidad"
              nota="Una franja saturada es una franja donde el sistema YA está rechazando estudiantes. Si ese número crece, no falta software: falta cocina."
            >
              {d.presion.length === 0 ? (
                <Vacio texto="Todavía no hay franjas en este período." />
              ) : (
                <ul className="space-y-2">
                  {d.presion.map((p) => {
                    const media = (p.ocupacionMedia ?? 0) * 100;
                    const pico = (p.picoOcupacion ?? 0) * 100;
                    return (
                      <FilaBarra
                        key={p.comercio}
                        nombre={p.comercio}
                        pct={media}
                        // 85 % es donde el sistema empieza a rechazar seguido.
                        // Dibujarlo convierte el porcentaje en un juicio.
                        umbral={85}
                        tono={tonoPorUmbral(media, 60, 85)}
                        cifra={
                          p.ocupacionMedia === null
                            ? "--"
                            : `${Math.round(media)}%`
                        }
                        detalle={
                          (p.saturadas > 0
                            ? `${p.saturadas} franjas saturadas · `
                            : "") +
                          (p.picoHora
                            ? `pico ${p.picoHora} al ${Math.round(pico)}% · `
                            : "") +
                          `${p.vacias} de ${p.franjas} vacías`
                        }
                      />
                    );
                  })}
                </ul>
              )}
            </Seccion>

            {/* ------------------------------------------ 3. Calibración */}
            <Seccion
              titulo="Calibración del modelo"
              nota="Compara el t(p) declarado contra lo que la cocina tarda de verdad. Si se despega, el sistema promete horas que no puede cumplir — y ninguna otra métrica lo dice."
            >
              {d.calibracion.muestras < 5 ? (
                <Vacio
                  texto={`Con ${d.calibracion.muestras} muestras no alcanza para concluir nada. Un desvío calculado sobre dos pedidos es ruido con aspecto de dato.`}
                />
              ) : (
                <>
                  <TablaDesvio
                    titulo="Por comercio"
                    filas={d.calibracion.porComercio}
                  />
                  {d.calibracion.porProducto.length > 0 && (
                    <div className="mt-4">
                      <TablaDesvio
                        titulo="Por producto"
                        nota="Solo pedidos de un único producto: con dos o más no se puede atribuir el tiempo."
                        filas={d.calibracion.porProducto}
                      />
                    </div>
                  )}
                </>
              )}
            </Seccion>

            {/* --------------------------------------------- 4. Embudo */}
            <Seccion
              titulo="Qué pasa con los pedidos"
              nota="Arranca en los pedidos creados, no en los intentos: un rechazo por capacidad nunca llega a ser un pedido y el sistema no lo guarda. De los rechazos habla la presión de arriba."
            >
              {/* Un embudo se lee como caída, no como seis números sueltos.
                  Las barras van a la misma escala para que la pérdida entre un
                  paso y el siguiente sea la propia forma. */}
              <ul className="space-y-1.5">
                {[
                  { etiqueta: "Creados", n: d.embudo.creados, tono: "neutro" as const },
                  { etiqueta: "En cocina", n: d.embudo.enCocina, tono: "neutro" as const },
                  { etiqueta: "Listos", n: d.embudo.listos, tono: "neutro" as const },
                  { etiqueta: "Retirados", n: d.embudo.retirados, tono: "bueno" as const },
                ].map((paso) => (
                  <li key={paso.etiqueta} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-caption text-texto-2">
                      {paso.etiqueta}
                    </span>
                    <span className="min-w-0 flex-1">
                      <BarraNivel
                        pct={
                          d.embudo.creados > 0
                            ? (paso.n / d.embudo.creados) * 100
                            : 0
                        }
                        tono={paso.tono}
                        alto={14}
                      />
                    </span>
                    <span className="hora w-12 shrink-0 text-right text-chico font-bold tabular-nums">
                      {paso.n}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Lo que se cayó del embudo va aparte y en tarjetas: no son un
                  paso más de la secuencia, son las dos formas de perderlo. */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <TarjetaDato
                  titulo="No-show"
                  valor={String(d.embudo.noShows)}
                  nota="cocinado y no retirado"
                  tono={d.embudo.noShows > 0 ? "malo" : "neutro"}
                />
                <TarjetaDato
                  titulo="Cancelados"
                  valor={String(d.embudo.cancelados)}
                  nota="liberaron su capacidad"
                />
              </div>

              {d.embudo.tasaRetiro !== null && (
                <p className="mt-3 text-chico text-texto-2">
                  Se retira el{" "}
                  <span className="hora font-bold text-texto">
                    {Math.round(d.embudo.tasaRetiro * 100)}%
                  </span>{" "}
                  de lo que se pide.
                </p>
              )}
            </Seccion>

            {/* ------------------------------------------ 5. Auditoría */}
            <Seccion
              titulo="Últimos cambios de configuración"
              nota="Quién tocó qué. Un parámetro del modelo cambiado a mitad del piloto explica un salto en los datos que si no queda sin explicación."
            >
              {d.auditoria.length === 0 ? (
                <Vacio texto="Nadie cambió configuración todavía." />
              ) : (
                <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
                  {d.auditoria.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-chico"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{a.accion}</span>{" "}
                        <span className="text-texto-2">{a.entidad}</span>
                      </span>
                      <span className="hora shrink-0 text-caption text-texto-2">
                        {a.actor}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>
          </>
        )}
      </main>
    </>
  );
}

function Seccion({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="etiqueta mb-1">{titulo}</h2>
      <p className="mb-3 max-w-2xl text-chico text-texto-2">{nota}</p>
      {children}
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-dashed border-borde bg-superficie p-5 text-chico text-texto-2">
      {texto}
    </p>
  );
}

/**
 * Declarado contra real.
 *
 * Era una tabla de cuatro columnas que en un telefono se leía con scroll
 * horizontal, y el dato que importa —cuánto se despega la cocina de lo que
 * prometió— quedaba en la última columna, la primera en salirse de pantalla.
 *
 * Ahora cada comercio es una fila con dos marcas sobre el mismo riel: lo
 * declarado y lo real. La distancia entre las dos ES el desvio, sin que haya
 * que dividir mentalmente dos números.
 */
function TablaDesvio({
  titulo,
  nota,
  filas,
}: {
  titulo: string;
  nota?: string;
  filas: Desvio[];
}) {
  if (filas.length === 0) {
    return <Vacio texto="Sin muestras suficientes todavía." />;
  }

  // Escala común a todas las filas: comparar comercios exige el mismo techo.
  const techo = Math.max(...filas.flatMap((f) => [f.declarado, f.real]), 1) * 1.1;

  return (
    <div className="overflow-hidden rounded-lg border border-borde bg-superficie">
      <div className="border-b border-borde bg-superficie-2 px-4 py-2.5">
        <p className="text-chico font-semibold">{titulo}</p>
        {nota && <p className="mt-0.5 text-caption text-texto-2">{nota}</p>}
      </div>

      <ul>
        {filas.map((f) => {
          const alto = f.factor > 1.15;
          const bajo = f.factor < 0.85;
          const color = alto
            ? "var(--color-error)"
            : bajo
              ? "var(--color-aviso)"
              : "var(--color-exito)";
          const pd = (f.declarado / techo) * 100;
          const pr = (f.real / techo) * 100;

          return (
            <li key={f.clave} className="border-t border-borde px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-chico font-semibold">{f.clave}</span>
                <span
                  className={`hora text-chico font-bold tabular-nums ${
                    alto ? "text-error" : bajo ? "text-aviso" : "text-exito"
                  }`}
                >
                  x{f.factor.toFixed(2)}
                </span>
              </div>

              {/* Un solo riel con dos marcas. El tramo entre ambas, pintado, es
                  el desvío: no hay que restar nada para verlo. */}
              <div className="relative mt-2 h-3 w-full rounded-full bg-superficie-2">
                <span
                  aria-hidden
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${Math.min(pd, pr)}%`,
                    width: `${Math.abs(pr - pd)}%`,
                    background: color,
                    opacity: 0.45,
                  }}
                />
                <span
                  aria-hidden
                  title="Declarado"
                  className="absolute top-0 h-full w-0.5 -translate-x-1/2 rounded-full bg-texto-3"
                  style={{ left: `${pd}%` }}
                />
                <span
                  aria-hidden
                  title="Real"
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-superficie"
                  style={{ left: `${pr}%`, background: color }}
                />
              </div>

              <p className="hora mt-1.5 text-caption text-texto-2 tabular-nums">
                declarado {f.declarado.toFixed(1)} min · real{" "}
                <span className="font-semibold text-texto">
                  {f.real.toFixed(1)} min
                </span>{" "}
                · {f.muestras} pedidos
              </p>
            </li>
          );
        })}
      </ul>

      {/* Leyenda: el color no puede ser la única pista de qué marca es cuál. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borde px-4 py-2.5 text-caption text-texto-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0.5 rounded-full bg-texto-3" />
          declarado
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-texto-2"
          />
          real
        </span>
      </p>
    </div>
  );
}
