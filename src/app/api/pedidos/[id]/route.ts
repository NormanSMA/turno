/** GET /api/pedidos/:id — detalle. Protegido contra IDOR. */
import { exigirAccesoPedido } from "@/lib/auth";
import { coincideEtag, manejarError, sinCambios, okConEtag } from "@/lib/http";
import { leerCancelacion } from "@/core/cancelacion";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    // Lanza 403 tanto si el pedido no existe como si es de otro: responder
    // distinto convertiría el endpoint en un oráculo de existencia.
    const { pedido } = await exigirAccesoPedido(id);

    // Validador de frescura (ADR-14). `actualizadoEn` es `@updatedAt`, así que
    // cambia con cada transición de estado — que es exactamente lo único que
    // esta pantalla está esperando. La comprobación va DESPUÉS de autorizar:
    // un 304 antes del control de acceso confirmaría la existencia del pedido
    // a quien no puede verlo.
    //
    // El ahorro está en salir acá: la consulta de abajo trae items, eventos,
    // franja y comercio, y en la enorme mayoría de los sondeos devuelve algo
    // idéntico a lo que el cliente ya tiene.
    const etag = `W/"p-${pedido.actualizadoEn.getTime()}"`;
    if (coincideEtag(req, etag)) return sinCambios(etag);

    const p = await prisma.pedido.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        eventos: { orderBy: { timestamp: "asc" } },
        franja: {
          include: {
            comercio: {
              select: {
                nombre: true,
                slug: true,
                ubicacion: true,
                minutosNoShow: true,
              },
            },
          },
        },
      },
    });

    return okConEtag({
      id: p.id,
      codigo: p.codigo,
      estado: p.estado,
      cumplimiento: p.cumplimiento,
      total: String(p.total),
      cargaEstimadaMin: p.cargaEstimadaMin,
      comercio: p.franja.comercio.nombre,
      comercioSlug: p.franja.comercio.slug,
      comercioUbicacion: p.franja.comercio.ubicacion,
      // El cliente lo necesita para avisar ANTES del no-show, no después: es
      // la única forma de que el aviso todavía sirva para algo.
      minutosNoShow: p.franja.comercio.minutosNoShow,
      franjaInicio: p.franja.inicio.toISOString(),
      franjaFin: p.franja.fin.toISOString(),
      creadoEn: p.creadoEn.toISOString(),
      listoEn: p.listoEn?.toISOString() ?? null,
      retiradoEn: p.retiradoEn?.toISOString() ?? null,
      canceladoEn: p.canceladoEn?.toISOString() ?? null,
      items: p.items.map((i) => ({
        // Necesario para "pedir lo mismo": el nombre es una instantánea
        // histórica y no sirve para volver a armar el carrito.
        productoId: i.productoId,
        nombre: i.nombreProducto,
        cantidad: i.cantidad,
        precioUnitario: String(i.precioUnitario),
        subtotal: String(i.subtotal),
      })),
      eventos: p.eventos.map((e) => ({
        estado: e.estado,
        timestamp: e.timestamp.toISOString(),
      })),
      /*
       * Quién canceló y por qué.
       *
       * Se resuelve en el servidor y no se manda `actorId` crudo: ese id
       * identifica a una persona del comercio y el estudiante no tiene por qué
       * recibirlo. Lo que necesita es "lo canceló el comercio" y el motivo.
       */
      cancelacion: leerCancelacion(
        p.eventos.map((e) => ({
          estado: e.estado,
          actorId: e.actorId,
          nota: e.nota,
        })),
        p.usuarioId,
      ),
    }, etag);
  } catch (e) {
    return manejarError(e);
  }
}
