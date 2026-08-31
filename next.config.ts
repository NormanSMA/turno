import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad.
 *
 * Se declaran acá y no en el proveedor para que viajen con el código: si el
 * despliegue cambia de Vercel a otra cosa, las protecciones no se quedan atrás.
 *
 * La CSP **ya no está acá**: necesita un nonce distinto por respuesta y eso no
 * cabe en un archivo de configuración estático. Vive en `src/middleware.ts`,
 * que explica el porqué y el error que corrige. Declararla en los dos lados
 * sería peor que en uno: dos cabeceras CSP se intersecan, y la fija sin nonce
 * volvería a bloquear los scripts de Next.
 */

const nextConfig: NextConfig = {
  env: {
    /**
     * Sello de compilación para el service worker.
     *
     * Se evalúa una vez, al compilar, y queda incrustado en el paquete del
     * cliente. Es lo que hace que un despliegue nuevo invalide las páginas
     * guardadas por el worker: sin esto, quien vuelve a abrir la aplicación
     * después de un despliegue recibe una página vieja que pide fragmentos de
     * JavaScript que el servidor ya borró.
     */
    NEXT_PUBLIC_SW_VERSION: String(Date.now()),
  },

  images: {
    // Las fotos del piloto se sirven desde Unsplash mientras el comercio no
    // suba las suyas. Se declara el host explícitamente: `next/image` no carga
    // dominios arbitrarios, y eso también evita que un producto con una URL
    // manipulada convierta el catálogo en un vector de contenido externo.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  // El encabezado revela la versión del framework sin darle nada al usuario.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // El piloto no usa cámara, micrófono ni ubicación. Declararlo cierra
            // la puerta antes de que a alguien se le ocurra abrirla.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            // Dos años y subdominios: exigido para HTTPS estricto de verdad.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            /*
             * Corta la referencia `window.opener` entre esta pestaña y quien la
             * abrió. Sin esto, una página que abra TURNO en una ventana nueva
             * conserva un manejador para navegarla — el "tabnabbing" al revés:
             * el usuario deja la pestaña, vuelve, y está en una copia del
             * acceso. Importa acá porque el enlace mágico llega por correo y se
             * abre justamente desde otra aplicación.
             */
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            /*
             * Otro sitio no puede incrustar nuestras respuestas como recurso.
             * Es barato: todo lo que la aplicación consume de sí misma es del
             * mismo origen, y las fotos de Unsplash llegan HACIA acá, así que
             * su CORP lo decide Unsplash y esta cabecera no las toca.
             *
             * NO se añade `Cross-Origin-Embedder-Policy`, que ZAP también pide:
             * `require-corp` exige que todo recurso externo declare permiso, y
             * las fotos de Unsplash no lo hacen. Serviría para aislar el
             * proceso (SharedArrayBuffer) y acá no se usa nada de eso: sería
             * romper el catálogo a cambio de nada.
             */
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        /*
         * Nada de lo que sale de la API se guarda en caché: un menú cacheado
         * muestra productos agotados, y una respuesta de sesión cacheada por un
         * proxy compartido es una filtración de cuenta.
         *
         * `/api/imagenes` queda FUERA, y es la única excepción. Esas respuestas
         * son bytes de una foto, no datos de nadie: son públicas —el menú se ve
         * sin sesión (RF-04)— e inmutables, porque la URL lleva el id de la
         * foto y subir una nueva crea otro id. Sin esta exclusión, cada tarjeta
         * del catálogo volvería a descargar su imagen en cada visita.
         */
        source: "/api/((?!imagenes).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Vary", value: "Cookie" },
        ],
      },
    ];
  },
};

export default nextConfig;
