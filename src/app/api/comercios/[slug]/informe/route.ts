/**
 * GET /api/comercios/:slug/informe?dias=7 — informe de ventas del comercio.
 *
 * Lo abre el comercio dueño, y también el administrador — que observa pero no
 * opera (ADR-09). Cualquier otra cuenta recibe 403, incluida la de OTRO
 * comercio: los números de ventas de un negocio no son visibles para el de al
 * lado.
 *
 * Las horas se agrupan en la zona del comercio, no en UTC. Es la diferencia
 * entre "vendés más a las 12" y "vendés más a las 18": la misma consulta, y una
 * de las dos respuestas es inútil.
 */
import { prisma } from "@/lib/db";
import { exigirSesion, NoAutorizado } from "@/lib/auth";
import { manejarError, ok } from "@/lib/http";
import {
  calcularCifras,
  calcularOcupacion,
  productosVendidos,
  ventasPorHora,
  type FranjaInforme,
  type PedidoInforme,
} from "@/core/informe";

const ZONA = "America/Managua";

/** La franja exacta, en la zona del comercio: "09:20", "12:40". */
function franjaLocal(d: Date): string {
  return d.toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  });
}

/**
 * La hora del reloj, no la franja: "09–10", "12–13".
 *
 * Las ventas se agrupan por hora entera y las franjas no, y la diferencia no es
 * cosmética. Un comercio decide con esto **a quién pone a trabajar y cuándo**, y
 * eso se decide por hora, no en tramos de diez minutos. Agrupado por franja el
 * informe daba veintisiete barras y una conclusión inservible —"tu mejor hora
 * es 14:40 con el 7 %"— porque el mismo pico quedaba repartido entre seis
 * tramos contiguos.
 *
 * La ocupación sí se mide por franja: ahí la pregunta es otra —cómo configuró
 * su capacidad— y el tramo exacto es lo que hay que corregir.
 */
function horaLocal(d: Date): string {
  const h = Number(
    d.toLocaleString("en-US", { hour: "2-digit", hour12: false, timeZone: ZONA }),
  );
  const dos = (n: number) => String(n % 24).padStart(2, "0");
  return `${dos(h)}–${dos(h + 1)}`;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const sesion = await exigirSesion();

    const comercio = await prisma.comercio.findUnique({ where: { slug } });
    if (!comercio) throw new NoAutorizado("Comercio inexistente o ajeno");

    // Mismo error para "no existe" y "no es tuyo": responder distinto
    // convertiría el endpoint en un oráculo para enumerar comercios.
    const propio =
      sesion.rol === "COMERCIO" && sesion.comercioId === comercio.id;
    if (!propio && sesion.rol !== "ADMIN") {
      throw new NoAutorizado("Comercio inexistente o ajeno");
    }

    const pedidos_dias = Number(new URL(req.url).searchParams.get("dias") ?? 7);
    const dias = Number.isFinite(pedidos_dias)
      ? Math.min(90, Math.max(1, Math.trunc(pedidos_dias)))
      : 7;
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const [pedidos, franjas] = await Promise.all([
      prisma.pedido.findMany({
        where: { franja: { comercioId: comercio.id, inicio: { gte: desde } } },
        include: { items: true, franja: true },
      }),
      prisma.franja.findMany({
        where: { comercioId: comercio.id, inicio: { gte: desde } },
        orderBy: { inicio: "asc" },
      }),
    ]);

    const paraInforme: PedidoInforme[] = pedidos.map((p) => ({
      estado: p.estado,
      cumplimiento: p.cumplimiento,
      total: Number(p.total),
      cargaMin: p.cargaEstimadaMin,
      hora: horaLocal(p.franja.inicio),
      items: p.items.map((i) => ({
        nombre: i.nombreProducto,
        cantidad: i.cantidad,
        subtotal: Number(i.subtotal),
      })),
    }));

    const paraOcupacion: FranjaInforme[] = franjas.map((f) => ({
      hora: franjaLocal(f.inicio),
      capacidadMinutos: f.capacidadMinutos,
      cargaAsignada: f.cargaAsignada,
    }));

    return ok({
      comercio: { nombre: comercio.nombre, slug: comercio.slug },
      dias,
      cifras: calcularCifras(paraInforme),
      porHora: ventasPorHora(paraInforme),
      productos: productosVendidos(paraInforme),
      ocupacion: calcularOcupacion(paraOcupacion),
    });
  } catch (e) {
    return manejarError(e);
  }
}
