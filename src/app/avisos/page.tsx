"use client";

/**
 * Bandeja de avisos — "¿qué pasó con lo mío?"
 *
 * Es la versión dentro de la aplicación de los mismos hechos que se entregan
 * por push y por correo. Existe porque los otros dos canales se pierden: el
 * push depende de un permiso que mucha gente no da, y el correo institucional
 * casi nadie lo mira desde el teléfono. La bandeja es el canal que siempre
 * está, y el único que se puede consultar después.
 *
 * Se marcan todos como leídos al ABRIR, no al tocar cada uno. La bandeja no es
 * una lista de tareas: si el estudiante llegó hasta acá, ya vio lo que había.
 * Obligarlo a tocar seis avisos para apagar un punto rojo es trabajo inventado.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navegacion } from "@/components/Navegacion";
import { Icono, type NombreIcono } from "@/components/iconos";
import { ErrorVista, Esqueleto, Vacio } from "@/components/estados-ui";
import { api, ErrorApi, horaCorta, fechaCorta } from "@/lib/cliente";

interface Aviso {
  id: string;
  tipo: string;
  creadaEn: string;
  leida: boolean;
  pedidoId: string;
  codigo: string;
  estadoPedido: string;
  comercio: string;
  franjaInicio: string;
}

/**
 * Cada tipo de aviso tiene nombre humano, icono y color semántico (§26).
 *
 * El texto habla como una persona: "Ya podés pasar a retirarlo" y no
 * "PEDIDO_LISTO". El nombre técnico es del sistema, no del estudiante.
 */
const FORMA: Record<
  string,
  { titulo: string; icono: NombreIcono; color: string }
> = {
  PEDIDO_LISTO: {
    titulo: "Tu pedido está listo",
    icono: "campana",
    color: "text-exito",
  },
  PEDIDO_CONFIRMADO: {
    titulo: "Tu turno quedó reservado",
    icono: "reloj",
    color: "text-marca-texto",
  },
};

function cuerpoDe(a: Aviso): string {
  if (a.tipo === "PEDIDO_LISTO") {
    return `${a.comercio} · mostrá el código ${a.codigo} en el mostrador`;
  }
  return `${a.comercio} · retirás a las ${horaCorta(a.franjaInicio)}`;
}

/** "hace 3 min" es más útil que una hora exacta para algo reciente. */
function cuando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return fechaCorta(iso);
}

export default function Pagina() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    // El error se limpia en la respuesta y no acá: un `setState` síncrono
    // dentro del efecto encadena renders sin necesidad, y lo único que aporta
    // es borrar el error un instante antes.
    api<{ avisos: Aviso[] }>("/api/avisos")
      .then((r) => {
        setError(null);
        setAvisos(r.avisos);
        // Marcar leídos DESPUÉS de tener la lista: así el render conserva el
        // resaltado de los que estaban sin leer, que es lo que el estudiante
        // vino a ver. Apagarlos antes de mostrarlos borraría la información.
        if (r.avisos.some((a) => !a.leida)) {
          api("/api/avisos", { method: "PATCH" }).catch(() => undefined);
        }
      })
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace("/entrar?volver=/avisos");
          return;
        }
        setError("No pudimos cargar tus avisos.");
      });
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <Navegacion />
      <main
        id="contenido"
        className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:px-5 sm:pb-12"
      >
        <header className="mb-5 flex items-center gap-3">
          <Link
            href="/perfil"
            aria-label="Volver al perfil"
            className="toque -ml-1 flex h-9 w-9 items-center justify-center rounded-full text-texto-2 hover:bg-superficie-2"
          >
            <Icono nombre="atras" size={20} />
          </Link>
          <h1 className="titulo min-w-0 flex-1 text-h1">Avisos</h1>

          {/* El control de qué se recibe vive a un toque de donde se recibe.
              Enterrarlo en ajustes es cómo alguien termina bloqueando las
              notificaciones del navegador en vez de apagar la que le molesta. */}
          <Link
            href="/avisos/preferencias"
            aria-label="Preferencias de aviso"
            className="toque flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-texto-2 hover:bg-superficie-2"
          >
            <Icono nombre="ajustes" size={20} />
          </Link>
        </header>

        {error && <ErrorVista texto={error} onReintentar={cargar} />}

        {!avisos && !error && (
          <ul className="space-y-2">
            <li>
              <Esqueleto className="h-20 w-full" />
            </li>
            <li>
              <Esqueleto className="h-20 w-full" />
            </li>
          </ul>
        )}

        {avisos?.length === 0 && (
          <Vacio
            titulo="Todavía no hay avisos"
            texto="Acá te vamos a contar cuando tu pedido quede reservado y cuando esté listo para retirar."
            accion={{ href: "/explorar", texto: "Explorar comercios" }}
          />
        )}

        {avisos && avisos.length > 0 && (
          <ul className="space-y-2">
            {avisos.map((a) => {
              const f = FORMA[a.tipo] ?? {
                titulo: "Novedad de tu pedido",
                icono: "pedidos" as NombreIcono,
                color: "text-texto-2",
              };
              return (
                <li key={a.id}>
                  <Link
                    href={`/pedido/${a.pedidoId}`}
                    className={`presiona flex gap-3 rounded-md border p-4 transition-colors hover:bg-superficie-2 ${
                      a.leida
                        ? "border-borde bg-superficie"
                        : "border-marca-texto/30 bg-marca-suave"
                    }`}
                  >
                    <span className={`mt-0.5 ${f.color}`}>
                      <Icono nombre={f.icono} size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-cuerpo font-semibold">
                          {f.titulo}
                        </span>
                        <span className="hora shrink-0 text-caption text-texto-2">
                          {cuando(a.creadaEn)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-chico text-texto-2">
                        {cuerpoDe(a)}
                      </span>
                    </span>
                    {!a.leida && (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-marca-fondo"
                        aria-label="Sin leer"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
