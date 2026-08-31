/**
 * GET   /api/comercios/:slug/admin — estado completo para el panel del comercio.
 * PATCH /api/comercios/:slug/admin — parámetros del comercio.
 */
import { prisma } from "@/lib/db";
import { exigirComercioPorSlug } from "@/lib/auth";
import { actualizarParametros } from "@/lib/comercio";
import { pedidosVivosPorFranja } from "@/lib/comercio";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaParametros } from "@/lib/esquemas";
import { capacidadSugerida } from "@/core/administracion";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const { comercio } = await exigirComercioPorSlug(slug);

    const ahora = new Date();
    const desde = new Date(ahora);
    desde.setHours(0, 0, 0, 0);

    const [productos, franjas, vivos] = await Promise.all([
      prisma.producto.findMany({
        where: { comercioId: comercio.id },
        orderBy: [{ archivado: "asc" }, { nombre: "asc" }],
      }),
      prisma.franja.findMany({
        where: { comercioId: comercio.id, inicio: { gte: desde } },
        orderBy: { inicio: "asc" },
        take: 200,
      }),
      pedidosVivosPorFranja(comercio.id, desde),
    ]);

    const alfa = Number(comercio.factorSeguridad);
    return ok({
      comercio: {
        id: comercio.id,
        nombre: comercio.nombre,
        slug: comercio.slug,
        personalCocina: comercio.personalCocina,
        anchoFranjaMin: comercio.anchoFranjaMin,
        factorSeguridad: alfa,
        tiempoMinAnticipable: comercio.tiempoMinAnticipable,
        margenCutoffMin: comercio.margenCutoffMin,
        minutosNoShow: comercio.minutosNoShow,
        maxPedidosActivos: comercio.maxPedidosActivos,
        estadoOperacion: comercio.estadoOperacion,
        capacidadSugerida: capacidadSugerida(
          comercio.personalCocina,
          comercio.anchoFranjaMin,
        ),
      },
      productos: productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        imagenUrl: p.imagenUrl,
        precio: Number(p.precio),
        tiempoPreparacionMin: p.tiempoPreparacionMin,
        anticipable: p.anticipable,
        disponible: p.disponible,
        archivado: p.archivado,
        elegible:
          p.anticipable &&
          p.disponible &&
          !p.archivado &&
          p.tiempoPreparacionMin >= comercio.tiempoMinAnticipable,
      })),
      franjas: franjas.map((f) => ({
        id: f.id,
        inicio: f.inicio.toISOString(),
        fin: f.fin.toISOString(),
        capacidadMinutos: f.capacidadMinutos,
        capacidadEfectivaMin: Math.floor(f.capacidadMinutos * alfa),
        cargaAsignada: f.cargaAsignada,
        abierta: f.abierta,
        pedidosVivos: vivos.get(f.id) ?? 0,
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const { sesion, comercio } = await exigirComercioPorSlug(slug);

    const cambios = await cuerpo(req, esquemaParametros);
    const actualizado = await actualizarParametros(
      comercio.id,
      sesion.usuarioId,
      cambios,
    );

    return ok({
      actualizado: true,
      estadoOperacion: actualizado.estadoOperacion,
      factorSeguridad: Number(actualizado.factorSeguridad),
    });
  } catch (e) {
    return manejarError(e);
  }
}
