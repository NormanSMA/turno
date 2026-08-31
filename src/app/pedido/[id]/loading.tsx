import { Esqueleto } from "@/components/estados-ui";

/**
 * Carga del detalle de un pedido.
 *
 * La pantalla que el estudiante abre caminando, así que la silueta importa más
 * que en otras: el bloque grande del código va donde va el código, no en
 * cualquier lado. Ver el hueco donde va a estar ya dice "es tu pedido, está
 * llegando".
 */
export default function Cargando() {
  return (
    <main
      className="mx-auto w-full max-w-lg px-4 pb-28 pt-6 sm:px-5"
      aria-busy="true"
      aria-label="Cargando el pedido"
    >
      <Esqueleto className="h-4 w-28" />
      <Esqueleto className="mt-3 h-9 w-56" />

      {/* Tarjeta del código de retiro: el dato por el que se abre la pantalla. */}
      <div className="mt-4 rounded-lg border-2 border-borde px-5 py-6">
        <Esqueleto className="mx-auto h-3 w-32" />
        <Esqueleto className="mx-auto mt-3 h-14 w-56 !rounded-md" />
        <Esqueleto className="mx-auto mt-3 h-4 w-40" />
        <Esqueleto className="mt-5 h-13 w-full !rounded-md" />
      </div>

      {/* Total */}
      <Esqueleto className="mt-4 h-14 w-full !rounded-md" />

      {/* Línea de tiempo: cuatro pasos con su riel. */}
      <div className="mt-6 rounded-lg border border-borde p-4">
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-1 items-center gap-2">
              <Esqueleto className="h-3 w-3 !rounded-full" />
              {i < 3 && <Esqueleto className="h-0.5 flex-1" />}
            </span>
          ))}
        </div>
        <Esqueleto className="mt-4 h-3 w-full" />
        <Esqueleto className="mt-2 h-3 w-2/3" />
      </div>

      {/* Detalle de los productos */}
      <div className="mt-6 space-y-2 rounded-lg border border-borde p-4">
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="h-4 w-3/4" />
        <Esqueleto className="h-4 w-1/2" />
      </div>
    </main>
  );
}
