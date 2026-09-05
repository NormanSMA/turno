"use client";

/**
 * Informe de ventas — "¿cómo me fue?".
 *
 * El panel del administrador mide el experimento; esto mide el negocio. El
 * dueño de un comedor no quiere saber si la condición B distribuye mejor la
 * carga: quiere saber cuánto vendió, a qué hora se le llena la cocina y qué le
 * piden.
 *
 * El orden responde a eso: primero la plata, después cuándo, después qué. Y
 * arriba de todo el período, porque un número sin período no significa nada.
 */

import { useCallback, useEffect, useState } from "react";
import { Icono } from "@/components/iconos";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { NumeroAnimado } from "@/components/NumeroAnimado";
import { api, cordobas, ErrorApi } from "@/lib/cliente";
import type {
  Cifras,
  Ocupacion,
  ProductoVendido,
  PuntoHora,
} from "@/core/informe";

interface Datos {
  comercio: { nombre: string; slug: string };
  dias: number;
  cifras: Cifras;
  porHora: PuntoHora[];
  productos: ProductoVendido[];
  ocupacion: Ocupacion;
}

const PERIODOS = [
  { dias: 1, texto: "Hoy" },
  { dias: 7, texto: "7 días" },
  { dias: 30, texto: "30 días" },
];

/**
 * El informe se dibuja DENTRO del panel, sin cabecera ni `<main>` propios.
 *
 * Era una pantalla aparte y eso obligaba al comercio a salir del panel para
 * mirar sus ventas y volver para actuar sobre ellas — dos sitios para una sola
 * conversación ("¿cómo voy?" / "entonces cambio esto"). Ahora es una pestaña
 * más, y por eso este componente no monta contenedor: el panel ya pone el suyo,
 * y dos anidados descuadran los anchos.
 */
export function Informe({ slug }: { slug: string }) {
  const [dias, setDias] = useState(7);
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Datos>(`/api/comercios/${slug}/informe?dias=${dias}`)
      .then((r) => {
        setError(null);
        setD(r);
      })
      .catch((e) => {
        setError(
          e instanceof ErrorApi && e.status === 403
            ? "Esta cuenta no puede ver el informe de este comercio."
            : "No pudimos cargar el informe.",
        );
      });
  }, [slug, dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>

        {/* Período. Va arriba porque un número sin período no significa nada. */}
        <div
          role="radiogroup"
          aria-label="Período del informe"
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
            <Esqueleto className="h-52 w-full" />
            <Esqueleto className="h-40 w-full" />
          </div>
        )}

        {d && (
          <>
            {/* ------------------------------------------------ La plata */}
            <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cifra
                titulo="Vendido"
                valor={cordobas(d.cifras.ventas)}
                nota={`${d.cifras.vendidos} pedidos retirados`}
                destacado
              />
              <Cifra
                titulo="Ticket promedio"
                valor={
                  d.cifras.ticketPromedio === null
                    ? "—"
                    : cordobas(d.cifras.ticketPromedio)
                }
                nota="por pedido"
              />
              <Cifra
                titulo="Cumplimiento"
                valor={
                  d.cifras.cumplimiento === null
                    ? "—"
                    : `${Math.round(d.cifras.cumplimiento * 100)}%`
                }
                nota="entregados a tiempo"
                tono={
                  d.cifras.cumplimiento !== null && d.cifras.cumplimiento < 0.85
                    ? "malo"
                    : "bueno"
                }
              />
              <Cifra
                titulo="No retirados"
                valor={String(d.cifras.noShows)}
                nota="cocinados y no recogidos"
                tono={d.cifras.noShows > 0 ? "malo" : undefined}
              />
            </section>

            {/* Lo que el número de ventas SÍ y NO incluye. Decirlo evita que el
                comercio compare este total contra su caja y desconfíe. */}
            <p className="mb-8 flex items-start gap-2 rounded-md bg-superficie-2 px-3.5 py-3 text-caption text-texto-2">
              <span className="mt-0.5 shrink-0">
                <Icono nombre="reloj" size={15} />
              </span>
              <span>
                Solo cuenta como venta un pedido <strong>retirado</strong>. Los
                {" "}
                {d.cifras.noShows} no retirados y los {d.cifras.cancelados}{" "}
                cancelados quedan fuera del total, porque no entraron a tu caja.
              </span>
            </p>

            {/* ------------------------------------------------ El cuándo */}
            <section className="mb-8">
              <h2 className="etiqueta mb-1">A qué hora vendés</h2>
              <p className="mb-4 text-chico text-texto-2">
                Por hora de retiro, que es cuando tenés que tener gente en la
                cocina — no cuando el estudiante pidió desde el pasillo.
              </p>
              <BarrasPorHora puntos={d.porHora} />
            </section>

            {/* ----------------------------------------------- La cocina */}
            <section className="mb-8">
              <h2 className="etiqueta mb-1">Cuán llena corrió tu cocina</h2>
              <p className="mb-4 text-chico text-texto-2">
                Sobre la capacidad que declaraste. Sirve para decidir si abrir
                más horas o sumar a alguien.
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                <Cifra
                  titulo="Ocupación media"
                  valor={
                    d.ocupacion.promedio === null
                      ? "—"
                      : `${Math.round(d.ocupacion.promedio * 100)}%`
                  }
                  nota="de las franjas con pedidos"
                />
                <Cifra
                  titulo="Hora más cargada"
                  valor={d.ocupacion.pico?.hora ?? "—"}
                  nota={
                    d.ocupacion.pico
                      ? `${Math.round(d.ocupacion.pico.ocupacion * 100)}% de tu capacidad`
                      : "sin pedidos todavía"
                  }
                  tono={
                    d.ocupacion.pico && d.ocupacion.pico.ocupacion > 0.9
                      ? "malo"
                      : undefined
                  }
                />
                <Cifra
                  titulo="Franjas vacías"
                  valor={String(d.ocupacion.vacias)}
                  nota="abiertas y sin un solo pedido"
                />
              </div>

              {d.ocupacion.promedio !== null && d.ocupacion.promedio < 0.4 && (
                <p className="mt-3 rounded-md bg-atencion-suave px-3.5 py-3 text-chico">
                  Estás usando menos de la mitad de tu cocina. Podés abrir
                  menos franjas y concentrar los pedidos, o promocionar las
                  horas flojas.
                </p>
              )}
              {d.ocupacion.promedio !== null && d.ocupacion.promedio > 0.85 && (
                <p className="mt-3 rounded-md bg-atencion-suave px-3.5 py-3 text-chico">
                  Tu cocina corre casi al tope. Si querés vender más, hace falta
                  capacidad — no más franjas sobre la misma gente.
                </p>
              )}
            </section>

            {/* -------------------------------------------------- El qué */}
            <section>
              <h2 className="etiqueta mb-1">Qué te compran</h2>
              <p className="mb-4 text-chico text-texto-2">
                Ordenado por plata, no por unidades: lo más pedido no siempre es
                lo que sostiene el mes.
              </p>

              {d.productos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-borde bg-superficie p-6 text-chico text-texto-2">
                  Todavía no hay pedidos retirados en este período.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-borde bg-superficie">
                  <table className="w-full text-chico">
                    <thead>
                      <tr className="border-b border-borde bg-superficie-2 text-caption text-texto-2">
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Producto
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          Unidades
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          Vendido
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.productos.map((p) => (
                        <tr
                          key={p.nombre}
                          className="border-b border-borde last:border-b-0"
                        >
                          <td className="px-4 py-2.5 font-medium">
                            {p.nombre}
                          </td>
                          <td className="hora px-4 py-2.5 text-right text-texto-2">
                            {p.unidades}
                          </td>
                          <td className="hora px-4 py-2.5 text-right font-semibold">
                            {cordobas(p.ventas)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
    </div>
  );
}

function Cifra({
  titulo,
  valor,
  nota,
  destacado,
  tono,
}: {
  titulo: string;
  valor: string;
  nota: string;
  destacado?: boolean;
  tono?: "bueno" | "malo";
}) {
  const color =
    tono === "malo"
      ? "text-error"
      : tono === "bueno"
        ? "text-exito"
        : destacado
          ? "text-marca-texto"
          : "text-texto";

  return (
    <div className="rounded-lg border border-borde bg-superficie p-4">
      <p className="etiqueta">{titulo}</p>
      <p className={`hora mt-1.5 text-h2 font-bold leading-none ${color}`}>
        {valor}
      </p>
      <p className="mt-1.5 text-caption leading-tight text-texto-2">{nota}</p>
    </div>
  );
}

/**
 * Ventas por hora.
 *
 * Barras y no una línea: cada hora es una franja discreta, no una serie
 * continua. Una línea sugeriría que entre las 09:00 y las 10:00 hay valores
 * intermedios, y no los hay.
 */
function BarrasPorHora({ puntos }: { puntos: PuntoHora[] }) {
  if (puntos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borde bg-superficie p-6 text-chico text-texto-2">
        Todavía no hay pedidos retirados en este período.
      </p>
    );
  }

  const techo = Math.max(...puntos.map((p) => p.ventas));
  const total = puntos.reduce((n, p) => n + p.ventas, 0);
  const mejor = puntos.reduce((a, b) => (b.ventas > a.ventas ? b : a));

  return (
    <div className="rounded-lg border border-borde bg-superficie p-4">
      <ul className="space-y-2">
        {puntos.map((p) => {
          const alto = p === mejor;
          return (
            <li key={p.hora} className="flex items-center gap-3">
              <span className="hora w-14 shrink-0 text-caption text-texto-2">
                {p.hora}
              </span>
              <span className="h-7 flex-1 overflow-hidden rounded-sm bg-superficie-2">
                <span
                  className="block h-full rounded-sm transition-[width] duration-500"
                  style={{
                    width: `${techo > 0 ? (p.ventas / techo) * 100 : 0}%`,
                    background: alto
                      ? "var(--color-marca)"
                      : "var(--color-texto-3)",
                  }}
                />
              </span>
              <span className="hora w-24 shrink-0 text-right text-caption">
                <span className="font-semibold">{cordobas(p.ventas)}</span>
                <span className="block text-texto-2">
                  {p.pedidos} {p.pedidos === 1 ? "pedido" : "pedidos"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-borde pt-3 text-chico text-texto-2">
        Tu mejor hora es de{" "}
        <span className="hora font-bold text-texto">{mejor.hora}</span> con{" "}
        <NumeroAnimado
          valor={total > 0 ? Math.round((mejor.ventas / total) * 100) : 0}
          sufijo="%"
          className="hora font-bold text-texto"
        />{" "}
        de lo que vendés en el período.
      </p>
    </div>
  );
}
