"use client";

/**
 * Navegación global (Design System §21, §22).
 *
 * En móvil vive abajo, al alcance del pulgar, porque el estudiante la usa
 * caminando con una mano. Nunca detrás de un botón de hamburguesa: la
 * navegación principal tiene que estar a un toque, siempre visible.
 *
 * En escritorio pasa a barra superior. No es la misma navegación agrandada —
 * el perfil se va a la derecha y la marca aparece— pero conserva el mismo
 * lenguaje: mismos iconos, mismos radios, mismo color activo.
 *
 * Las cuatro secciones del estudiante responden a las cuatro preguntas del
 * producto: qué hay hoy, qué más hay, en qué va lo mío, y qué necesito
 * gestionar. Los destinos de operación (cocina, panel) se agregan según el ROL
 * que devuelve el servidor: ocultar un enlace no es autorización —la ruta sigue
 * protegida— pero mostrar enlaces que van a dar 403 es una interfaz que miente.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LogotipoTurno } from "@/components/marca";
import { Icono, type NombreIcono } from "@/components/iconos";
import { sesionCliente } from "@/lib/sesion-cliente";
import { api } from "@/lib/cliente";

interface Sesion {
  autenticado: boolean;
  usuario?: { correo: string; rol: string; comercioId: string | null };
}

interface Destino {
  href: string;
  texto: string;
  icono: NombreIcono;
  /** Número que se pinta sobre el icono. 0 no dibuja nada. */
  contador?: number;
  /** Qué cuenta ese número, para el lector de pantalla. */
  etiquetaContador?: string;
}

/**
 * Avisos sin leer, para el punto rojo.
 *
 * Se consulta al montar y cuando la pestaña vuelve a estar visible — no en un
 * intervalo. Un contador que sondea cada pocos segundos en TODAS las pantallas
 * sería exactamente el gasto que el ADR-14 acaba de quitar.
 */
function useSinLeer(activo: boolean): number {
  const [n, setN] = useState(0);

  const cargar = useCallback(() => {
    if (!activo) return;
    api<{ sinLeer: number }>("/api/avisos")
      .then((r) => setN(r.sinLeer))
      .catch(() => undefined);
  }, [activo]);

  useEffect(() => {
    cargar();
    const alVolver = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  return n;
}

/**
 * Cuántos pedidos tengo en curso.
 *
 * El mismo contador que el de avisos, sobre "Pedidos": si hay algo cocinándose
 * la barra tiene que decirlo sin que haya que entrar a mirar. Es la regla de
 * los tres segundos aplicada a la navegación.
 *
 * Se recarga al volver a la pestaña, no en un intervalo: el número cambia
 * cuando la cocina avanza el pedido, y para eso ya está el sondeo de la
 * pantalla del pedido y el push. Un temporizador acá sería gasto de cómputo
 * repetido en todas las pantallas (ADR-14).
 */
function useEnCurso(activo: boolean): number {
  const [n, setN] = useState(0);

  const cargar = useCallback(() => {
    if (!activo) return;
    api<{ pedidos: { estado: string }[] }>("/api/pedidos")
      .then((r) =>
        setN(
          r.pedidos.filter(
            (p) => !["RETIRADO", "NO_SHOW", "CANCELADO"].includes(p.estado),
          ).length,
        ),
      )
      // Sin sesión responde 401 y no hay contador que mostrar.
      .catch(() => undefined);
  }, [activo]);

  useEffect(() => {
    cargar();
    const alVolver = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  return n;
}

function Punto({ n, etiqueta }: { n: number; etiqueta: string }) {
  if (n <= 0) return null;
  return (
    <span
      className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-marca-fondo px-1 text-[0.625rem] font-bold leading-none text-white"
      aria-label={`${n} ${etiqueta}`}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

export function Navegacion({ comercioSlug }: { comercioSlug?: string }) {
  const ruta = usePathname();
  const [sesion, setSesion] = useState<Sesion | null>(null);

  useEffect(() => {
    sesionCliente()
      .then((s) => setSesion(s as Sesion))
      .catch(() => setSesion({ autenticado: false }));
  }, [ruta]);

  const rol = sesion?.usuario?.rol;
  const dentro = sesion?.autenticado === true;
  const sinLeer = useSinLeer(dentro);
  const enCurso = useEnCurso(dentro);

  const destinos: Destino[] = [
    { href: "/", texto: "Inicio", icono: "inicio" },
    { href: "/explorar", texto: "Explorar", icono: "explorar" },
  ];

  if (dentro) {
    destinos.push({
      href: "/mis-pedidos",
      texto: "Pedidos",
      icono: "pedidos",
      contador: enCurso,
      etiquetaContador: "en curso",
    });
    /*
     * Los avisos tienen destino propio, con su campana.
     *
     * Estaban dos niveles adentro —Perfil › Bandeja de avisos— y el contador
     * de no leídos se pintaba sobre el icono de Perfil, que es un sitio que no
     * los anuncia: el número decía que había algo pendiente sin decir qué, y
     * llegar hasta ellos costaba dos toques que nadie da.
     *
     * **Solo para quien no opera.** La barra de móvil pinta `slice(0, 5)`, así
     * que un destino más se lo quita a alguien: con este dentro, un comercio
     * perdería "Cocina" de la barra inferior — la pantalla que usa todo el día
     * y desde el teléfono. Quien opera sigue llegando a los avisos por Perfil,
     * que para ese rol es donde ya los busca.
     */
    const opera = rol === "COMERCIO" || rol === "ADMIN";

    if (!opera) {
      destinos.push({
        href: "/avisos",
        texto: "Avisos",
        icono: "campana",
        contador: sinLeer,
        etiquetaContador: "sin leer",
      });
    }

    destinos.push({
      href: "/perfil",
      texto: "Perfil",
      icono: "perfil",
      // El contador se queda en Perfil solo para quien no tiene la campana;
      // con las dos cosas, el mismo número aparecería dos veces en la barra.
      contador: opera ? sinLeer : 0,
      etiquetaContador: "sin leer",
    });
  } else {
    // Sin sesión no se ofrece "Pedidos": llevaría a una pantalla que exige
    // entrar. El invitado ve el menú completo y decide cuándo identificarse.
    destinos.push({ href: "/entrar", texto: "Entrar", icono: "entrar" });
  }

  // La cocina es del comercio. El administrador no la ve porque no la opera:
  // separación de funciones entre quien produce el dato y quien lo mide.
  if (rol === "COMERCIO") {
    destinos.push({
      href: comercioSlug ? `/cocina/${comercioSlug}` : "/cocina",
      texto: "Cocina",
      icono: "fuego",
    });
    destinos.push({
      href: comercioSlug ? `/comercio/${comercioSlug}` : "/cocina",
      texto: "Comercio",
      icono: "ajustes",
    });
  }
  if (rol === "ADMIN") {
    destinos.push({ href: "/panel", texto: "Panel", icono: "grafico" });
  }

  const activo = (href: string) =>
    href === "/" ? ruta === "/" : ruta.startsWith(href);

  return (
    <>
      {/* ---------------------------------------------- Escritorio: arriba
          Tres columnas, no una fila apretada a la izquierda: la marca ancla el
          borde, la navegación queda CENTRADA de verdad y la cuenta va al otro
          extremo. Con `1fr auto 1fr` el centro no se corre aunque el correo de
          la derecha sea largo — que es lo que pasaba con `ml-auto`. */}
      <header className="sticky top-0 z-20 hidden border-b border-borde bg-fondo/85 backdrop-blur sm:block">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-3">
          <Link
            href="/"
            aria-label="TURNO, inicio"
            className="presiona justify-self-start"
          >
            <LogotipoTurno size={30} />
          </Link>

          <nav
            aria-label="Principal"
            className="flex items-center gap-1 rounded-full border border-borde bg-superficie p-1"
          >
            {/* En escritorio "Entrar" no va en el centro: ya está como acción
                a la derecha. En móvil sí, porque ahí no hay columna derecha y
                el invitado necesita la puerta a la vista. */}
            {destinos
              .filter((d) => d.href !== "/entrar")
              .map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  aria-current={activo(d.href) ? "page" : undefined}
                  className={`presiona relative flex items-center gap-2 rounded-full px-4 py-2 text-chico font-semibold transition-colors ${
                    activo(d.href)
                      ? "bg-marca-fondo text-white"
                      : "text-texto-2 hover:bg-superficie-2 hover:text-texto"
                  }`}
                >
                  {/* El icono acompaña al texto en escritorio: la barra inferior
                    de móvil usa los mismos, y repetirlos es lo que hace que las
                    dos se lean como la misma navegación. */}
                  <Icono nombre={d.icono} size={17} />
                  {d.texto}
                  {d.contador ? (
                    <Punto n={d.contador} etiqueta={d.etiquetaContador ?? ""} />
                  ) : null}
                </Link>
              ))}
          </nav>

          <div className="justify-self-end">
            {dentro ? (
              <Link
                href="/perfil"
                className="presiona flex items-center gap-2 rounded-full border border-borde bg-superficie py-1.5 pl-1.5 pr-3.5 text-chico font-medium text-texto-2 hover:text-texto"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-superficie-2 text-texto">
                  <Icono nombre="perfil" size={15} />
                </span>
                <span className="hidden max-w-44 truncate lg:block">
                  {sesion?.usuario?.correo}
                </span>
              </Link>
            ) : (
              <Link
                href="/entrar"
                className="presiona rounded-full bg-marca-fondo px-4 py-2 text-chico font-semibold text-white"
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* -------------------------------------------------- Móvil: abajo
          La MISMA píldora del escritorio, flotando sobre el contenido en vez
          de una barra plana pegada al borde. Que las dos usen el mismo
          contenedor, el mismo radio y el mismo activo relleno es lo que hace
          que se lean como una sola navegación y no como dos diseños.

          El texto aparece SOLO en el destino activo. Cinco etiquetas completas
          no entran en 375 px sin romperse o achicarse hasta lo ilegible, y el
          nombre del lugar donde YA estás es el único que no aporta — pero
          quitarlo de todos dejaría una fila de iconos sin ancla. Mostrarlo solo
          en el activo resuelve las dos cosas: cabe, y el estado se lee de un
          vistazo. */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden"
      >
        {/* `min-w-0` en la fila y en cada destino: sin eso los cinco elementos
            suman su ancho natural y a 320 px la barra mide 355, lo que hace
            que TODA la página se mueva de lado. Lo encontró la matriz
            responsive de la auditoría (punto 19). Con `flex-1 basis-0` cada
            destino cede espacio en vez de empujar. */}
        <ul className="mx-auto flex w-full min-w-0 max-w-md items-center gap-1 rounded-full border border-borde bg-superficie/95 p-1.5 shadow-md backdrop-blur">
          {destinos.slice(0, 5).map((d) => {
            const aqui = activo(d.href);
            return (
              <li
                key={d.href}
                className={aqui ? "min-w-0 flex-[2] basis-0" : "min-w-0 flex-1 basis-0"}
              >
                <Link
                  href={d.href}
                  aria-current={aqui ? "page" : undefined}
                  /* min-h-11 es la zona táctil de 44 px del §14. Un destino de
                     navegación más chico se falla al caminar. */
                  className={`toque flex min-h-11 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2 text-chico font-semibold transition-colors sm:px-3 ${
                    aqui ? "bg-marca-fondo text-white" : "text-texto-2"
                  }`}
                >
                  <span className="relative">
                    <Icono nombre={d.icono} size={21} />
                    {d.contador ? (
                    <Punto n={d.contador} etiqueta={d.etiquetaContador ?? ""} />
                  ) : null}
                  </span>
                  {/* El nombre siempre está para el lector de pantalla; lo que
                      se oculta es solo el texto visible. */}
                  <span className={aqui ? "truncate" : "sr-only"}>
                    {d.texto}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
