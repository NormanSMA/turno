"use client";

import { useId, useState } from "react";
import { m } from "motion/react";
import { MascotaTurno } from "@/components/mascota/Turno";
import {
  ANCHO_FRANJA_MIN,
  simularSimple,
  type EstadoSimple,
} from "@/core/simulador-simple";

const MENSAJE: Record<EstadoSimple, string> = {
  listo: "Todos los pedidos caben en el receso.",
  espera: "Casi todos caben. Unos pocos esperan a la franja siguiente.",
  error: "Más de la mitad no cabe. Hace falta más cocina.",
};

function Control({
  etiqueta,
  valor,
  min,
  max,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-chico font-semibold">
        <span>{etiqueta}</span>
        <span className="hora text-marca-texto">{valor}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-marca-fondo"
      />
    </div>
  );
}

export function SimuladorSimple() {
  const [cocineros, setCocineros] = useState(2);
  const [estudiantes, setEstudiantes] = useState(80);
  const r = simularSimple(cocineros, estudiantes);
  const maximo = Math.max(1, ...r.franjas.map((f) => f.demanda));

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4 sm:p-5">
      <h2 className="titulo text-h3">Probá tu capacidad</h2>
      <p className="mt-2 text-chico text-texto-2">
        Movés los controles y ves cuántos pedidos caben en el receso y cuántos
        esperan.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Control
          etiqueta="Cocineros"
          valor={cocineros}
          min={1}
          max={4}
          onChange={setCocineros}
        />
        <Control
          etiqueta="Estudiantes que quieren comer en el receso"
          valor={estudiantes}
          min={20}
          max={150}
          onChange={setEstudiantes}
        />
      </div>

      <div className="mt-4 flex items-end gap-4">
        <ul className="flex h-32 flex-1 items-end gap-2" aria-label="Pedidos por franja">
          {r.franjas.map((f, i) => (
            <li
              key={i}
              className="flex h-full flex-1 flex-col justify-end"
              aria-label={`Franja ${i + 1}: ${f.caben} caben, ${f.esperan} esperan`}
            >
              <m.div
                className="flex w-full flex-col justify-end overflow-hidden rounded-sm bg-superficie-3"
                animate={{ height: `${(f.demanda / maximo) * 100}%` }}
                transition={{ duration: 0.3 }}
              >
                <div
                  className="bg-texto-3"
                  style={{ height: `${f.demanda ? (f.esperan / f.demanda) * 100 : 0}%` }}
                />
                <div
                  className="bg-marca-fondo"
                  style={{ height: `${f.demanda ? (f.caben / f.demanda) * 100 : 0}%` }}
                />
              </m.div>
              <span className="mt-1 text-center text-chico text-texto-2">
                {i * ANCHO_FRANJA_MIN}
              </span>
            </li>
          ))}
        </ul>
        <MascotaTurno estado={r.estado} size={96} />
      </div>
      <p className="mt-1 text-chico text-texto-3">
        Minutos desde el inicio del receso. Oscuro: caben. Gris: esperan.
      </p>

      <div aria-live="polite" className="mt-4 rounded-md border border-borde bg-superficie-2 p-4">
        <p className="text-cuerpo font-semibold">
          Caben {r.caben} pedidos. Esperan {r.esperan}.
        </p>
        <p className="mt-1 text-chico text-texto-2">{MENSAJE[r.estado]}</p>
      </div>
    </section>
  );
}
