"use client";

/**
 * Consola de operación — "¿qué está mal ahora y qué se hizo?" (§34, §35, §36).
 *
 * La consola del sistema mide la plataforma; esta la OPERA. La diferencia
 * importa: una está para entender, la otra para actuar un martes al mediodía
 * cuando algo se rompió.
 *
 * El orden de la pantalla es el orden de las preguntas que alguien se hace en
 * ese momento, y no al revés:
 *
 *   1. **Incidentes.** Qué está mal ahora. Si no hay nada, lo dice — un centro
 *      de incidentes que siempre tiene algo en amarillo entrena a ignorarlo.
 *   2. **Modo emergencia.** La única palanca global, con su impacto escrito
 *      antes de tocarla.
 *   3. **Actividad.** Qué pasó y quién lo hizo. Va al final porque es la
 *      pregunta que se hace después, no durante.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icono } from "@/components/iconos";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { api, ErrorApi, horaCorta } from "@/lib/cliente";
import type { Gravedad, Incidente } from "@/core/incidentes";

interface Operacion {
  generadoEn: string;
  incidentes: Incidente[];
  salud: { baseMs: number; pendientes: number; fallidas: number; atrasados: number };
  comercios: {
    nombre: string;
    slug: string;
    estadoOperacion: string;
    franjasFuturas: number;
  }[];
  actividad: {
    cuando: string;
    quien: string;
    que: string;
    detalle: string | null;
  }[];
}

const TONO: Record<Gravedad, { caja: string; chip: string; texto: string }> = {
  CRITICO: {
    caja: "border-error bg-error-suave",
    chip: "bg-error text-white",
    texto: "Crítico",
  },
  ALTO: {
    caja: "border-aviso bg-atencion-suave",
    chip: "bg-aviso text-white",
    texto: "Alto",
  },
  MEDIO: {
    caja: "border-borde bg-superficie",
    chip: "bg-superficie-3 text-texto-2",
    texto: "Medio",
  },
};

export default function Pagina() {
  const [datos, setDatos] = useState<Operacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<null | "PAUSAR_TODO" | "REANUDAR_TODO">(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    api<Operacion>("/api/admin/operacion")
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e) =>
        setError(
          e instanceof ErrorApi ? e.message : "No pudimos leer el estado.",
        ),
      );
  }, []);

  useEffect(() => {
    cargar();
    // Cada 30 s: esta pantalla se deja abierta durante un incidente, y un dato
    // congelado ahí es peor que ninguno.
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  async function ejecutar(accion: "PAUSAR_TODO" | "REANUDAR_TODO") {
    setEnviando(true);
    try {
      await api("/api/admin/operacion", {
        method: "POST",
        body: JSON.stringify({ accion }),
      });
      setConfirmando(null);
      cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo aplicar.");
    } finally {
      setEnviando(false);
    }
  }

  const abiertos = datos?.comercios.filter((c) => c.estadoOperacion === "ABIERTO") ?? [];
  const pausados = datos?.comercios.filter((c) => c.estadoOperacion === "PAUSADO") ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:px-5">
      <Link href="/panel" className="etiqueta inline-flex items-center gap-1">
        ← Panel
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="titulo text-h1">Operación</h1>
        <p className="mt-1 text-chico text-texto-2">
          Qué está mal ahora, qué se puede hacer, y quién hizo qué.
        </p>
      </header>

      {error && <ErrorVista texto={error} onReintentar={cargar} />}

      {!datos && !error && (
        <div className="space-y-3">
          <Esqueleto className="h-24 w-full" />
          <Esqueleto className="h-32 w-full" />
        </div>
      )}

      {datos && (
        <>
          {/* ----------------------------------------------- Incidentes */}
          <section className="mb-8">
            <h2 className="etiqueta mb-2">Incidentes</h2>

            {datos.incidentes.length === 0 ? (
              /* El silencio se dice explícitamente. "Nada" y "no cargó" se ven
                 igual si la sección queda vacía, y esa duda es exactamente lo
                 que no se puede tener durante un incidente. */
              <p className="flex items-center gap-2 rounded-md border border-exito/40 bg-exito-suave px-4 py-3 text-cuerpo font-semibold">
                <Icono nombre="palomita" size={18} />
                Todo operando normalmente
              </p>
            ) : (
              <ul className="space-y-2">
                {datos.incidentes.map((i) => {
                  const t = TONO[i.gravedad];
                  return (
                    <li
                      key={i.id}
                      className={`rounded-md border-2 px-4 py-3 ${t.caja}`}
                    >
                      <p className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-caption font-bold uppercase tracking-wide ${t.chip}`}
                        >
                          {t.texto}
                        </span>
                        <span className="text-cuerpo font-semibold">
                          {i.titulo}
                        </span>
                      </p>
                      <p className="mt-1 text-chico text-texto-2">{i.detalle}</p>
                      {i.accion && (
                        <p className="mt-2 flex items-start gap-1.5 text-chico font-medium">
                          <Icono nombre="atras" size={14} className="mt-0.5 rotate-180" />
                          {i.accion}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ------------------------------------------ Modo emergencia */}
          <section className="mb-8">
            <h2 className="etiqueta mb-2">Modo emergencia</h2>

            <div className="rounded-lg border border-borde bg-superficie p-4">
              <p className="text-chico text-texto-2">
                Detiene la entrada de pedidos nuevos en todos los comercios
                abiertos.{" "}
                {/* La tranquilidad va en negrita porque es lo que decide si
                    alguien se anima a tocar el botón bajo presión. */}
                <strong className="text-texto">
                  Los pedidos ya confirmados no se cancelan
                </strong>{" "}
                y la cocina los sigue viendo.
              </p>

              <p className="hora mt-3 text-chico">
                {abiertos.length} abiertos · {pausados.length} pausados
              </p>

              {confirmando === null ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={abiertos.length === 0}
                    onClick={() => setConfirmando("PAUSAR_TODO")}
                    className="presiona flex min-h-12 items-center gap-2 rounded-md bg-error px-5 text-cuerpo font-semibold text-white disabled:opacity-40"
                  >
                    <Icono nombre="cerrar" size={16} />
                    Pausar todos los pedidos
                  </button>
                  <button
                    type="button"
                    disabled={pausados.length === 0}
                    onClick={() => setConfirmando("REANUDAR_TODO")}
                    className="presiona flex min-h-12 items-center rounded-md border border-borde px-5 text-cuerpo font-semibold disabled:opacity-40"
                  >
                    Reanudar los pausados
                  </button>
                </div>
              ) : (
                /* Confirmación con el impacto CONTADO, no genérica.
                   "¿Estás seguro?" no informa nada; "esto afecta a 3
                   comercios" sí. */
                <div className="mt-3 rounded-md border border-error/40 bg-error-suave p-3">
                  <p className="text-chico font-semibold">
                    {confirmando === "PAUSAR_TODO"
                      ? `Vas a pausar ${abiertos.length} ${abiertos.length === 1 ? "comercio" : "comercios"}: ${abiertos.map((c) => c.nombre).join(", ")}.`
                      : `Vas a reabrir ${pausados.length} ${pausados.length === 1 ? "comercio" : "comercios"}: ${pausados.map((c) => c.nombre).join(", ")}.`}
                  </p>
                  <p className="mt-1 text-caption text-texto-2">
                    Queda registrado con tu cuenta.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => ejecutar(confirmando)}
                      className="presiona min-h-11 rounded-md bg-error px-4 text-chico font-semibold text-white disabled:opacity-50"
                    >
                      {enviando ? "Aplicando…" : "Sí, hacerlo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(null)}
                      className="presiona min-h-11 rounded-md border border-borde px-4 text-chico font-semibold"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* -------------------------------------------- Actividad */}
          <section>
            <h2 className="etiqueta mb-2">Actividad reciente</h2>
            <p className="mb-3 text-chico text-texto-2">
              Lo que hicieron las personas en las últimas 12 horas. Los barridos
              automáticos no aparecen: esta lista existe para responder quién
              tocó qué.
            </p>

            {datos.actividad.length === 0 ? (
              <p className="rounded-md border border-borde bg-superficie px-4 py-3 text-chico text-texto-2">
                Sin actividad de operación en las últimas 12 horas.
              </p>
            ) : (
              <ol className="overflow-hidden rounded-lg border border-borde bg-superficie">
                {datos.actividad.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-3 border-b border-borde px-4 py-2.5 last:border-0"
                  >
                    <span className="hora shrink-0 text-caption text-texto-3">
                      {horaCorta(a.cuando)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-chico font-medium">{a.que}</span>
                      <span className="block truncate text-caption text-texto-2">
                        {a.quien}
                        {a.detalle ? ` · ${a.detalle}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="hora mt-6 text-caption text-texto-3">
            Actualizado {horaCorta(datos.generadoEn)} · se refresca solo cada 30 s
          </p>
        </>
      )}
    </main>
  );
}
