"use client";

/**
 * Los favoritos del usuario, cargados una vez por pantalla.
 *
 * Vive en un hook y no dentro de cada tarjeta porque la alternativa es peor: si
 * cada producto preguntara por su cuenta si está marcado, una cuadrícula de
 * doce tarjetas dispararía doce peticiones para pintar doce corazones.
 *
 * Devuelve un `Set` de ids y no la lista completa: lo único que las pantallas
 * de catálogo necesitan saber es "¿este está marcado?", y esa pregunta se
 * responde en tiempo constante.
 */

import { useCallback, useEffect, useState } from "react";
import { siHaySesion } from "./sesion-cliente";
import { api } from "@/lib/cliente";

interface Favorito {
  id: string;
}

export function useFavoritos(): {
  marcados: Set<string>;
  marcar: (productoId: string, nuevo: boolean) => void;
  /** `false` hasta que el servidor confirme que hay sesión. */
  autenticado: boolean;
} {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  /*
   * La respuesta de favoritos ya dice si hay sesión: 200 con lista, o 401.
   * Aprovecharla evita una segunda petición a `/api/auth/sesion` en cada
   * pantalla de catálogo solo para saber si el corazón debe pedir entrar.
   */
  const [autenticado, setAutenticado] = useState(false);

  useEffect(() => {
    let vigente = true;
    siHaySesion(() => api<{ favoritos: Favorito[] }>("/api/favoritos"))
      .then((r) => {
        if (!vigente || !r) return;
        setMarcados(new Set(r.favoritos.map((f) => f.id)));
        setAutenticado(true);
      })
      // Sin sesión responde 401. Un invitado sin favoritos no es un error: el
      // botón sigue ahí y lo lleva a entrar cuando lo toca.
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  // Solo mueve el estado local. La petición la hace `BotonFavorito`, que es
  // quien sabe revertir si el servidor la rechaza.
  const marcar = useCallback((productoId: string, nuevo: boolean) => {
    setMarcados((antes) => {
      const copia = new Set(antes);
      if (nuevo) copia.add(productoId);
      else copia.delete(productoId);
      return copia;
    });
  }, []);

  return { marcados, marcar, autenticado };
}
