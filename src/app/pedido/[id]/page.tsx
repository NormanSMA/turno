"use client";

/**
 * Seguimiento de un pedido.
 *
 * Es la pantalla que el estudiante deja abierta mientras camina al comercio, así
 * que lo primero es el código de retiro y la hora; el detalle de items va al
 * final.
 *
 * Sondea cada 10 s **solo mientras la pestaña está visible** (ADR-14). Cuando
 * el teléfono se guarda en el bolsillo, el que avisa es Web Push, no esta
 * pantalla: sondear para repintar algo que nadie mira era el grueso del gasto
 * de cómputo del plan gratuito.
 */

import { use, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LineaTiempo, type EventoUI } from "@/components/LineaTiempo";
import { MicroEncuesta } from "@/components/MicroEncuesta";
import { Navegacion } from "@/components/Navegacion";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { apiConFrescura, api, cordobas, ErrorApi } from "@/lib/cliente";
import { avisarListo } from "@/lib/aviso";
import { useSondeo } from "@/lib/sondeo";
import { AvisosPush } from "@/components/AvisosPush";
import { CodigoRetiro } from "@/components/CodigoRetiro";
import { AvisoSinConexion } from "@/components/AvisoSinConexion";
import { AvisoUrgencia } from "@/components/AvisoUrgencia";
import { PedidoRecogido } from "@/components/PedidoRecogido";
import { PedidoCerrado } from "@/components/PedidoCerrado";
import { HojaAyuda } from "@/components/HojaAyuda";
import { Icono } from "@/components/iconos";

interface Detalle {
  id: string;
  codigo: string;
  estado: string;
  cumplimiento: string;
  total: string;
  cargaEstimadaMin: number;
  comercio: string;
  comercioUbicacion: string | null;
  franjaInicio: string;
  comercioSlug: string;
  franjaFin: string;
  creadoEn: string;
  listoEn: string | null;
  retiradoEn: string | null;
  canceladoEn: string | null;
  minutosNoShow: number;
  items: { nombre: string; cantidad: number; subtotal: string }[];
  eventos: EventoUI[];
  cancelacion: { quien: string; motivo: string | null } | null;
}

export default function Pagina({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [p, setP] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [desdeCache, setDesdeCache] = useState(false);

  // El estado anterior vive en una ref y no en estado: dispara un efecto
  // secundario (el aviso), no un repintado. En estado provocaría un render de
  // más en cada sondeo, diez veces por minuto.
  const estadoPrevio = useRef<string | null>(null);

  const cargar = useCallback(() => {
    apiConFrescura<Detalle>(`/api/pedidos/${id}`)
      .then(({ datos, desdeCache: viejo }) => {
        setDesdeCache(viejo);

        // El aviso se dispara en la TRANSICIÓN a LISTO, no cada vez que se ve
        // el estado LISTO. Si no, cada sondeo volvería a avisar lo mismo.
        // Tampoco se avisa desde una copia sin conexión: eso no es noticia
        // nueva, es lo último que se supo.
        if (
          !viejo &&
          estadoPrevio.current !== null &&
          estadoPrevio.current !== "LISTO" &&
          datos.estado === "LISTO"
        ) {
          avisarListo(datos.codigo, datos.comercio);
        }
        estadoPrevio.current = datos.estado;
        setP(datos);
      })
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace(`/entrar?volver=/pedido/${id}`);
          return;
        }
        setError(
          e instanceof ErrorApi
            ? e.message
            : "No pudimos cargar el pedido. Revisá tu conexión.",
        );
      });
  }, [id, router]);

  useSondeo(cargar, 10000);

  async function cancelar() {
    setCancelando(true);
    try {
      await api(`/api/pedidos/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "CANCELADO" }),
      });
      cargar();
    } catch (e) {
      setError(
        e instanceof ErrorApi ? e.message : "No pudimos cancelar el pedido.",
      );
    } finally {
      setCancelando(false);
    }
  }

  /*
   * Un pedido terminado no es "el mismo pedido, apagado": es otra pantalla.
   * Dejar el código enorme y el botón del mostrador sobre algo cerrado hace
   * dudar de si de verdad terminó, que es lo contrario de cerrar (§16).
   */
  const cerrado =
    p !== null && ["RETIRADO", "CANCELADO", "NO_SHOW"].includes(p.estado);
  const [ayuda, setAyuda] = useState(false);

  return (
    <>
      <Navegacion />
      <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-6 sm:px-5 sm:pb-12">
        <Link
          href="/mis-pedidos"
          className="etiqueta inline-flex items-center gap-1 hover:text-tinta"
        >
          ← Mis pedidos
        </Link>

        {/* Datos de la copia local: hay que decirlo, y decir qué significa.
            Mostrar el estado de un pedido sin avisar que puede estar viejo es
            peor que no mostrarlo — el estudiante creería que sigue en cocina
            cuando ya lo llamaron. El código, en cambio, no cambia nunca: por
            eso sigue sirviendo en el mostrador. */}
        {/* Sin red, con un pedido en curso. Lo primero es que la reserva no se
            perdió: vive en el servidor, no en el teléfono (§38). */}
        <AvisoSinConexion contexto="con-pedido" className="mt-4" />

        {desdeCache && p && (
          <p
            role="status"
            className="mt-4 rounded-md border border-maiz bg-brasa-claro px-4 py-2.5 text-sm"
          >
            <span className="font-semibold">Sin conexión.</span> Esto es lo
            último que supimos del pedido. Tu código y tu hora siguen siendo
            válidos en el mostrador.
          </p>
        )}

        {error && (
          <div className="mt-4">
            <ErrorVista texto={error} onReintentar={cargar} />
          </div>
        )}

        {!p && !error && (
          <div className="mt-5 space-y-4" aria-label="Cargando el pedido">
            <Esqueleto className="h-8 w-48" />
            <Esqueleto className="h-24 w-full" />
            <Esqueleto className="h-40 w-full" />
          </div>
        )}

        {p && (
          <AvisosPush
            enCurso={
              !["RETIRADO", "NO_SHOW", "CANCELADO", "LISTO"].includes(p.estado)
            }
          />
        )}

        {p && cerrado && (
          <div className="mt-4">
            <header className="mb-5">
              <h1 className="titulo text-3xl">{p.comercio}</h1>
            </header>

            {p.estado === "RETIRADO" ? (
              <PedidoRecogido
                pedidoId={p.id}
                comercio={p.comercio}
                slug={p.comercioSlug}
                total={p.total}
                minutosAhorrados={p.cargaEstimadaMin}
                retiradoEn={p.retiradoEn}
                items={p.items}
              />
            ) : (
              <PedidoCerrado
                estado={p.estado}
                cancelacion={p.cancelacion}
                slug={p.comercioSlug}
                pedidoId={p.id}
                franjaFin={p.franjaFin}
              />
            )}

            {/* La encuesta va al final y DESPUÉS de la acción: preguntarle a
                alguien qué le pareció antes de dejarlo seguir convierte una
                cortesía en un peaje. */}
            {p.estado === "RETIRADO" && (
              <div className="mt-6">
                <MicroEncuesta pedidoId={p.id} />
              </div>
            )}
          </div>
        )}

        {p && !cerrado && (
          <>
            {/* Mismo orden que la tarjeta: primero dónde voy. Acá el comercio
                ya era el título; le faltaba la ubicación, que es la mitad de
                esa respuesta. */}
            <header className="mb-5 mt-3">
              <h1 className="titulo text-3xl">{p.comercio}</h1>
              {p.comercioUbicacion && (
                <p className="mt-1 flex items-center gap-1.5 text-chico text-texto-2">
                  <span className="shrink-0">
                    <Icono nombre="local" size={14} />
                  </span>
                  {p.comercioUbicacion}
                </p>
              )}
            </header>

            {/* La franja contada en tiempo real. Va ANTES del código porque
                cuando aprieta el tiempo, "cuánto queda" manda sobre el número
                que se muestra en el mostrador. */}
            <div className="mb-4">
              <AvisoUrgencia
                estado={p.estado}
                franjaInicio={p.franjaInicio}
                franjaFin={p.franjaFin}
                listoEn={p.listoEn}
                minutosNoShow={p.minutosNoShow}
                ubicacion={p.comercioUbicacion}
              />
            </div>

            {/* El código es lo que se muestra en el mostrador: número o QR,
                cualquiera de los dos sirve. Va antes que el detalle del pedido
                porque es el dato por el que se abrió esta pantalla. */}
            <div className="entra mb-4">
              <CodigoRetiro
                codigo={p.codigo}
                comercio={p.comercio}
                ubicacion={p.comercioUbicacion}
                listo={p.estado === "LISTO"}
              />
            </div>

            <div className="entra mb-5 flex items-center justify-between gap-4 rounded-md border border-borde bg-superficie px-4 py-3">
              <span className="text-chico text-texto-2">
                Total · se paga al retirar
              </span>
              <span className="hora text-h3 font-bold">
                {cordobas(p.total)}
              </span>
            </div>

            {/*
             * MODO RETIRO (§06).
             *
             * Con el pedido listo, el estudiante ya no necesita ver quince
             * datos: necesita saber a dónde va y qué muestra. La línea de
             * tiempo y el detalle del pedido pasan detrás de un resumen que se
             * abre si de verdad los quiere. El código y el botón del mostrador
             * quedan solos arriba.
             */}
            {p.estado === "LISTO" ? (
              <details className="group mt-2">
                <summary className="presiona flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-md text-chico font-semibold text-texto-2">
                  Ver detalle del pedido
                </summary>
                <div className="mt-3">
                  <LineaTiempo
                    estado={p.estado}
                    eventos={p.eventos}
                    franjaInicio={p.franjaInicio}
                    franjaFin={p.franjaFin}
                    creadoEn={p.creadoEn}
                  />
                </div>
              </details>
            ) : (
            <LineaTiempo
              estado={p.estado}
              eventos={p.eventos}
              franjaInicio={p.franjaInicio}
              franjaFin={p.franjaFin}
              creadoEn={p.creadoEn}
            />

            )}

            <section className="entra entra-2 tarjeta mt-6 p-4">
              <h2 className="etiqueta mb-2">Tu pedido</h2>
              <ul className="space-y-1 text-sm">
                {p.items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-2">
                    <span>
                      <span className="hora font-semibold">{i.cantidad}×</span>{" "}
                      {i.nombre}
                    </span>
                    <span className="hora text-tinta-suave">
                      {cordobas(i.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hora mt-3 border-t border-borde pt-2 text-xs text-tinta-suave">
                Ocupa {p.cargaEstimadaMin} min de cocina
              </p>
            </section>

            {p.estado === "RECIBIDO" && (
              <button
                type="button"
                onClick={cancelar}
                disabled={cancelando}
                className="presiona mt-5 w-full rounded-full border border-alerta px-6 py-3 text-sm font-semibold text-alerta disabled:opacity-40"
              >
                {cancelando ? "Cancelando…" : "Cancelar pedido"}
              </button>
            )}
            {p.estado === "EN_PREPARACION" && (
              <p className="mt-5 rounded-lg bg-papel-alto px-4 py-3 text-xs text-tinta-suave">
                Ya lo están cocinando, así que no se puede cancelar. Si no podés
                llegar, avisá en el mostrador.
              </p>
            )}

            {/* La ayuda vive donde está el problema. Un "centro de ayuda"
                genérico obliga a buscar cuál de veinte artículos habla de tu
                caso; acá el sistema ya sabe de qué pedido se trata (§09). */}
            <button
              type="button"
              onClick={() => setAyuda(true)}
              className="presiona mt-6 flex min-h-12 w-full items-center justify-center gap-2 text-chico font-semibold text-texto-2"
            >
              <Icono nombre="buscar" size={16} />
              ¿Algo no anda con este pedido?
            </button>
          </>
        )}
      </main>

      {p && (
        <HojaAyuda
          abierta={ayuda}
          onCerrar={() => setAyuda(false)}
          estado={p.estado}
          codigo={p.codigo}
          comercio={p.comercio}
          ubicacion={p.comercioUbicacion}
          minutosNoShow={p.minutosNoShow}
        />
      )}
    </>
  );
}
