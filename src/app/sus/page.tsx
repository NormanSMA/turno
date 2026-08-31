"use client";

/**
 * Cuestionario SUS, al cierre del piloto (§13.1, indicador 7).
 *
 * Los diez ítems canónicos, en su orden original y con la alternancia
 * positivo/negativo del instrumento. Esa alternancia obliga a leer cada ítem en
 * vez de marcar una columna entera, y es parte de por qué el puntaje se puede
 * comparar con literatura ajena — que es la única razón para usar SUS en lugar
 * de preguntas propias.
 *
 * El puntaje se calcula en el servidor sobre los diez ítems crudos, que quedan
 * guardados: poder recalcularlo desde el dato original es lo que permite que un
 * tercero audite el número del Capítulo V.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { Navegacion } from "@/components/Navegacion";
import { api, ErrorApi } from "@/lib/cliente";

interface Estado {
  corresponde: boolean;
  pedidos: number;
  yaRespondio: boolean;
  items: string[];
}

const ESCALA = [
  { valor: 1, texto: "Muy en desacuerdo" },
  { valor: 2, texto: "En desacuerdo" },
  { valor: 3, texto: "Neutral" },
  { valor: 4, texto: "De acuerdo" },
  { valor: 5, texto: "Muy de acuerdo" },
];

export default function Pagina() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  // Inicializador perezoso: sin la función, este arreglo se construye en cada
  // render y se descarta, porque useState solo usa el primero.
  const [respuestas, setRespuestas] = useState<(number | null)[]>(() =>
    Array(10).fill(null),
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [puntaje, setPuntaje] = useState<number | null>(null);

  useEffect(() => {
    api<Estado>("/api/encuestas/sus")
      .then(setEstado)
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace("/entrar?volver=/sus");
          return;
        }
        setError("No pudimos cargar el cuestionario.");
      });
  }, [router]);

  const completas = respuestas.every((r) => r !== null);
  const faltan = respuestas.filter((r) => r === null).length;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!completas) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await api<{ puntaje: number }>("/api/encuestas/sus", {
        method: "POST",
        body: JSON.stringify({ respuestas }),
      });
      setPuntaje(r.puntaje);
    } catch (err) {
      setError(
        err instanceof ErrorApi ? err.message : "No se pudo enviar el cuestionario.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (puntaje !== null) {
    return (
      <Marco>
        <p className="etiqueta">Gracias</p>
        <h1 className="titulo mt-2 text-3xl">Listo</h1>
        <p className="mt-3 text-sm text-tinta-suave">
          Tus respuestas quedaron registradas. Se analizan de forma anónima junto
          con las del resto de la cohorte.
        </p>
        <Link
          href="/"
          className="presiona brillo mt-6 inline-block rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white"
        >
          Volver al inicio
        </Link>
      </Marco>
    );
  }

  return (
    <Marco>
      <p className="etiqueta">Piloto TURNO</p>
      <h1 className="titulo mt-2 text-3xl sm:text-4xl">
        ¿Cómo te resultó usar TURNO?
      </h1>

      {!estado && (
        <div className="mt-6 space-y-3">
          <Esqueleto className="h-16 w-full" />
          <Esqueleto className="h-16 w-full" />
          <Esqueleto className="h-16 w-full" />
        </div>
      )}

      {estado && !estado.corresponde && (
        <p className="mt-4 rounded-md bg-papel-medio px-4 py-3 text-sm">
          {estado.yaRespondio
            ? "Ya respondiste este cuestionario. Gracias."
            : "Este cuestionario es para quienes hicieron al menos un pedido."}
        </p>
      )}

      {estado?.corresponde && (
        <form onSubmit={enviar}>
          <p className="mt-3 text-sm text-tinta-suave">
            Diez frases. Marcá qué tan de acuerdo estás con cada una. No hay
            respuestas correctas y toma menos de dos minutos.
          </p>

          <ol className="mt-6 space-y-5">
            {estado.items.map((texto, i) => (
              <li key={i} className="tarjeta p-4">
                <p className="font-medium">
                  <span className="hora mr-2 text-tinta-suave">{i + 1}.</span>
                  {texto}
                </p>

                <fieldset className="mt-3">
                  <legend className="sr-only">{texto}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {ESCALA.map((e) => (
                      <label
                        key={e.valor}
                        className={`presiona cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${
                          respuestas[i] === e.valor
                            ? "border-marca-texto bg-marca-fondo text-white"
                            : "border-borde text-tinta-suave hover:bg-turno-claro"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`item-${i}`}
                          value={e.valor}
                          checked={respuestas[i] === e.valor}
                          onChange={() =>
                            setRespuestas((r) =>
                              r.map((v, j) => (j === i ? e.valor : v)),
                            )
                          }
                          className="sr-only"
                        />
                        {e.texto}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </li>
            ))}
          </ol>

          {error && (
            <div className="mt-4">
              <ErrorVista texto={error} />
            </div>
          )}

          <div className="sticky bottom-0 mt-6 border-t border-borde bg-papel/95 py-4 backdrop-blur">
            <button
              type="submit"
              disabled={!completas || enviando}
              className="presiona brillo w-full rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40 disabled:shadow-none"
            >
              {enviando
                ? "Enviando…"
                : completas
                  ? "Enviar respuestas"
                  : `Faltan ${faltan} de 10`}
            </button>
          </div>
        </form>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navegacion />
      <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-8 sm:px-5 sm:pb-12">
        {children}
      </main>
    </>
  );
}
