"use client";

/**
 * Micro-encuesta posterior al retiro (§14.6).
 *
 * Una sola pregunta, tres segundos, y **después** de que el pedido se retiró.
 * Nunca durante el flujo de pedido: preguntar en medio de lo que se está
 * midiendo mete fricción en el propio dato de usabilidad.
 *
 * Se puede ignorar sin costo — no hay botón de cerrar que castigue, y contestar
 * es opcional por diseño. Eso introduce el sesgo de respuesta que hay que
 * declarar en el análisis: las encuestas opcionales las contesta sobre todo
 * quien quedó contento.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/cliente";

interface Pregunta {
  id: string;
  texto: string;
  opciones: { valor: string; texto: string }[];
}

export function MicroEncuesta({ pedidoId }: { pedidoId: string }) {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const [enviada, setEnviada] = useState(false);
  const [oculta, setOculta] = useState(false);

  const cargar = useCallback(() => {
    api<{ pregunta: Pregunta | null }>(
      `/api/encuestas/micro?pedidoId=${pedidoId}`,
    )
      .then((r) => setPregunta(r.pregunta))
      // Un fallo acá no es interesante para el usuario: simplemente no aparece.
      .catch(() => setPregunta(null));
  }, [pedidoId]);

  useEffect(cargar, [cargar]);

  async function responder(opcion: string) {
    if (!pregunta) return;
    setEnviada(true);
    try {
      await api("/api/encuestas/micro", {
        method: "POST",
        body: JSON.stringify({ pedidoId, pregunta: pregunta.id, opcion }),
      });
    } catch {
      /* Si no se pudo guardar, no vale interrumpir: es un dato opcional. */
    }
  }

  if (!pregunta || oculta) return null;

  if (enviada) {
    return (
      <div className="entra mt-5 rounded-md bg-turno-claro px-4 py-3 text-sm">
        Gracias. Eso ayuda a ajustar el sistema.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="micro-pregunta"
      className="entra tarjeta mt-5 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p id="micro-pregunta" className="font-semibold">
          {pregunta.texto}
        </p>
        <button
          type="button"
          onClick={() => setOculta(true)}
          className="etiqueta shrink-0 hover:text-tinta"
          aria-label="Cerrar la pregunta"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {pregunta.opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => responder(o.valor)}
            className="presiona rounded-full border border-borde px-4 py-2 text-sm font-medium hover:border-marca-texto hover:bg-turno-claro"
          >
            {o.texto}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-tinta-suave">
        Es opcional y anónimo en el análisis.
      </p>
    </section>
  );
}
