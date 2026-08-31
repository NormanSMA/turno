import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP con nonce por respuesta.
 *
 * **El error que corrige.** La CSP era una cabecera fija con `script-src
 * 'self'`, pero Next emite scripts EN LÍNEA para hidratar: el navegador los
 * bloqueaba y la compilación de producción llegaba muerta —HTML visible, nada
 * interactivo—. No se detectaba porque en desarrollo se añadía
 * `'unsafe-inline'`, así que la única compilación que importaba era la que no
 * se probaba.
 *
 * **Nonce y no `'unsafe-inline'`**, que es justo el permiso que un XSS
 * necesita: el navegador ejecuta los scripts que llevan el número de esta
 * respuesta y ninguno más. `'strict-dynamic'` deja que esos carguen sus
 * fragmentos sin enumerar cada archivo.
 *
 * **En el middleware** porque un valor por respuesta no sale de un archivo
 * estático. El precio es perder el caché estático de estas páginas; los assets
 * de `/_next/static` no pasan por acá (ver `matcher`).
 */

/** Base64 de 16 bytes aleatorios: suficiente e imposible de adivinar. */
function generarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(peticion: NextRequest) {
  const nonce = generarNonce();
  const desarrollo = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    // Sin esto, un XSS podría reescribir el destino de un formulario de acceso.
    "form-action 'self'",
    // Nadie puede meter TURNO en un iframe: corta el secuestro de clics sobre
    // los botones de la cocina, que cambian el estado de un pedido real.
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https://images.unsplash.com",
    "font-src 'self' data:",
    /*
     * Estilos, en dos directivas y no en una.
     *
     * ZAP marcó el `'unsafe-inline'` de acá (regla 10055, riesgo medio) y al
     * mirarlo apareció que la concesión era más ancha de lo necesario. El HTML
     * servido **no tiene una sola etiqueta `<style>`**: el CSS viaja por `<link>`
     * a `/_next/static`. Lo único que necesita el permiso son los **atributos**
     * `style="..."` que los componentes calculan (anchos de barra, gradientes).
     *
     * Y `style-src` no distingue esos dos casos: `style-src-elem` gobierna las
     * etiquetas y `style-src-attr` los atributos. Declarando `style-src-elem
     * 'self'` se cierra la puerta que sí importa —un `<style>` inyectado, que es
     * el que permite exfiltrar datos con selectores de atributo y
     * `background-image`— sin tocar los atributos, que siguen haciendo falta.
     *
     * `style-src` se deja **igual que antes** a propósito: es el respaldo que
     * usan los navegadores que no entienden `-elem`, Safari entre ellos. Con
     * esto, un navegador moderno queda más ajustado y Safari queda exactamente
     * como estaba. Cambiar `style-src` a `'self'` habría roto el iPhone, que es
     * donde Norman prueba — y el hallazgo 10 ya enseñó lo que cuesta una CSP
     * que solo se rompe en producción.
     */
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self'",
    desarrollo
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "connect-src 'self'",
    // El service worker solo puede venir de este origen.
    "worker-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Next lee el nonce de la CSP que viene en las cabeceras de PETICIÓN y se lo
  // pone a sus propios scripts. Por eso hay que reenviarla hacia adentro,
  // además de devolverla al navegador.
  const cabeceras = new Headers(peticion.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set("Content-Security-Policy", csp);

  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set("Content-Security-Policy", csp);
  return respuesta;
}

export const config = {
  matcher: [
    /*
     * Todo menos lo que no necesita CSP y sí necesita cachearse:
     * los assets con hash, las imágenes optimizadas y el favicon.
     *
     * `/sw.js` queda fuera a propósito: el service worker se sirve como un
     * archivo estático y no ejecuta scripts en línea.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
