import { Esqueleto } from "@/components/estados-ui";

/**
 * Carga de Explorar.
 *
 * La silueta es la de la pantalla que viene, no un bloque gris: mismo ancho,
 * misma rejilla, misma proporción 4:3 en las tarjetas. Un esqueleto que no
 * coincide con lo que llega produce un salto de layout, y ese salto se siente
 * peor que la espera que vino a tapar.
 */
export default function Cargando() {
  return (
    <main
      className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-5"
      aria-busy="true"
      aria-label="Cargando el catálogo"
    >
      <Esqueleto className="h-9 w-64" />

      {/* Buscador */}
      <Esqueleto className="mt-4 h-13 w-full !rounded-md" />

      {/* Estado por comercio: tres filas */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <Esqueleto className="h-16 w-full !rounded-md" />
          </li>
        ))}
      </ul>

      {/* Chips de filtro. Anchos escritos enteros y no interpolados: Tailwind
          genera las clases leyendo el archivo, y una construida en tiempo de
          ejecución no existe en la hoja de estilos. */}
      <div className="mt-3 flex gap-2">
        <Esqueleto className="h-10 w-20 !rounded-full" />
        <Esqueleto className="h-10 w-28 !rounded-full" />
        <Esqueleto className="h-10 w-24 !rounded-full" />
        <Esqueleto className="h-10 w-32 !rounded-full" />
      </div>

      <Esqueleto className="mt-4 h-4 w-24" />

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="overflow-hidden rounded-lg border border-borde">
            {/* La misma 4:3 que `TarjetaComida`. */}
            <Esqueleto className="aspect-[4/3] w-full !rounded-none" />
            <div className="space-y-2 p-3">
              <Esqueleto className="h-5 w-3/4" />
              <Esqueleto className="h-3 w-1/2" />
              <Esqueleto className="h-6 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
