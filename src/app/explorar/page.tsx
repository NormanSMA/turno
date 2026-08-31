import { prisma } from "@/lib/db";
import { horasLibresPorComercio } from "@/lib/horas-libres";
import { Navegacion } from "@/components/Navegacion";
import { Explorador, type ProductoUI } from "./Explorador";

export const dynamic = "force-dynamic";

/**
 * Explorar — "¿qué más hay?".
 *
 * No hace falta cuenta para llegar acá ni para ver todo el catálogo. La
 * identificación se pide recién al reservar una franja, que es el momento en
 * que el sistema necesita saber a quién le está comprometiendo capacidad de
 * cocina. Pedirla antes es fricción sin contrapartida.
 *
 * Los datos se traen en el servidor y el filtrado ocurre en el cliente: el
 * catálogo de un campus son decenas de productos, no miles, y hacerlo en el
 * cliente elimina una petición por cada letra que se escribe — que era
 * exactamente el patrón de gasto que el ADR-14 vino a corregir.
 */
export default async function Pagina() {
  const comercios = await prisma.comercio.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
    include: {
      productos: {
        where: { archivado: false },
        orderBy: { nombre: "asc" },
      },
    },
  });

  const productos: ProductoUI[] = comercios.flatMap((c) =>
    c.productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      imagenUrl: p.imagenUrl,
      precio: String(p.precio),
      minutos: p.tiempoPreparacionMin,
      anticipable: p.anticipable,
      disponible: p.disponible,
      comercio: c.nombre,
      comercioSlug: c.slug,
      comercioUbicacion: c.ubicacion,
      comercioAbierto: c.estadoOperacion === "ABIERTO",
    })),
  );

  /*
   * Estado y tiempo por comercio (§11).
   *
   * Antes la lista de comercios era una fila de nombres: había que entrar a
   * cada uno para descubrir que estaba cerrado, o que la próxima hora libre
   * era dentro de una hora y media. Eso convierte "explorar" en abrir y
   * cerrar pestañas.
   *
   * El tiempo que se muestra es la PROMESA, no un promedio inventado: los
   * minutos que faltan hasta el fin de la primera franja abierta con capacidad
   * sin usar. Es exactamente lo que el sistema se compromete a cumplir, así
   * que no puede quedar corto de forma sistemática — que es el defecto de los
   * "15–20 min" de las aplicaciones de delivery.
   */
  const ahora = new Date();

  /*
   * La regla que decide qué hora se puede prometer vive en un solo lugar
   * (`lib/horas-libres` sobre `core/proxima-hora`), porque la comparte con la
   * portada. Tenerla escrita dos veces es tenerla mal una vez: basta con que
   * una copia se quede sin el cut-off para que esta pantalla vuelva a decir
   * "listo en ~1 min" y el menú, dos toques después, no ofrezca esa hora.
   */
  const libres = await horasLibresPorComercio(comercios, ahora);

  const estados = comercios.map((c) => {
    const suya = libres.get(c.id) ?? null;

    return {
      nombre: c.nombre,
      slug: c.slug,
      ubicacion: c.ubicacion,
      estado: c.estadoOperacion,
      minutosParaListo: suya
        ? Math.max(1, Math.round((suya.fin.getTime() - ahora.getTime()) / 60000))
        : null,
    };
  });

  return (
    <>
      <Navegacion comercioSlug={comercios[0]?.slug} />
      <Explorador productos={productos} comercios={estados} />
    </>
  );
}
