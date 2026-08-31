/**
 * GET  /api/admin/operacion — qué está mal ahora y qué se hizo hoy
 * POST /api/admin/operacion — modo emergencia
 *
 * Incidentes (§36), actividad visible (§34) y emergencia (§35) en una sola
 * ruta: se leen juntas y en ese orden. Partirlas armaría la pantalla por
 * pedazos justo cuando alguien la abre porque algo se rompió.
 */
import { prisma } from "@/lib/db";
import { exigirRol, sesionActual } from "@/lib/auth";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { detectarIncidentes } from "@/core/incidentes";
import { z } from "zod";

const MAX_INTENTOS = 5;

export async function GET() {
  try {
    await exigirRol("ADMIN");
    const ahora = new Date();

    // Latencia medida con una consulta de verdad: un "ok" que no toca nada da
    // tranquilidad falsa justo en el modo de fallo que importa.
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const baseMs = Math.round(performance.now() - t0);

    const [comercios, pendientes, fallidas, descartados, atrasados, auditoria, eventos] =
      await Promise.all([
        prisma.comercio.findMany({
          where: { activo: true },
          select: {
            id: true,
            nombre: true,
            slug: true,
            estadoOperacion: true,
            factorSeguridad: true,
            franjas: {
              where: { fin: { gt: ahora }, abierta: true },
              select: { capacidadMinutos: true, cargaAsignada: true },
            },
          },
        }),
        prisma.notificacion.count({
          where: { estado: "PENDIENTE", intentos: { lt: MAX_INTENTOS } },
        }),
        prisma.notificacion.count({ where: { estado: "FALLIDA" } }),
        // Un dispositivo con los reintentos agotados ya no recibe nada: para el
        // estudiante que lo usa, los avisos simplemente dejaron de llegar.
        prisma.suscripcionPush.count({ where: { fallos: { gte: MAX_INTENTOS } } }),
        prisma.pedido.count({
          where: {
            estado: { in: ["RECIBIDO", "EN_PREPARACION"] },
            franja: { fin: { lt: ahora } },
          },
        }),
        prisma.auditoriaAdmin.findMany({
          orderBy: { timestamp: "desc" },
          take: 30,
          include: { actor: { select: { correo: true, rol: true } } },
        }),
        // La actividad sale de los EVENTOS de pedido, el mismo registro que
        // sostiene la máquina de estados: no puede desincronizarse.
        prisma.eventoPedido.findMany({
          where: {
            // Solo lo hecho por una persona: los barridos automáticos son
            // ruido en una bitácora que existe para responder "quién tocó qué".
            actorId: { not: null },
            timestamp: { gte: new Date(ahora.getTime() - 12 * 60 * 60 * 1000) },
          },
          orderBy: { timestamp: "desc" },
          take: 40,
          include: {
            pedido: {
              select: {
                codigo: true,
                franja: { select: { comercio: { select: { nombre: true } } } },
              },
            },
          },
        }),
      ]);

    // `EventoPedido` guarda solo el id del actor, así que los correos se
    // resuelven aparte. Son unos pocos por turno.
    const idsActores = [
      ...new Set(eventos.map((e) => e.actorId).filter((x): x is string => !!x)),
    ];
    const actores = new Map(
      (
        await prisma.usuario.findMany({
          where: { id: { in: idsActores } },
          select: { id: true, correo: true },
        })
      ).map((u) => [u.id, u.correo]),
    );

    const senales = {
      baseMs,
      notificacionesPendientes: pendientes,
      notificacionesFallidas: fallidas,
      dispositivosDescartados: descartados,
      pedidosAtrasados: atrasados,
      comercios: comercios.map((c) => ({
        nombre: c.nombre,
        estadoOperacion: c.estadoOperacion,
        franjasFuturas: c.franjas.length,
        // Saturado = ninguna franja futura acepta ni un minuto más. No es un
        // error: es el control de admisión haciendo exactamente su trabajo.
        saturado:
          c.franjas.length > 0 &&
          c.franjas.every(
            (f) => f.cargaAsignada >= f.capacidadMinutos * Number(c.factorSeguridad),
          ),
      })),
    };

    return ok({
      generadoEn: ahora.toISOString(),
      incidentes: detectarIncidentes(senales),
      salud: { baseMs, pendientes, fallidas, atrasados },
      comercios: comercios.map((c) => ({
        nombre: c.nombre,
        slug: c.slug,
        estadoOperacion: c.estadoOperacion,
        franjasFuturas: c.franjas.length,
      })),
      actividad: [
        ...auditoria.map((a) => ({
          cuando: a.timestamp.toISOString(),
          quien: a.actor?.correo ?? "sistema",
          que: `${a.accion} · ${a.entidad}`,
          detalle: null as string | null,
        })),
        ...eventos.map((e) => ({
          cuando: e.timestamp.toISOString(),
          quien: (e.actorId && actores.get(e.actorId)) ?? "sistema",
          que: `${e.pedido.codigo} → ${e.estado}`,
          detalle: e.nota ?? e.pedido.franja.comercio.nombre,
        })),
      ]
        .sort((a, b) => (a.cuando < b.cuando ? 1 : -1))
        .slice(0, 50),
    });
  } catch (e) {
    return manejarError(e);
  }
}

const esquema = z.object({
  accion: z.enum(["PAUSAR_TODO", "REANUDAR_TODO"]),
});

/**
 * Modo emergencia (§35): pausa o reanuda todos los comercios de una vez. Ir uno
 * por uno cuesta minutos que se traducen en pedidos incumplibles.
 *
 * **PAUSAR no cancela nada** —lo confirmado sigue en pie y la cocina lo sigue
 * viendo—; solo se detiene la entrada de pedidos nuevos. Por eso es seguro
 * tocarlo bajo presión. Queda en auditoría con quién lo hizo.
 */
export async function POST(req: Request) {
  try {
    await exigirRol("ADMIN");
    const sesion = await sesionActual();
    const { accion } = await cuerpo(req, esquema);

    const pausar = accion === "PAUSAR_TODO";
    const antes = await prisma.comercio.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, estadoOperacion: true },
    });

    // Al reanudar, solo los PAUSADOS: un CERRADO lo cerró alguien por una
    // razón, y abrirlo sería revertir esa decisión sin enterarse.
    const objetivo = antes.filter((c) =>
      pausar ? c.estadoOperacion === "ABIERTO" : c.estadoOperacion === "PAUSADO",
    );

    await prisma.$transaction([
      prisma.comercio.updateMany({
        where: { id: { in: objetivo.map((c) => c.id) } },
        data: { estadoOperacion: pausar ? "PAUSADO" : "ABIERTO" },
      }),
      prisma.auditoriaAdmin.create({
        data: {
          actorId: sesion?.usuarioId ?? null,
          accion,
          entidad: "comercio",
          entidadId: null,
          antes: { comercios: antes.map((c) => `${c.nombre}:${c.estadoOperacion}`) },
          despues: {
            afectados: objetivo.map((c) => c.nombre),
          },
        },
      }),
    ]);

    return ok({ afectados: objetivo.map((c) => c.nombre) });
  } catch (e) {
    return manejarError(e);
  }
}
