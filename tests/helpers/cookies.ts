/**
 * Doble de `next/headers` para poder ejecutar los `route.ts` de verdad.
 *
 * Por qué existe: hasta la auditoría técnica, las 419 pruebas llamaban a las
 * funciones de `core/` y nunca a un handler. La razón práctica era esta — los
 * handlers leen la sesión con `cookies()`, que fuera de una petición de Next
 * lanza. Sin este doble no hay forma de probar la capa donde de verdad se
 * aplican `exigirSesion`, `exigirRol` y `exigirComercio`, que es la capa donde
 * se produjeron los bugs del 409, del rate limit y de la cuota de activos.
 *
 * Se usa así, en el propio archivo de prueba:
 *
 *     vi.mock("next/headers", () => import("./helpers/cookies"));
 *
 * La fábrica devuelve ESTE módulo, así que lo que el test escriba con
 * `ponerCookie` es lo mismo que el handler lee.
 */

const almacen = new Map<string, string>();

/** Reemplazo de `cookies()`. Solo implementa lo que los handlers usan. */
export async function cookies() {
  return {
    get(nombre: string) {
      const value = almacen.get(nombre);
      return value === undefined ? undefined : { name: nombre, value };
    },
    set() {},
    delete(nombre: string) {
      almacen.delete(nombre);
    },
  };
}

export function ponerCookie(nombre: string, valor: string) {
  almacen.set(nombre, valor);
}

/** Deja la petición como anónima. */
export function limpiarCookies() {
  almacen.clear();
}
