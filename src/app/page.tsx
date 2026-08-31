import { prisma } from "@/lib/db";
import { sesionActual } from "@/lib/auth";
import { horasLibresPorComercio } from "@/lib/horas-libres";
import { Navegacion } from "@/components/Navegacion";
import { InicioCliente } from "./InicioCliente";
import type { ProductoTarjeta } from "@/components/TarjetaComida";

export const dynamic = "force-dynamic";

/**
 * Portada.
 *
 * Los datos se arman acá; QUÉ se muestra lo decide `InicioCliente`, porque
 * depende de si hay sesión. Un invitado y un estudiante con un pedido en curso
 * no vienen a lo mismo: el primero necesita entender qué es esto, el segundo
 * necesita saber si ya puede ir a retirar. Servirles la misma portada es
 * atender bien a uno y mal al otro.
 */
export default async function Inicio() {
  /*
   * La sesión se resuelve ACÁ, no en el cliente.
   *
   * Antes `InicioCliente` la pedía en un efecto, así que el primer cuadro se
   * pintaba siempre como visitante: un estudiante con un pedido en cocina veía
   * el argumento de venta —"Pedí antes. Llegá y retirá"— parpadear encima de su
   * código antes de que la portada se corrigiera sola. El servidor ya sabe la
   * respuesta; hacerla viajar de vuelta es lo que causaba el destello.
   */
  const sesion = await sesionActual();

  const comercios = await prisma.comercio.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
    include: {
      productos: {
        where: { anticipable: true, archivado: false },
        orderBy: { tiempoPreparacionMin: "desc" },
        take: 3,
      },
    },
  });

  /*
   * La próxima hora libre de cada comercio: el tercer dato de la tarjeta.
   *
   * Es el único de los tres que hay que calcular, y se calcula con las reglas
   * del motor de admisión —holgura y cut-off—, no con una estimación. Si un
   * comercio no tiene ninguna hora que pueda cumplir, la línea no se dibuja.
   */
  const libres = await horasLibresPorComercio(comercios, new Date());

  /*
   * "Lo que más piden" sale del historial real, no de una lista curada a mano.
   *
   * Es la señal más honesta disponible hoy: lo que el campus pide de verdad.
   * Una sección de recomendados rellenada con lo primero que devuelve el
   * catálogo es una mentira chica que el estudiante detecta en dos visitas.
   */
  const masPedidos = await prisma.itemPedido.groupBy({
    by: ["productoId"],
    _sum: { cantidad: true },
    orderBy: { _sum: { cantidad: "desc" } },
    take: 12,
  });

  const productos = await prisma.producto.findMany({
    where: {
      id: { in: masPedidos.map((m) => m.productoId) },
      archivado: false,
      anticipable: true,
    },
    include: { comercio: true },
  });

  // Se conserva el orden de popularidad, que `findMany` no respeta.
  const orden = new Map(masPedidos.map((m, i) => [m.productoId, i]));
  const destacados: ProductoTarjeta[] = productos
    .sort((a, b) => (orden.get(a.id) ?? 99) - (orden.get(b.id) ?? 99))
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      imagenUrl: p.imagenUrl,
      precio: String(p.precio),
      minutos: p.tiempoPreparacionMin,
      anticipable: p.anticipable,
      disponible: p.disponible,
      comercio: p.comercio.nombre,
      comercioSlug: p.comercio.slug,
      comercioUbicacion: p.comercio.ubicacion,
      comercioAbierto: p.comercio.estadoOperacion === "ABIERTO",
    }));

  return (
    <>
      <Navegacion comercioSlug={comercios[0]?.slug} />
      <InicioCliente
        sesionInicial={
          sesion
            ? { correo: sesion.correo, nombre: sesion.nombre }
            : null
        }
        destacados={destacados}
        comercios={comercios.map((c) => ({
          nombre: c.nombre,
          slug: c.slug,
          ubicacion: c.ubicacion,
          abierto: c.estadoOperacion === "ABIERTO",
          anchoFranjaMin: c.anchoFranjaMin,
          proximaHoraLibre: libres.get(c.id)?.inicio.toISOString() ?? null,
          // También el fin: una franja disponible puede haber empezado ya, y
          // entonces lo cierto no es a qué hora empieza sino hasta cuándo dura.
          proximaHoraFin: libres.get(c.id)?.fin.toISOString() ?? null,
          fotos: c.productos.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            imagenUrl: p.imagenUrl,
          })),
        }))}
      />
    </>
  );
}
