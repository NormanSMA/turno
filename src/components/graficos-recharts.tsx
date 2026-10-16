"use client";

/**
 * Dibujo de los gráficos del panel con Recharts (shadcn charts).
 *
 * Solo dibuja: textos, leyendas y cifras viven en graficos.tsx, que carga este
 * módulo de forma diferida. Colores solo por tokens: serie A = --chart-1,
 * serie B = --chart-3, fallas = --color-error.
 */

import { useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const TINTA_TENUE = "var(--color-texto-2)";

function suscribir(avisar: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

function useSinAnimacion() {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

const colorSerie = (serie: "a" | "b"): ChartConfig => ({
  serie: {
    label: serie === "a" ? "A · elección libre" : "B · sugerencia activa",
    color: serie === "a" ? "var(--chart-1)" : "var(--chart-3)",
  },
});

export interface BarrasCargaProps {
  serie: "a" | "b";
  nombre: string;
  horas: string[];
  minutos: number[];
  valores: number[];
  maximo: number;
  promedio: number;
  indicePico: number;
}

export function BarrasCarga({
  serie,
  nombre,
  horas,
  minutos,
  valores,
  maximo,
  promedio,
  indicePico,
}: BarrasCargaProps) {
  const sinAnimacion = useSinAnimacion();
  const datos = horas.map((hora, i) => ({
    hora,
    pct: valores[i] ?? 0,
    min: minutos[i] ?? 0,
  }));

  return (
    <ChartContainer
      config={colorSerie(serie)}
      className="aspect-auto h-24 w-full"
      role="img"
      aria-label={`Distribución de la carga por hora en la condición ${nombre}.`}
    >
      <BarChart
        data={datos}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="12%"
        accessibilityLayer
      >
        <YAxis hide domain={[0, maximo]} />
        <XAxis dataKey="hora" hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(valor, _n, item) => (
                <span className="tabular-nums">
                  {item.payload.hora} · {item.payload.min} min de cocina ·{" "}
                  {Number(valor).toFixed(1)}% de la condición
                </span>
              )}
            />
          }
        />
        {promedio > 0 && (
          <ReferenceLine
            y={promedio}
            stroke={TINTA_TENUE}
            strokeDasharray="3 3"
          />
        )}
        <Bar
          dataKey="pct"
          name="Carga"
          fill="var(--color-serie)"
          radius={[3, 3, 0, 0]}
          isAnimationActive={!sinAnimacion}
        >
          {datos.map((d, i) => (
            // El pico va entero y el resto atenuado.
            <Cell key={d.hora} fillOpacity={i === indicePico ? 1 : 0.6} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export interface LineaCumplimientoProps {
  puntos: { dia: string; pedidos: number; tasa: number }[];
  piso: number;
  meta: number;
  resumen: string;
}

export function LineaCumplimiento({
  puntos,
  piso,
  meta,
  resumen,
}: LineaCumplimientoProps) {
  const sinAnimacion = useSinAnimacion();

  return (
    <ChartContainer
      config={colorSerie("a")}
      className="aspect-auto h-32 w-full"
      role="img"
      aria-label={resumen}
    >
      <AreaChart
        data={puntos}
        margin={{ top: 6, right: 6, bottom: 4, left: 6 }}
        accessibilityLayer
      >
        <defs>
          <linearGradient id="cumpl-area" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-serie)"
              stopOpacity={0.25}
            />
            <stop
              offset="100%"
              stopColor="var(--color-serie)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <XAxis dataKey="dia" hide />
        <YAxis hide domain={[piso, 1]} />
        <ReferenceArea
          y1={piso}
          y2={meta}
          fill="var(--color-error)"
          fillOpacity={0.06}
        />
        <ReferenceLine y={meta} stroke={TINTA_TENUE} strokeDasharray="3 3" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(valor, _n, item) => (
                <span className="tabular-nums">
                  {item.payload.dia} · {(Number(valor) * 100).toFixed(0)}% ·{" "}
                  {item.payload.pedidos} pedidos
                </span>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="tasa"
          name="Cumplimiento"
          stroke="var(--color-serie)"
          strokeWidth={2}
          fill="url(#cumpl-area)"
          isAnimationActive={!sinAnimacion}
          dot={(p) => {
            const { cx, cy, index, payload } = p as {
              cx: number;
              cy: number;
              index: number;
              payload: { tasa: number };
            };
            const falla = payload.tasa < meta;
            const ultimo = index === puntos.length - 1;
            return (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={ultimo ? 4 : falla ? 3.2 : 2.4}
                fill={falla ? "var(--color-error)" : "var(--color-serie)"}
                stroke="var(--color-fondo)"
                strokeWidth={1}
              />
            );
          }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export interface BarrasEmbudoProps {
  canales: { canal: string; activados: number; resto: number; total: number }[];
  maximo: number;
  altura: number;
}

export function BarrasEmbudo({ canales, maximo, altura }: BarrasEmbudoProps) {
  const sinAnimacion = useSinAnimacion();
  const config: ChartConfig = {
    serie: { label: "Llegaron a pedir", color: "var(--chart-1)" },
  };

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: altura }}
      role="img"
      aria-label="Embudo de captación por canal: registros y cuántos llegaron a pedir."
    >
      <BarChart
        data={canales}
        layout="vertical"
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="22%"
        accessibilityLayer
      >
        <XAxis type="number" hide domain={[0, maximo]} />
        <YAxis
          type="category"
          dataKey="canal"
          width={96}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(_v, _n, item) => (
                <span className="tabular-nums">
                  {item.payload.canal} · {item.payload.activados} de{" "}
                  {item.payload.total} llegaron a pedir
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="activados"
          name="Llegaron a pedir"
          stackId="a"
          fill="var(--color-serie)"
          isAnimationActive={!sinAnimacion}
        />
        <Bar
          dataKey="resto"
          name="Se registraron"
          tooltipType="none"
          stackId="a"
          fill="var(--color-serie)"
          fillOpacity={0.22}
          radius={[0, 3, 3, 0]}
          isAnimationActive={!sinAnimacion}
        />
      </BarChart>
    </ChartContainer>
  );
}
