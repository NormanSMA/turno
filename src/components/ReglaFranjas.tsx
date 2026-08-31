"use client";

/**
 * La regla de franjas — el elemento central de la interfaz del estudiante.
 *
 * Cada columna es una ventana de retiro. La altura del relleno es la carga de
 * cocina ya comprometida sobre la capacidad efectiva α·C(f). Las franjas sin
 * espacio se muestran TACHADAS, no se ocultan: que el estudiante vea por qué no
 * puede tener las 12:00 es exactamente lo que produce el aplanamiento — si
 * simplemente desaparecieran, la interfaz escondería el mecanismo que se está
 * evaluando.
 *
 * Condición B: la franja sugerida se marca con una viñeta y el texto "mejor
 * hora". Condición A: no hay marca. Ese es el único delta visual entre las dos
 * ramas del experimento; todo lo demás es idéntico a propósito, para que la
 * diferencia medida se pueda atribuir a la sugerencia y no al diseño.
 */

import { fechaCorta, horaCorta, type OpcionFranjaUI } from "@/lib/cliente";
import { minutosHasta, useAhora } from "@/lib/reloj";
import { Icono } from "@/components/iconos";
import { admite, margenDe, TEXTO_MARGEN } from "@/core/cabe";

function dia(iso: string): string {
  return new Date(iso).toDateString();
}

function esHoy(iso: string): boolean {
  return dia(iso) === new Date().toDateString();
}

export type FranjaVisible = OpcionFranjaUI;

interface Props {
  opciones: FranjaVisible[];
  elegidaId: string | null;
  cargaPedidoMin: number;
  mostrarSugerencia: boolean;
  onElegir: (franjaId: string) => void;
}

export function ReglaFranjas({
  opciones,
  elegidaId,
  cargaPedidoMin,
  mostrarSugerencia,
  onElegir,
}: Props) {
  // El reloj corre para las dos cosas que dependen de él: qué franja está por
  // cerrar y cuánto falta. Sin esto, una hora desaparecía entre dos recargas y
  // parecía un error del sistema (§03, §04, §06).
  const ahora = useAhora(20_000);

  if (opciones.length === 0) {
    return (
      <p className="rounded-lg border border-borde bg-papel-alto p-4 text-sm text-tinta-suave">
        No quedan horas de retiro disponibles para este pedido hoy. Probá con
        menos productos o volvé mañana.
      </p>
    );
  }

  return (
    <div>
      <div className="regla" role="radiogroup" aria-label="Hora de retiro">
        {opciones.map((o, i) => {
          // La fecha se muestra solo cuando CAMBIA el día, como en un horario:
          // repetirla en cada columna es ruido que compite con la hora.
          const abreDia =
            !esHoy(o.inicio) && (i === 0 || dia(opciones[i - 1].inicio) !== dia(o.inicio));
          // La misma condición que aplica el motor: holgura Y a tiempo. Antes
          // acá solo se miraba la holgura, así que una hora ya vencida se
          // dibujaba como disponible.
          const cabe = admite(o, cargaPedidoMin, ahora);
          const usado = Math.max(
            0,
            o.capacidadEfectivaMin - o.holguraMin,
          );
          const pct =
            o.capacidadEfectivaMin > 0
              ? Math.min(100, (usado / o.capacidadEfectivaMin) * 100)
              : 100;
          const elegida = o.franjaId === elegidaId;
          const sugerida = mostrarSugerencia && o.sugerida;
          /*
           * Minutos hasta que esta hora deje de poder reservarse.
           *
           * Solo se avisa por debajo de diez: una cuenta regresiva en las ocho
           * columnas convertiría la elección en una carrera. El aviso existe
           * para explicar por qué algo va a desaparecer, no para apurar.
           */
          const cierraEnMin = minutosHasta(o.cierraEn, ahora);
          const porCerrar = cabe && cierraEnMin >= 0 && cierraEnMin <= 10;

          return (
            <button
              key={o.franjaId}
              type="button"
              role="radio"
              aria-checked={elegida}
              disabled={!cabe}
              data-elegida={elegida}
              data-llena={!cabe}
              className="franja"
              onClick={() => onElegir(o.franjaId)}
            >
              <span
                className="franja-relleno"
                style={{ height: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex h-full flex-col justify-between">
                <span className="etiqueta block">
                  {/* El día solo se muestra cuando NO es hoy: en el caso normal
                      sería ruido, y en el caso de mañana es imprescindible. */}
                  {sugerida
                    ? "• mejor hora"
                    : abreDia
                      ? fechaCorta(o.inicio)
                      : cabe
                        ? ""
                        : "llena"}
                </span>
                <span>
                  <span className="franja-hora hora block text-base font-semibold">
                    {horaCorta(o.inicio)}
                  </span>
                  {/* §51 y fase 7.3: el resultado, no el modelo. "18 min
                      libres" obliga al estudiante a compararlo contra la carga
                      de su pedido; "llegás con margen" ya es la conclusión. El
                      detalle técnico sigue disponible en la hoja de ayuda. */}
                  <span className="block text-[0.6875rem] text-tinta-suave">
                    {TEXTO_MARGEN[margenDe(o, cargaPedidoMin, ahora)]}
                  </span>
                  {porCerrar && (
                    <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[0.625rem] font-semibold text-aviso">
                      <Icono nombre="reloj" size={10} />
                      {cierraEnMin <= 0
                        ? "cierra ya"
                        : `cierra en ${cierraEnMin}`}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {/*
       * §51: se explica el RESULTADO, no el modelo.
       *
       * El estudiante no necesita saber qué es α ni C(f). Necesita entender por
       * qué una hora está llena y otra no, y cuánto pesa lo que pidió — que es
       * lo único sobre lo que puede actuar.
       */}
      <p className="mt-2 text-xs text-tinta-suave">
        La barra de cada hora es la cocina ya comprometida. Tu pedido ocupa{" "}
        <strong className="hora font-semibold text-tinta">
          {cargaPedidoMin} min
        </strong>{" "}
        de cocina.
      </p>
      {opciones.some(
        (o) =>
          o.holguraMin >= cargaPedidoMin &&
          minutosHasta(o.cierraEn, ahora) <= 10 &&
          minutosHasta(o.cierraEn, ahora) >= 0,
      ) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-aviso">
          <Icono nombre="reloj" size={13} />
          Las horas marcadas cierran pronto: después de esa hora ya no da el
          tiempo de cocina para tenerlo listo.
        </p>
      )}
    </div>
  );
}
