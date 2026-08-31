/**
 * GET /api/cocina/:slug — cola de trabajo del comercio.
 *
 * ADR-05: sondeo cada 5 s en vez de WebSocket/SSE. La cola tiene decenas de
 * filas y el WiFi del campus se corta; una petición idempotente que se reintenta
 * sola es más robusta que una conexión persistente que hay que reconectar, y no
 * agrega infraestructura. La respuesta trae `generadoEn` para que la vista pueda
 * mostrar cuán fresca es.
 */
import { prisma } from "@/lib/db";
import { exigirRol, NoAutorizado } from "@/lib/auth";
import { puedeVerCocina } from "@/core/autorizacion";
import { fallo, manejarError, ok } from "@/lib/http";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    // Solo el comercio: el administrador observa el piloto, no lo opera.
    const sesion = await exigirRol("COMERCIO");

    const comercio = await prisma.comercio.findUnique({ where: { slug } });
    if (!comercio) return fallo("NO_ENCONTRADO", "Comercio inexistente", 404);
    if (!puedeVerCocina(sesion, comercio.id)) {
      throw new NoAutorizado("Esta cuenta no opera este comercio");
    }

    const ahora = new Date();
    const pedidos = await prisma.pedido.findMany({
      where: {
        franja: { comercioId: comercio.id },
        estado: { in: ["RECIBIDO", "EN_PREPARACION", "LISTO"] },
      },
      // Orden de trabajo: primero lo que vence antes. Es la cola que el
      // cocinero necesita, no el orden de llegada.
      orderBy: [{ franja: { inicio: "asc" } }, { creadoEn: "asc" }],
      include: { items: true, franja: true },
    });

    const franjas = await prisma.franja.findMany({
      where: { comercioId: comercio.id, fin: { gt: ahora } },
      orderBy: { inicio: "asc" },
      take: 12,
    });

    const alfa = Number(comercio.factorSeguridad);
    return ok({
      generadoEn: ahora.toISOString(),
      comercio: {
        id: comercio.id,
        nombre: comercio.nombre,
        slug: comercio.slug,
        estadoOperacion: comercio.estadoOperacion,
      },
      pedidos: pedidos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        estado: p.estado,
        cargaEstimadaMin: p.cargaEstimadaMin,
        franjaInicio: p.franja.inicio.toISOString(),
        franjaFin: p.franja.fin.toISOString(),
        // Minutos restantes hasta el compromiso: negativo = ya se incumplió.
        minutosRestantes: Math.round(
          (p.franja.fin.getTime() - ahora.getTime()) / 60000,
        ),
        creadoEn: p.creadoEn.toISOString(),
        items: p.items.map((i) => ({
          nombre: i.nombreProducto,
          cantidad: i.cantidad,
          tiempoPreparacionMin: i.tiempoPreparacionMin,
        })),
      })),
      franjas: franjas.map((f) => ({
        id: f.id,
        inicio: f.inicio.toISOString(),
        fin: f.fin.toISOString(),
        capacidadMinutos: f.capacidadMinutos,
        capacidadEfectivaMin: Math.floor(f.capacidadMinutos * alfa),
        cargaAsignada: f.cargaAsignada,
        ocupacion:
          f.capacidadMinutos > 0
            ? f.cargaAsignada / (f.capacidadMinutos * alfa)
            : 0,
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}
