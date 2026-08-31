import { Esqueleto } from "@/components/estados-ui";

/**
 * Carga del menú de un comercio.
 *
 * Es la navegación donde más se notaba el hueco: entre tocar un comercio y ver
 * su carta, la pantalla anterior quedaba congelada sin ninguna señal. Eso es lo
 * que se lee como "sitio web" y no como aplicación.
 *
 * Reproduce las dos columnas de escritorio —menú y carrito— porque en `lg` el
 * carrito ocupa 22rem fijos: sin reservarlos, al llegar el contenido la rejilla
 * se encoge de golpe.
 */
export default function Cargando() {
  return (
    <main
      className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-5"
      aria-busy="true"
      aria-label="Cargando la carta"
    >
      {/* Identidad del comercio */}
      <Esqueleto className="h-4 w-24" />
      <Esqueleto className="mt-2 h-10 w-72" />
      <Esqueleto className="mt-2 h-4 w-48" />

      {/* Buscador */}
      <Esqueleto className="mt-4 h-12 w-full !rounded-full" />

      {/* Filtros por tiempo de cocina */}
      <div className="mt-3 flex gap-2">
        <Esqueleto className="h-9 w-20 !rounded-full" />
        <Esqueleto className="h-9 w-32 !rounded-full" />
        <Esqueleto className="h-9 w-36 !rounded-full" />
      </div>

      <div className="mt-6 gap-8 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              className="overflow-hidden rounded-lg border border-borde"
            >
              <Esqueleto className="aspect-[4/3] w-full !rounded-none" />
              <div className="space-y-2 p-3">
                <Esqueleto className="h-5 w-3/4" />
                <Esqueleto className="h-6 w-20" />
              </div>
            </li>
          ))}
        </ul>

        {/* El carrito lateral solo existe en escritorio. */}
        <aside className="hidden lg:block">
          <Esqueleto className="h-64 w-full !rounded-lg" />
        </aside>
      </div>
    </main>
  );
}
