/**
 * GET   /api/perfil — quién soy y qué llevo hecho
 * PATCH /api/perfil — actualizar mis datos
 *
 * Las cifras no son adorno. El producto promete devolverle tiempo al estudiante,
 * y una promesa que nunca se muestra cumplida no se percibe: la suma de minutos
 * que no pasó en la fila es el argumento del producto, dicho con su propio dato.
 *
 * El cálculo es deliberadamente conservador — solo cuenta pedidos RETIRADOS, y
 * solo el tiempo de preparación que la cocina ya tenía comprometido cuando el
 * estudiante llegó. Inflar esta cifra sería mentirle al usuario sobre su
 * propio tiempo.
 */
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { esquemaPerfil } from "@/lib/esquemas";
import { normalizarNombre } from "@/core/saludo";

export async function GET() {
  try {
    const sesion = await exigirSesion();

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: sesion.usuarioId },
      select: {
        correo: true,
        nombre: true,
        rol: true,
        facultad: true,
        carrera: true,
        anio: true,
        creadoEn: true,
        primerPedidoEn: true,
      },
    });

    const [retirados, activos, agregado, porComercio] = await Promise.all([
      prisma.pedido.count({
        where: { usuarioId: sesion.usuarioId, estado: "RETIRADO" },
      }),
      prisma.pedido.count({
        where: {
          usuarioId: sesion.usuarioId,
          estado: { in: ["RECIBIDO", "EN_PREPARACION", "LISTO"] },
        },
      }),
      prisma.pedido.aggregate({
        where: { usuarioId: sesion.usuarioId, estado: "RETIRADO" },
        _sum: { cargaEstimadaMin: true, total: true },
      }),
      prisma.pedido.groupBy({
        by: ["franjaId"],
        where: { usuarioId: sesion.usuarioId, estado: "RETIRADO" },
        _count: { _all: true },
        orderBy: { _count: { franjaId: "desc" } },
        take: 1,
      }),
    ]);

    // El comercio más pedido se resuelve aparte: `groupBy` no puede agrupar por
    // una columna de una tabla relacionada.
    let comercioFrecuente: string | null = null;
    if (porComercio[0]) {
      const f = await prisma.franja.findUnique({
        where: { id: porComercio[0].franjaId },
        select: { comercio: { select: { nombre: true } } },
      });
      comercioFrecuente = f?.comercio.nombre ?? null;
    }

    return ok({
      correo: usuario.correo,
      nombre: usuario.nombre,
      rol: usuario.rol,
      facultad: usuario.facultad,
      carrera: usuario.carrera,
      anio: usuario.anio,
      desde: usuario.creadoEn.toISOString(),
      cifras: {
        pedidosRetirados: retirados,
        pedidosActivos: activos,
        minutosAhorrados: agregado._sum.cargaEstimadaMin ?? 0,
        totalGastado: String(agregado._sum.total ?? 0),
        comercioFrecuente,
      },
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const sesion = await exigirSesion();
    const datos = await cuerpo(req, esquemaPerfil);

    await prisma.usuario.update({
      where: { id: sesion.usuarioId },
      data: {
        // `?? undefined` y no `?? null`: enviar el campo vacío lo BORRA, no
        // enviarlo lo deja como estaba. Son dos intenciones distintas y la
        // interfaz necesita poder expresar las dos.
        // Se normaliza al guardar y no al mostrar: si llega en mayúsculas
        // desde una lista de matrícula, se arregla una vez en vez de en cada
        // pantalla que lo pinte.
        nombre:
          datos.nombre === undefined
            ? undefined
            : normalizarNombre(datos.nombre ?? ""),
        facultad: datos.facultad,
        carrera: datos.carrera,
        anio: datos.anio,
      },
    });

    return ok({ guardado: true });
  } catch (e) {
    return manejarError(e);
  }
}
