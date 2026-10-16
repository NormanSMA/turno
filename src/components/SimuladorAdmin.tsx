"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { Icono } from "@/components/iconos";
import { TarjetaDato } from "@/components/panel-ui";
import {
  CONTROLES_BASE,
  LIMITES,
  compararEscenarios,
  evaluar,
  normalizarControles,
  type ControlesAdmin,
} from "@/core/simulador-admin";

const ESPERA_MS = 300;

function Control({
  etiqueta,
  valor,
  texto,
  min,
  max,
  paso,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  texto: string;
  min: number;
  max: number;
  paso: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-chico font-semibold">
        <span>{etiqueta}</span>
        <span className="hora text-marca-texto">{texto}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-marca-fondo"
      />
    </div>
  );
}

const ATAJO =
  "presiona inline-flex items-center rounded-full border border-borde bg-superficie px-4 py-2 text-chico font-semibold";

export function SimuladorAdmin() {
  const [c, setC] = useState<ControlesAdmin>(CONTROLES_BASE);
  // El simulador corre días completos: se calcula con espera, no en cada arrastre.
  const [aplicado, setAplicado] = useState<ControlesAdmin>(CONTROLES_BASE);
  const base = useMemo(() => evaluar(CONTROLES_BASE), []);
  const nuevo = useMemo(() => evaluar(aplicado), [aplicado]);
  const dif = compararEscenarios(base, nuevo);
  const calculando = aplicado !== c;

  useEffect(() => {
    const t = setTimeout(() => setAplicado(c), ESPERA_MS);
    return () => clearTimeout(t);
  }, [c]);

  const cambiar = (parte: Partial<ControlesAdmin>) =>
    setC((prev) => normalizarControles({ ...prev, ...parte }));

  return (
    <>
      <header className="mb-5">
        <Link
          href="/panel"
          className="etiqueta inline-flex items-center gap-1.5 hover:text-texto"
        >
          <Icono nombre="atras" size={14} />
          Panel del piloto
        </Link>
        <h1 className="titulo mt-2 text-h1">Simulador de capacidad</h1>
        <p className="text-chico text-texto-2">
          Movés un control y ves cuántos pedidos más o menos atiende el comercio en un día.
        </p>
      </header>

      <section
        aria-label="Controles"
        className="rounded-lg border border-borde bg-superficie p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Control
            etiqueta="Cocineros"
            valor={c.cocineros}
            texto={`${c.cocineros} (${c.cocineros * 10} min-cocina por franja)`}
            min={LIMITES.cocineros.min}
            max={LIMITES.cocineros.max}
            paso={1}
            onChange={(v) => cambiar({ cocineros: v })}
          />
          <Control
            etiqueta="Demanda del día"
            valor={c.demanda}
            texto={`${c.demanda} pedidos`}
            min={LIMITES.demanda.min}
            max={LIMITES.demanda.max}
            paso={5}
            onChange={(v) => cambiar({ demanda: v })}
          />
          <Control
            etiqueta="Factor de seguridad α"
            valor={c.alfa}
            texto={c.alfa.toFixed(2).replace(".", ",")}
            min={LIMITES.alfa.min}
            max={LIMITES.alfa.max}
            paso={0.05}
            onChange={(v) => cambiar({ alfa: v })}
          />
          <Control
            etiqueta="Preparación por pedido"
            valor={c.minutosPreparacion}
            texto={`${c.minutosPreparacion} min`}
            min={LIMITES.minutosPreparacion.min}
            max={LIMITES.minutosPreparacion.max}
            paso={1}
            onChange={(v) => cambiar({ minutosPreparacion: v })}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={ATAJO}
            onClick={() => cambiar({ cocineros: c.cocineros + 1 })}
          >
            +1 cocinero
          </button>
          <button
            type="button"
            className={ATAJO}
            onClick={() => cambiar({ demanda: Math.round(c.demanda * 1.3) })}
          >
            +30 % de demanda
          </button>
          <button type="button" className={ATAJO} onClick={() => setC(CONTROLES_BASE)}>
            Volver al escenario base
          </button>
        </div>
      </section>

      <section
        aria-live="polite"
        aria-busy={calculando}
        className="mt-6"
      >
        <h2 className="etiqueta mb-2">Resultado por día</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TarjetaDato
            titulo="Atendidos"
            valor={String(Math.round(nuevo.atendidos))}
            nota={`base ${Math.round(base.atendidos)}`}
            tono="bueno"
          />
          <TarjetaDato
            titulo="Rechazados"
            valor={String(Math.round(nuevo.rechazados))}
            nota={`base ${Math.round(base.rechazados)}`}
            tono={nuevo.rechazados > base.rechazados ? "malo" : "neutro"}
          />
          <TarjetaDato
            titulo="Cumplimiento"
            valor={`${Math.round(nuevo.cumplimiento * 100)}%`}
            nota={`base ${Math.round(base.cumplimiento * 100)}%`}
            tono={nuevo.cumplimiento >= 0.9 ? "bueno" : "malo"}
            barra={{ pct: nuevo.cumplimiento * 100, umbral: 90 }}
          />
          <TarjetaDato
            titulo="Volumen sostenible"
            valor={
              nuevo.volumenSostenible === null
                ? "--"
                : String(Math.round(nuevo.volumenSostenible))
            }
            nota="pedidos con 90 % de cumplimiento"
          />
        </div>

        <div className="mt-3 rounded-md border border-borde bg-superficie-2 p-4">
          {dif.frases.map((f) => (
            <p key={f} className="text-cuerpo font-semibold">
              {f}
            </p>
          ))}
          <p className="mt-1 text-chico text-texto-2">
            Comparado con el escenario base de {CONTROLES_BASE.cocineros} cocineros y{" "}
            {CONTROLES_BASE.demanda} pedidos.
          </p>
        </div>
      </section>
    </>
  );
}
