"use client";

/**
 * La sesión del navegador, pedida UNA vez y compartida.
 *
 * Sale de la auditoría de red (punto 25). En una visita anónima a la portada se
 * medían siete peticiones a la API, y de esas:
 *
 *   - `/api/auth/sesion` salía **dos veces** —la barra de navegación y la
 *     portada la pedían cada una por su lado—;
 *   - `/api/pedidos` salía **dos veces** y las dos daban **401**;
 *   - `/api/favoritos` salía una vez y también daba **401**.
 *
 * O sea: tres viajes de ida y vuelta cuyo resultado se conocía de antemano, más
 * uno duplicado. El código ya lo sabía —los comentarios decían "sin sesión
 * responde 401 y no hay nada que mostrar"— y se tragaba el error, pero igual
 * pagaba el viaje. En el WiFi del campus eso es latencia real en el primer
 * pintado, y en la consola son tres errores rojos que tapan los de verdad
 * (Lighthouse los marcó en `errors-in-console`).
 *
 * La promesa se cachea a nivel de módulo, no por componente: así N componentes
 * montados a la vez comparten un solo viaje. Se invalida al entrar y al salir.
 */

import { useEffect, useState } from "react";
import { api } from "./cliente";

export interface Sesion {
  autenticado: boolean;
  usuario?: {
    id: string;
    correo: string;
    nombre: string | null;
    rol: string;
    comercioId: string | null;
    condicion?: string;
  };
}

let enVuelo: Promise<Sesion> | null = null;

/** Pide la sesión, o devuelve la que ya se está pidiendo. */
export function sesionCliente(): Promise<Sesion> {
  enVuelo ??= api<Sesion>("/api/auth/sesion").catch(
    // Si la red falla, se asume invitado: es lo que la interfaz sabe mostrar.
    // No se cachea el fallo, para que el siguiente intento vuelva a preguntar.
    (e) => {
      enVuelo = null;
      throw e;
    },
  );
  return enVuelo.catch(() => ({ autenticado: false }));
}

/** Tras entrar o salir, lo cacheado dejó de ser cierto. */
export function olvidarSesion(): void {
  enVuelo = null;
}

/**
 * Corre `fn` solo si hay sesión. Devuelve `null` si no la hay, sin llamar.
 *
 * Es el reemplazo directo de `api(...).catch(() => undefined)`: el mismo
 * resultado para el usuario, sin la petición que se sabía perdida.
 */
export async function siHaySesion<T>(fn: () => Promise<T>): Promise<T | null> {
  const s = await sesionCliente();
  return s.autenticado ? fn() : null;
}

/** La sesión como estado de React. `null` mientras no se sabe. */
export function useSesion(): Sesion | null {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  useEffect(() => {
    let vigente = true;
    sesionCliente().then((s) => {
      if (vigente) setSesion(s);
    });
    return () => {
      vigente = false;
    };
  }, []);
  return sesion;
}
