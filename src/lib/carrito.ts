"use client";

/**
 * Guardar y recuperar el carrito en el navegador (§41).
 *
 * La decisión de si un carrito guardado todavía sirve vive en
 * `core/carrito-guardado`, que es puro y probado. Acá solo está el acceso al
 * almacenamiento, con dos detalles que importan:
 *
 *   1. **`localStorage` y no `sessionStorage`.** Esa es la diferencia entre
 *      "sobrevive a cambiar de pantalla" y "sobrevive a cerrar la pestaña y
 *      volver en el receso", que es el caso real de un campus.
 *   2. **Todo envuelto en try/catch.** En modo privado el acceso puede lanzar,
 *      y perder un carrito es molesto mientras que romper el menú entero deja
 *      a alguien sin poder pedir.
 */

import {
  decidirRestauracion,
  type CarritoGuardado,
  type Decision,
} from "@/core/carrito-guardado";

const CLAVE = "turno_carrito";

export function guardarCarrito(
  slug: string,
  carrito: Record<string, number>,
): void {
  try {
    const unidades = Object.values(carrito).reduce((a, n) => a + n, 0);
    // Un carrito vacío se borra en vez de guardarse: dejar el rastro haría que
    // la próxima visita ofrezca restaurar la nada.
    if (unidades === 0) {
      localStorage.removeItem(CLAVE);
      return;
    }
    const dato: CarritoGuardado = { slug, carrito, guardadoEn: Date.now() };
    localStorage.setItem(CLAVE, JSON.stringify(dato));
  } catch {
    // Sin almacenamiento el carrito simplemente no sobrevive a la navegación.
    // Molesta; no rompe nada.
  }
}

export function olvidarCarrito(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Ídem.
  }
}

/** Qué hacer con lo guardado al abrir el menú de `slug`. */
export function leerCarritoGuardado(slug: string): Decision {
  let dato: CarritoGuardado | null = null;
  try {
    const crudo = localStorage.getItem(CLAVE);
    dato = crudo ? (JSON.parse(crudo) as CarritoGuardado) : null;
  } catch {
    // Dato corrupto o almacenamiento bloqueado: se trata como si no hubiera
    // nada. Nunca vale interrumpir a alguien por esto.
    dato = null;
  }

  const decision = decidirRestauracion(dato, slug, Date.now());
  if (decision.tipo === "VENCIDO") olvidarCarrito();
  return decision;
}
