"use client";

/**
 * Trabajo de arranque que necesita el navegador.
 *
 * Existe solo para que `layout.tsx` siga siendo un componente de servidor: es
 * el único que puede registrar el service worker y leer el tema guardado, y no
 * pinta nada.
 */

import { useEffect } from "react";
import { registrarServiceWorker } from "@/lib/sw-cliente";
import { aplicarTema, leerTema } from "@/components/SelectorTema";

export function Arranque() {
  useEffect(() => {
    registrarServiceWorker();

    /*
     * El tema se aplica en el primer efecto, antes de que el usuario navegue a
     * ningún lado. No es la solución perfecta —lo ideal sería un script en
     * línea en el `<head>`, que aplicaría antes del primer pintado— pero la
     * CSP con nonce del ADR-12 lo vuelve caro, y el salto que queda es de un
     * cuadro: el fondo del documento ya sale del token, así que lo que cambia
     * es el contenido, no la pantalla entera.
     */
    aplicarTema(leerTema());
  }, []);

  return null;
}
