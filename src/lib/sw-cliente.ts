/**
 * Registro del service worker y borrado de su caché.
 *
 * El registro ocurre **solo en producción**. En desarrollo, Next.js recompila y
 * renombra los módulos constantemente, y un worker que sirve copias viejas
 * convierte cualquier sesión de trabajo en una cacería de fantasmas. Para
 * probar el comportamiento sin conexión hay que compilar:
 *
 *     npm run build && npm start
 */

// El `?v=` cambia en cada compilación. Dos efectos, los dos necesarios:
// el navegador ve una URL distinta y reinstala el worker, y el worker deriva de
// ahí el nombre de sus cachés, así que las de la compilación anterior se borran
// en lugar de servir una página que apunta a fragmentos ya inexistentes.
const RUTA = `/sw.js?v=${process.env.NEXT_PUBLIC_SW_VERSION ?? "0"}`;

export function registrarServiceWorker(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(RUTA).catch(() => {
    // Un worker que no se registra no rompe nada: la app sigue funcionando
    // contra la red. No hay nada que decirle al usuario acá.
  });
}

/**
 * Borra todo lo que el worker guardó.
 *
 * Se llama al cerrar sesión. Los pedidos guardados llevan el código de retiro,
 * el comercio y la hora de quien inició sesión: son datos personales, y el
 * teléfono se presta. Sin este borrado, cerrar sesión dejaría de significar lo
 * que la gente cree que significa.
 */
export async function borrarCacheLocal(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registro = await navigator.serviceWorker.getRegistration();
  registro?.active?.postMessage({ tipo: "borrar-todo" });

  // Además se borra desde la página: si el worker todavía no está activo, el
  // mensaje se pierde, y quedarse sin borrar no es una opción aceptable acá.
  if (typeof caches !== "undefined") {
    const claves = await caches.keys();
    await Promise.all(claves.map((k) => caches.delete(k)));
  }
}
