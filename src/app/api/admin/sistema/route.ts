/**
 * GET /api/admin/sistema — consola del operador de la plataforma. Solo ADMIN.
 *
 * Responde tres preguntas que ninguna otra pantalla responde:
 *
 *   1. ¿Está sano?           latencia real de la base, bandeja de salida, colas
 *   2. ¿Dónde aprieta?       franjas saturadas por comercio
 *   3. ¿El modelo es cierto? desvío entre el t(p) declarado y el real
 *
 * La tercera es la importante. Todo el control de admisión descansa sobre que
 * `t(p)` sea verdad; si la cocina tarda un 40 % más de lo declarado, el sistema
 * está prometiendo horas que no puede cumplir y ninguna otra métrica lo dice.
 */
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/auth";
import { manejarError, ok } from "@/lib/http";
import {
  desviosPorComercio,
  desviosPorProducto,
  embudoOperativo,
  presionPorComercio,
  type FranjaSistema,
  type MuestraPreparacion,
} from "@/core/sistema";

const ZONA = "America/Managua";

function horaLocal(d: Date): string {
  return d.toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  });
}

export async function GET(req: Request) {
  try {
    await exigirRol("ADMIN");

    const dias = Math.min(
      90,
      Math.max(1, Number(new URL(req.url).searchParams.get("dias") ?? 7) || 7),
    );
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    // Latencia real de la base, medida con una consulta de verdad. Un "ok" que
    // no toca nada da tranquilidad falsa: el proceso puede estar vivo y la base
    // inalcanzable, que es justo el modo de fallo que importa.
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const baseMs = Math.round(performance.now() - t0);

    const [
      franjas,
      pedidos,
      correoPendiente,
      correoFallido,
      pushPendiente,
      pushFallido,
      suscripciones,
      auditoria,
      sesionesVivas,
    ] = await Promise.all([
      prisma.franja.findMany({
        where: { inicio: { gte: desde } },
        include: { comercio: true },
      }),
      prisma.pedido.findMany({
        where: { creadoEn: { gte: desde } },
        select: {
          estado: true,
          cargaEstimadaMin: true,
          listoEn: true,
          franja: { select: { comercio: { select: { nombre: true } } } },
          items: { select: { nombreProducto: true } },
          eventos: {
            where: { estado: "EN_PREPARACION" },
            select: { timestamp: true },
            take: 1,
          },
        },
      }),
      prisma.notificacion.count({
        where: { estado: "PENDIENTE", canal: "CORREO" },
      }),
      prisma.notificacion.count({
        where: { estado: "FALLIDA", canal: "CORREO" },
      }),
      prisma.notificacion.count({
        where: { estado: "PENDIENTE", canal: "PUSH" },
      }),
      prisma.notificacion.count({ where: { estado: "FALLIDA", canal: "PUSH" } }),
      prisma.suscripcionPush.count(),
      prisma.auditoriaAdmin.findMany({
        orderBy: { timestamp: "desc" },
        take: 12,
        include: { actor: { select: { correo: true } } },
      }),
      prisma.sesion.count({
        where: { revocadaEn: null, expiraEn: { gt: new Date() } },
      }),
    ]);

    const paraPresion: FranjaSistema[] = franjas.map((f) => ({
      comercio: f.comercio.nombre,
      hora: horaLocal(f.inicio),
      capacidadMinutos: f.capacidadMinutos,
      cargaAsignada: f.cargaAsignada,
      factorSeguridad: Number(f.comercio.factorSeguridad),
    }));

    /*
     * El tiempo real de preparación sale de dos marcas que ya se registran: el
     * evento EN_PREPARACION y `listoEn`. Solo se toman los pedidos que tienen
     * las dos, y se descartan los mayores a dos horas — esos no son cocina
     * lenta, son un botón que nadie tocó hasta el día siguiente, y meterlos
     * arruinaría la mediana.
     */
    const muestras: MuestraPreparacion[] = pedidos.flatMap((p) => {
      const empezo = p.eventos[0]?.timestamp;
      if (!empezo || !p.listoEn) return [];
      const real = (p.listoEn.getTime() - empezo.getTime()) / 60000;
      if (real <= 0 || real > 120) return [];

      return [
        {
          comercio: p.franja.comercio.nombre,
          declarado: p.cargaEstimadaMin,
          real,
          // Solo con un producto se puede atribuir el tiempo a ese producto.
          productoUnico:
            p.items.length === 1 ? (p.items[0]?.nombreProducto ?? null) : null,
        },
      ];
    });

    return ok({
      dias,
      salud: {
        baseMs,
        correoPendiente,
        correoFallido,
        pushPendiente,
        pushFallido,
        suscripciones,
        sesionesVivas,
        franjas: franjas.length,
        pedidos: pedidos.length,
      },
      presion: presionPorComercio(paraPresion),
      embudo: embudoOperativo(pedidos.map((p) => p.estado)),
      calibracion: {
        muestras: muestras.length,
        porComercio: desviosPorComercio(muestras),
        porProducto: desviosPorProducto(muestras).slice(0, 8),
      },
      auditoria: auditoria.map((a) => ({
        id: a.id,
        accion: a.accion,
        entidad: a.entidad,
        actor: a.actor?.correo ?? "sistema",
        timestamp: a.timestamp.toISOString(),
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}
