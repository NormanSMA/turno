"use client";

/**
 * Mis pedidos. Es la pantalla que el estudiante abre caminando hacia el
 * comercio, así que lo primero y más grande es el CÓDIGO y la HORA: los dos
 * datos que necesita en el mostrador.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navegacion } from "@/components/Navegacion";
import {
  ErrorVista,
  EsqueletoPedido,
  EtiquetaEstado,
  Vacio,
} from "@/components/estados-ui";
import { PedidoActivo } from "@/components/PedidoActivo";
import { Icono } from "@/components/iconos";
import { api, cordobas, ErrorApi, horaCorta } from "@/lib/cliente";
import { useSondeo } from "@/lib/sondeo";
import { agruparPorDia, resumirHistorial } from "@/core/historial";
import { useAhora } from "@/lib/reloj";

interface PedidoUI {
  id: string;
  codigo: string;
  estado: string;
  cumplimiento: string;
  total: string;
  creadoEn: string;
  listoEn: string | null;
  comercio: string;
  comercioSlug: string;
  franjaInicio: string;
  franjaFin: string;
  items: {
    productoId: string;
    nombre: string;
    cantidad: number;
    subtotal: string;
  }[];
}

const TERMINALES = ["RETIRADO", "NO_SHOW", "CANCELADO"];

export default function Pagina() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<PedidoUI[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<{ pedidos: PedidoUI[] }>("/api/pedidos")
      .then((r) => setPedidos(r.pedidos))
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace("/entrar?volver=/mis-pedidos");
          return;
        }
        setError("No pudimos cargar tus pedidos. Revisá tu conexión.");
      });
  }, [router]);

  // Sondeo suave y solo con la pestaña a la vista (ADR-14): el estado lo
  // cambia la cocina, y con el teléfono guardado avisa Web Push.
  useSondeo(cargar, 15000);

  // Dos listas, no una: un pedido en curso y uno de la semana pasada no se
  // miran por la misma razón ni con la misma urgencia.
  const enCurso = (pedidos ?? []).filter((p) => !TERMINALES.includes(p.estado));
  const cerrados = (pedidos ?? []).filter((p) => TERMINALES.includes(p.estado));

  /*
   * Filtro y paginado del historial.
   *
   * `mostrar` arranca en 10 y no en "todo": alguien con cuatro meses de uso
   * tiene cien tarjetas, y pintarlas todas hace que la pantalla tarde en
   * responder justo cuando se abre para buscar UNA cosa.
   */
  const [soloRetirados, setSoloRetirados] = useState(false);
  const [mostrar, setMostrar] = useState(10);
  // Un reloj lento: "Hoy" y "Ayer" solo cambian a medianoche.
  const ahora = useAhora(60_000);

  const resumen = resumirHistorial(cerrados);
  const filtrados = soloRetirados
    ? cerrados.filter((p) => p.estado === "RETIRADO")
    : cerrados;
  const grupos = agruparPorDia(filtrados.slice(0, mostrar), ahora);


  return (
    <>
    <Navegacion />
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:px-5 sm:pb-12">
      <header className="mb-6">
        <h1 className="titulo text-h1">Mis pedidos</h1>
      </header>

      {error && (
        <div className="mb-4">
          <ErrorVista texto={error} onReintentar={cargar} />
        </div>
      )}

      {pedidos === null && !error && (
        <ul className="grid gap-3 sm:grid-cols-2">
          <EsqueletoPedido />
          <EsqueletoPedido />
        </ul>
      )}

      {pedidos?.length === 0 && (
        <Vacio
          titulo="Todavía no pediste nada"
          texto="Elegí tu comida, reservá una hora y retirá sin hacer fila."
          accion={{ href: "/", texto: "Ver el menú" }}
        />
      )}

      {/* EN CURSO — lo que está pasando ahora va primero y en grande. Era lo
          que faltaba: el historial se veía, pero el pedido de este receso
          quedaba mezclado entre pedidos de la semana pasada. */}
      {enCurso.length > 0 && (
        <section className="mb-8">
          <h2 className="etiqueta mb-2">
            {enCurso.length === 1 ? "Tu pedido de ahora" : "Tus pedidos de ahora"}
          </h2>
          <div className="grid gap-3">
            {enCurso.map((p) => (
              <PedidoActivo key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      {cerrados.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="etiqueta">Historial</h2>

            {/* El filtro solo aparece cuando hay algo que filtrar. Un control
                que no cambia nada enseña a ignorar los controles. */}
            {resumen.sinRetirar > 0 && (
              <button
                type="button"
                role="switch"
                aria-checked={soloRetirados}
                onClick={() => setSoloRetirados((v) => !v)}
                className={`presiona min-h-10 rounded-full border px-4 text-chico font-semibold ${
                  soloRetirados
                    ? "border-marca-texto bg-marca-suave text-marca-texto"
                    : "border-borde"
                }`}
              >
                Solo los que retiré
              </button>
            )}
          </div>

          {/*
           * Resumen antes de la lista.
           *
           * Responde de un vistazo lo que antes exigía contar tarjetas a mano.
           * Los que no se retiraron se muestran sin dramatizarlos: es un dato
           * útil —dice si conviene pedir a otra hora— y no un reproche.
           */}
          <div className="mb-4 grid grid-cols-3 overflow-hidden rounded-lg border border-borde bg-superficie">
            <p className="border-r border-borde px-3 py-3 text-center">
              <span className="hora block text-h3 font-bold">
                {resumen.retirados}
              </span>
              <span className="block text-caption text-texto-2">retirados</span>
            </p>
            <p className="border-r border-borde px-3 py-3 text-center">
              <span className="hora block text-h3 font-bold">
                {cordobas(resumen.gastado)}
              </span>
              <span className="block text-caption text-texto-2">gastado</span>
            </p>
            <p className="px-3 py-3 text-center">
              <span className="hora block text-h3 font-bold">
                {resumen.sinRetirar}
              </span>
              <span className="block text-caption text-texto-2">
                sin retirar
              </span>
            </p>
          </div>

          {/* Agrupado por día: alguien busca "lo que pedí ayer", nunca "lo de
              la tercera semana de marzo". */}
          {grupos.map((g) => (
            <div key={g.clave} className="mb-6">
              <h3 className="etiqueta mb-2 !text-caption">{g.titulo}</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.pedidos.map((base) => {
                  const p = cerrados.find((x) => x.id === base.id)!;
                  return (
                    <li key={p.id} className="entra tarjeta p-4">
                      <Link
                        href={`/pedido/${p.id}`}
                        className="block"
                        aria-label={`Ver el pedido ${p.codigo}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <EtiquetaEstado estado={p.estado} />
                            <p className="mt-2 truncate text-sm text-tinta-suave">
                              {p.comercio}
                            </p>
                            <p className="hora text-2xl font-semibold">
                              {horaCorta(p.franjaInicio)}–
                              {horaCorta(p.franjaFin)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="etiqueta">Código</p>
                            <p className="hora text-2xl font-bold tracking-wider">
                              {p.codigo}
                            </p>
                          </div>
                        </div>
                      </Link>

                      <ul className="mt-3 border-t border-borde pt-3 text-sm">
                        {p.items.map((i, n) => (
                          <li key={n} className="flex justify-between gap-2">
                            <span className="min-w-0 truncate">
                              {i.cantidad}× {i.nombre}
                            </span>
                            <span className="hora shrink-0">
                              {cordobas(i.subtotal)}
                            </span>
                          </li>
                        ))}
                        <li className="mt-1 flex justify-between border-t border-borde pt-1 font-semibold">
                          <span>Total</span>
                          <span className="hora">{cordobas(p.total)}</span>
                        </li>
                      </ul>

                      {/* Un pedido cerrado ya no tiene seguimiento que mirar;
                          lo que sí tiene es el valor de repetirse. En un
                          campus el mismo estudiante pide casi siempre lo
                          mismo, y recorrer el menú entero cada vez es
                          fricción pura. */}
                      <Link
                        href={`/c/${p.comercioSlug}?repetir=${p.id}`}
                        className="presiona mt-3 flex min-h-11 items-center justify-center gap-2 rounded-md border border-borde px-4 text-chico font-semibold"
                      >
                        <Icono nombre="repetir" size={16} />
                        Pedir lo mismo
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {filtrados.length > mostrar && (
            <button
              type="button"
              onClick={() => setMostrar((n) => n + 20)}
              className="presiona flex min-h-12 w-full items-center justify-center rounded-md border border-borde px-4 text-cuerpo font-semibold"
            >
              Ver más ({filtrados.length - mostrar} restantes)
            </button>
          )}

          {/* El filtro puede vaciar la lista. Decirlo evita que parezca que el
              historial se perdió. */}
          {filtrados.length === 0 && (
            <p className="rounded-md border border-borde bg-superficie px-4 py-3 text-chico text-texto-2">
              Ninguno de tus pedidos cerrados llegó a retirarse. Quitá el filtro
              para verlos todos.
            </p>
          )}
        </section>
      )}

    </main>
    </>
  );
}
