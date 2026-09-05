/**
 * La cabecera de las pantallas de operación: panel, cocina e informe.
 *
 * ## Por qué existe
 *
 * Las tres pantallas que usa un comercio tenían tres cabeceras distintas
 * escritas por separado, y la del informe ni siquiera era una: montaba la
 * navegación del **cliente**. Quien entraba a ver sus ventas se encontraba con
 * Inicio, Explorar, Pedidos y Perfil, como si fuera a pedir comida — en medio
 * de su propia herramienta de trabajo.
 *
 * Eso pasó porque la cabecera del panel estaba incrustada en su página en vez
 * de ser un componente. No había nada que reutilizar, así que el informe usó lo
 * único que había a mano. Es el mismo patrón que tuvo el logo con sus tres
 * versiones: cuando algo compartido no tiene un sitio propio, cada pantalla se
 * hace el suyo y dejan de parecerse.
 *
 * ## Qué separa
 *
 * Operar no es pedir. Un comercio mirando su informe no necesita "Explorar", y
 * ofrecérselo confunde dos papeles que el sistema mantiene separados en todo lo
 * demás. La navegación de cliente se queda en las pantallas de cliente.
 */

import Link from "next/link";
import { MarcaTurno } from "@/components/marca";

export function CabeceraOperacion({
  etiqueta,
  titulo,
  /** Ancho del contenido. El tablero de cocina respira más que el panel. */
  ancho = "max-w-5xl",
  acciones,
  children,
}: {
  /** Qué pantalla es: "Panel del comercio", "Cocina", "Informe". */
  etiqueta: string;
  /** El nombre del comercio, o el texto de carga. */
  titulo: string;
  ancho?: string;
  /** Botones a la derecha: cambian por pantalla. */
  acciones?: React.ReactNode;
  /** Fila de debajo — las pestañas del panel. Opcional. */
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-borde bg-papel-alto">
      <div className={`mx-auto w-full ${ancho} px-4 py-3 sm:px-6`}>
        <div className="flex flex-wrap items-center gap-3">
          {/* El logo enlaza al inicio del comercio y no a la portada pública:
              desde acá, "casa" es el panel. */}
          <MarcaTurno size={34} />
          <div className="min-w-0">
            <p className="etiqueta">{etiqueta}</p>
            <h1 className="titulo truncate text-2xl">{titulo}</h1>
          </div>
          {acciones && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {acciones}
            </div>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}

/** Botón de cabecera secundario: contorno, para lo que no es la acción principal. */
export function AccionCabecera({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="presiona rounded-full border border-borde px-4 py-2 text-sm font-medium"
    >
      {children}
    </Link>
  );
}

/** Botón de cabecera principal: relleno de marca. Uno solo por pantalla. */
export function AccionPrincipal({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="presiona rounded-full bg-marca-fondo px-4 py-2 text-sm font-semibold text-white"
    >
      {children}
    </Link>
  );
}
