"use client";

/**
 * Favoritos (§19).
 *
 * Es una pantalla corta a propósito. No intenta ser un segundo catálogo: es la
 * lista de lo que esta persona ya decidió que le gusta, para poder pedirlo sin
 * volver a buscarlo.
 *
 * Lo que la hace útil de verdad es que muestra el ESTADO de hoy. Un favorito
 * que hoy está agotado, o cuyo comercio está cerrado, tiene que verse así acá —
 * de lo contrario la pantalla promete seis opciones y en el mostrador hay tres.
 * Por eso reutiliza la misma tarjeta que el resto del catálogo (§44) en vez de
 * una versión propia y más bonita que mentiría mejor.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navegacion } from "@/components/Navegacion";
import { TarjetaComida, type ProductoTarjeta } from "@/components/TarjetaComida";
import { HojaProducto } from "@/components/HojaProducto";
import { Icono } from "@/components/iconos";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { api, ErrorApi } from "@/lib/cliente";
import { useFavoritos } from "@/lib/favoritos";

export default function Pagina() {
  const [productos, setProductos] = useState<ProductoTarjeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<ProductoTarjeta | null>(null);
  const { marcados, marcar, autenticado } = useFavoritos();

  useEffect(() => {
    let vigente = true;
    api<{ favoritos: ProductoTarjeta[] }>("/api/favoritos")
      .then((r) => vigente && setProductos(r.favoritos))
      .catch((e) => {
        if (!vigente) return;
        setError(
          e instanceof ErrorApi && e.status === 401
            ? "sesion"
            : "No pudimos cargar tus favoritos.",
        );
      });
    return () => {
      vigente = false;
    };
  }, []);

  /*
   * Al desmarcar, la tarjeta sale de la lista.
   *
   * Es lo que el usuario acaba de pedir: si se quedara ahí en gris, tendría que
   * recargar para ver el resultado de su propia acción. La petición ya la hizo
   * `BotonFavorito`; acá solo se refleja.
   */
  function alCambiarFavorito(productoId: string, nuevo: boolean) {
    marcar(productoId, nuevo);
    if (!nuevo) {
      setProductos((antes) => antes?.filter((p) => p.id !== productoId) ?? null);
      setAbierto(null);
    }
  }

  return (
    <>
      <Navegacion />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-5 sm:pb-12">
        <header className="mb-5">
          <h1 className="titulo text-h1">Favoritos</h1>
          <p className="mt-1 text-chico text-texto-2">
            Lo que guardaste, con el estado de hoy.
          </p>
        </header>

        {error === "sesion" && (
          <div className="rounded-lg border border-borde bg-superficie p-6 text-center">
            <p className="text-cuerpo font-semibold">Entrá para ver tus favoritos</p>
            <p className="mt-1 text-chico text-texto-2">
              Los guardamos en tu cuenta, así que están donde entres.
            </p>
            <Link
              href="/entrar?volver=/favoritos"
              className="presiona mt-4 inline-flex min-h-12 items-center rounded-md bg-marca-fondo px-6 text-cuerpo font-semibold text-white"
            >
              Entrar
            </Link>
          </div>
        )}

        {error && error !== "sesion" && (
          <ErrorVista texto={error} onReintentar={() => location.reload()} />
        )}

        {!productos && !error && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
        )}

        {/* Vacío con salida, no un cartel triste. Quien llega acá sin favoritos
            no cometió un error: todavía no marcó nada. */}
        {productos && productos.length === 0 && (
          <div className="rounded-lg border border-borde bg-superficie px-6 py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-superficie-2 text-texto-3">
              <Icono nombre="corazon" size={24} />
            </span>
            <p className="mt-3 text-cuerpo font-semibold">
              Todavía no guardaste nada
            </p>
            <p className="mt-1 text-chico text-texto-2">
              Abrí un producto y tocá el corazón. Lo vas a encontrar acá la
              próxima vez, sin buscarlo.
            </p>
            <Link
              href="/explorar"
              className="presiona mt-4 inline-flex min-h-12 items-center rounded-md bg-marca-fondo px-6 text-cuerpo font-semibold text-white"
            >
              Ver qué hay hoy
            </Link>
          </div>
        )}

        {productos && productos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {productos.map((p, i) => (
              <li key={p.id}>
                <TarjetaComida
                  p={p}
                  onAbrir={() => setAbierto(p)}
                  prioridad={i < 3}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <HojaProducto
        producto={abierto}
        onCerrar={() => setAbierto(null)}
        favorito={abierto ? marcados.has(abierto.id) : false}
        onFavorito={alCambiarFavorito}
        autenticado={autenticado}
      />
    </>
  );
}
