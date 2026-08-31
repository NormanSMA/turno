/**
 * "Lo más conveniente" sin GPS (§12). En un campus el permiso es incómodo,
 * bajo techo funciona mal y la diferencia son ochenta metros; lo que el
 * estudiante sí sabe es en qué edificio está.
 *
 * Por eso "cerca" compara ZONA, no metros: es una afirmación más débil y por
 * eso honesta. Las zonas salen de la ubicación que declaró cada comercio, no
 * de un catálogo aparte que se desactualizaría.
 */

export interface ComercioUbicado {
  nombre: string;
  slug: string;
  ubicacion: string | null;
  estado: string;
  minutosParaListo: number | null;
}

/**
 * "Edificio A · planta baja" → "Edificio A". La planta sirve para llegar al
 * mostrador, no para elegir comercio.
 */
export function zonaDe(ubicacion: string | null): string | null {
  if (!ubicacion) return null;
  const zona = ubicacion.split(/[·|,–-]/)[0]?.trim();
  return zona ? zona : null;
}

/** Las zonas distintas que existen hoy, en orden alfabético y sin repetir. */
export function zonasDisponibles(
  comercios: readonly ComercioUbicado[],
): string[] {
  const zonas = new Set<string>();
  for (const c of comercios) {
    const z = zonaDe(c.ubicacion);
    if (z) zonas.add(z);
  }
  return [...zonas].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Orden para alguien parado en `zona`:
 *
 *   1. **Puede pedir.** Un cerrado, o abierto sin horas, no es una opción por
 *      cerca que esté.
 *   2. **Está en tu zona.** Es todo lo que el sistema sabe de la distancia.
 *   3. **Está listo antes.**
 */
export function ordenarPorConveniencia(
  comercios: readonly ComercioUbicado[],
  zona: string | null,
): ComercioUbicado[] {
  const puedePedir = (c: ComercioUbicado) =>
    c.estado === "ABIERTO" && c.minutosParaListo !== null;

  return [...comercios].sort((a, b) => {
    const pa = puedePedir(a) ? 0 : 1;
    const pb = puedePedir(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;

    if (zona) {
      const za = zonaDe(a.ubicacion) === zona ? 0 : 1;
      const zb = zonaDe(b.ubicacion) === zona ? 0 : 1;
      if (za !== zb) return za - zb;
    }

    // `Infinity`: nunca gana un desempate y no rompe la comparación.
    const ta = a.minutosParaListo ?? Infinity;
    const tb = b.minutosParaListo ?? Infinity;
    if (ta !== tb) return ta - tb;

    return a.nombre.localeCompare(b.nombre, "es");
  });
}
