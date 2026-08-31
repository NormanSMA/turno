import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Arranque } from "@/components/Arranque";

/**
 * UNA sola familia para toda la interfaz (Design System §07).
 *
 * Antes eran tres: Nunito redondeada para títulos, Archivo para texto y
 * JetBrains para datos. Tres familias en una app transaccional no crean
 * jerarquía, crean ruido — la jerarquía la da el PESO, y Geist tiene el
 * contraste suficiente para sostenerla sola.
 *
 * La mono se conserva solo para lo que se alinea en columnas: horas, códigos
 * de retiro y montos. Es la misma familia, así que no rompe la unidad.
 */
const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

/**
 * Renderizado dinámico en toda la aplicación.
 *
 * No es una preferencia: es lo que exige el nonce de la CSP. Una página
 * prerenderizada se genera al COMPILAR, cuando todavía no existe la petición de
 * la que sale el nonce, así que sus scripts en línea quedan sin marcar y el
 * navegador los bloquea. El síntoma era una pantalla que cargaba y no
 * respondía, solo en las rutas estáticas.
 *
 * El costo es bajo acá y conviene decir por qué: no había ninguna página que
 * se sirviera igual para todos. Todas dependen de la sesión y piden sus datos
 * al montarse, así que el HTML estático solo era una cáscara vacía. Y esa
 * cáscara la guarda ahora el service worker, que además la sirve sin conexión
 * —cosa que el prerenderizado no hacía—.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TURNO — pedí antes, llegá y retirá",
  description:
    "Pedí antes, reservá tu hora de retiro y evitá la fila. TURNO reserva capacidad real de cocina, no solo un pedido.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#14181d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-NI"
      className={`${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh">
        {/* Salto al contenido: sin esto, quien navega con teclado o lector de
            pantalla tiene que recorrer toda la navegación en cada página. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-tinta focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-papel"
        >
          Saltar al contenido
        </a>
        <Arranque />
        {children}
      </body>
    </html>
  );
}
