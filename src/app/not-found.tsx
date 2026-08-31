import Link from "next/link";
import { MarcaTurno } from "@/components/marca";

/**
 * Página 404.
 *
 * Un estudiante llega acá sobre todo por un QR mal impreso o por un enlace de
 * pedido que ya no existe. Por eso no dice "Error 404": dice qué pasó y ofrece
 * las dos salidas que sirven — el menú y sus pedidos.
 */
export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
      <div className="mx-auto mb-5">
        <MarcaTurno size={48} />
      </div>
      <p className="etiqueta">No encontramos esa página</p>
      <h1 className="titulo mt-2 text-4xl">Acá no hay nada</h1>
      <p className="mt-3 text-sm text-tinta-suave">
        Puede ser un enlace viejo, un código mal escrito o un pedido que ya no
        existe.
      </p>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/"
          className="presiona brillo rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white"
        >
          Ver el menú
        </Link>
        <Link
          href="/mis-pedidos"
          className="presiona rounded-full border border-borde px-6 py-3 font-medium"
        >
          Mis pedidos
        </Link>
      </div>
    </main>
  );
}
