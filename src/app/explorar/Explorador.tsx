"use client";

/**
 * Buscador y cuadrícula de productos (Design System §18, §20, §29, §39).
 *
 * La búsqueda tolera errores humanos: ignora acentos y mayúsculas, y busca en
 * el nombre, la descripción y el comercio. Un estudiante que escribe "cafe" o
 * "CAFÉ" o "biblio" tiene que encontrar lo mismo. Exigir escritura exacta es
 * una forma de decirle que el problema es suyo.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFavoritos } from "@/lib/favoritos";
import {
  ordenarPorConveniencia,
  zonaDe,
  zonasDisponibles,
} from "@/core/cercania";
import { guardarZona, useZona } from "@/lib/zona";
import { HojaProducto } from "@/components/HojaProducto";
import {
  TarjetaComida,
  type ProductoTarjeta,
} from "@/components/TarjetaComida";
import { Icono } from "@/components/iconos";
import { Vacio } from "@/components/estados-ui";

/*
 * La tarjeta y la hoja de detalle comparten forma con el resto del producto
 * (§44): un solo tipo, un solo componente, usados igual en Inicio, Explorar y
 * recomendados. Cinco versiones casi iguales es como se pierde la consistencia
 * sin que nadie tome la decisión de perderla.
 */
export type ProductoUI = ProductoTarjeta;

/** Sin acentos y en minúsculas: la comparación no debe castigar la ortografía. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function Explorador({
  productos,
  comercios,
}: {
  productos: ProductoUI[];
  comercios: {
    nombre: string;
    slug: string;
    ubicacion: string | null;
    estado: string;
    /** Minutos hasta que estaría listo si pedís ahora. `null` si no hay hora. */
    minutosParaListo: number | null;
  }[];
}) {
  const { marcados, marcar, autenticado } = useFavoritos();
  // §12: dónde está parada la persona. Es del dispositivo, no de la cuenta:
  // cambia varias veces al día y no tiene sentido sincronizarla.
  const zona = useZona();
  const zonas = zonasDisponibles(comercios);
  const ordenados = ordenarPorConveniencia(comercios, zona);
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  // Cuál está abierto en la hoja. `null` = ninguna.
  const [abierto, setAbierto] = useState<ProductoUI | null>(null);

  const visibles = useMemo(() => {
    const q = normalizar(texto.trim());
    return productos.filter((p) => {
      if (filtro !== "todos" && p.comercioSlug !== filtro) return false;
      if (!q) return true;
      return normalizar(
        `${p.nombre} ${p.descripcion ?? ""} ${p.comercio}`,
      ).includes(q);
    });
  }, [productos, texto, filtro]);

  return (
    <main
      id="contenido"
      className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-5 sm:pb-12"
    >
      <h1 className="titulo mb-4 text-h1">¿Qué querés comer?</h1>

      {/* ------------------------------------------------------- Búsqueda */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-3">
          <Icono nombre="buscar" size={20} />
        </span>
        <label className="sr-only" htmlFor="buscar">
          Buscar comida
        </label>
        <input
          id="buscar"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar comida o comercio"
          className="w-full rounded-md border border-borde bg-superficie py-3.5 pl-11 pr-4 text-cuerpo outline-none transition-colors focus:border-marca-texto"
        />
      </div>

      {/*
       * ------------------------------------------------------ Dónde estás
       *
       * §12. Sin GPS a propósito: en un campus el permiso es incómodo, bajo
       * techo funciona mal, y la diferencia entre dos comercios son ochenta
       * metros. Lo que el estudiante sí sabe es en qué edificio está.
       *
       * Por eso la lista dice "primero los de tu zona" y no "el más cercano":
       * es una afirmación más débil y por eso verdadera. El sistema no sabe
       * dónde estás parado, sabe qué le dijiste.
       */}
      {zonas.length > 1 && (
        <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max items-center gap-2">
            <span className="shrink-0 text-caption text-texto-2">
              ¿Dónde estás?
            </span>
            <button
              type="button"
              onClick={() => guardarZona(null)}
              aria-pressed={zona === null}
              className={`shrink-0 rounded-full border px-4 py-2 text-chico font-semibold ${
                zona === null
                  ? "border-marca-texto bg-marca-suave text-marca-texto"
                  : "border-borde bg-superficie text-texto-2"
              }`}
            >
              Cualquier lado
            </button>
            {zonas.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => guardarZona(z)}
                aria-pressed={zona === z}
                className={`shrink-0 rounded-full border px-4 py-2 text-chico font-semibold ${
                  zona === z
                    ? "border-marca-texto bg-marca-suave text-marca-texto"
                    : "border-borde bg-superficie text-texto-2"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
       * ------------------------------------------------- Estado por comercio
       *
       * §11. La fila de nombres no decía nada: había que entrar a cada uno
       * para descubrir que estaba cerrado o que la próxima hora libre era
       * dentro de hora y media.
       *
       * El color nunca va solo (§46): cada estado trae también su palabra, y
       * el tiempo va escrito. Un punto verde sin texto no lo lee quien no
       * distingue verde de rojo, y tampoco quien mira de reojo.
       */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ordenados.map((c) => {
          const abierto = c.estado === "ABIERTO";
          const pausado = c.estado === "PAUSADO";
          return (
            <li key={c.slug}>
              <Link
                href={`/c/${c.slug}`}
                className="presiona flex items-center gap-3 rounded-md border border-borde bg-superficie px-4 py-3"
              >
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    abierto ? "bg-exito" : pausado ? "bg-aviso" : "bg-texto-3"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-cuerpo font-semibold">
                    {c.nombre}
                  </span>
                  {/* `data-volatil`: el ETA cambia con el reloj y el orden de
                      la lista cambia con la carga de cocina. La regresión
                      visual lo enmascara — sin esto la captura falla cada vez
                      que alguien pide algo, y una suite que falla siempre se
                      termina desactivando. */}
                  <span
                    data-volatil
                    className="block truncate text-caption text-texto-2"
                  >
                    {abierto
                      ? c.minutosParaListo !== null
                        ? `Listo en ~${c.minutosParaListo} min`
                        : "Sin horas libres hoy"
                      : pausado
                        ? "Pausado por ahora"
                        : "Cerrado"}
                    {c.ubicacion ? ` · ${c.ubicacion}` : ""}
                    {/* Se dice cuál está en tu zona en vez de solo reordenar:
                        un orden que cambia sin explicación se lee como que la
                        lista se movió sola. */}
                    {zona && zonaDe(c.ubicacion) === zona ? " · acá cerca" : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ---------------------------------------------------------- Chips
          Scroll horizontal en móvil, sin envolver a tres líneas. */}
      <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          <Chip
            activo={filtro === "todos"}
            onClick={() => setFiltro("todos")}
            texto="Todos"
          />
          {comercios.map((c) => (
            <Chip
              key={c.slug}
              activo={filtro === c.slug}
              onClick={() => setFiltro(c.slug)}
              texto={c.nombre}
            />
          ))}
        </div>
      </div>

      <p className="mt-4 text-chico text-texto-2" aria-live="polite">
        {visibles.length}{" "}
        {visibles.length === 1 ? "resultado" : "resultados"}
      </p>

      {visibles.length === 0 ? (
        <div className="mt-4">
          {/*
           * Dos vacíos distintos, no uno.
           *
           * "Probá con otro nombre" solo tiene sentido si la persona escribió
           * un nombre. Cuando el catálogo está vacío —un despliegue nuevo, un
           * comercio que todavía no cargó su menú— ese texto le echa la culpa
           * de algo que no hizo y la manda a buscar lo que no existe.
           *
           * El estado se distingue por lo que el usuario hizo, no por lo que
           * se ve: si no hay búsqueda ni filtro, no buscó nada.
           */}
          {productos.length === 0 ? (
            <Vacio
              titulo="Todavía no hay nada cargado"
              texto="Los comercios están preparando su menú. Volvé en un rato."
            />
          ) : (
            <Vacio
              titulo="No encontramos nada con eso"
              texto="Probá con otro nombre, o mirá todo el catálogo sin filtrar."
              accion={{ href: "/explorar", texto: "Ver todo" }}
            />
          )}
        </div>
      ) : (
        /* 1 columna en móvil, 2 en tablet, 3 en escritorio (§39). */
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((p, i) => (
            <li key={p.id}>
              <TarjetaComida
                p={p}
                prioridad={i < 3}
                onAbrir={() => setAbierto(p)}
              />
            </li>
          ))}
        </ul>
      )}

      <HojaProducto
        producto={abierto}
        onCerrar={() => setAbierto(null)}
        favorito={abierto ? marcados.has(abierto.id) : false}
        onFavorito={marcar}
        autenticado={autenticado}
      />
    </main>
  );
}

function Chip({
  texto,
  activo,
  onClick,
}: {
  texto: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`shrink-0 rounded-full border px-4 py-2 text-chico font-semibold transition-colors ${
        activo
          ? "border-marca-texto bg-marca-fondo text-white"
          : "border-borde bg-superficie text-texto-2 hover:text-texto"
      }`}
    >
      {texto}
    </button>
  );
}
