/**
 * GET   /api/avisos — la bandeja de la aplicación
 * PATCH /api/avisos — marcar como leídos
 *
 * La bandeja NO es un canal de entrega más. Es la vista dentro de la aplicación
 * de los mismos hechos que ya se entregan por push y por correo: "tu pedido fue
 * confirmado", "tu pedido está listo". Por eso no crea filas propias — lee las
 * que ya existen en `notificacion`.
 *
 * Se lee la fila del canal PUSH y no la de CORREO por una razón concreta: hay
 * exactamente una por hecho, mientras que mostrar las dos duplicaría cada aviso
 * en pantalla. El canal elegido es un detalle de implementación de esta vista,
 * no una decisión de producto — de ahí que `leidaEn` describa el HECHO ("lo
 * vio en la aplicación") y no la entrega.
 */
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { manejarError, ok } from "@/lib/http";

/** Cuánto se conserva a la vista. Más atrás ya es historial de pedidos. */
const DIAS = 30;

export async function GET() {
  try {
    const sesion = await exigirSesion();
    const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);

    const filas = await prisma.notificacion.findMany({
      where: {
        canal: "PUSH",
        creadaEn: { gte: desde },
        // El filtro de propiedad va por el pedido, no por `destinatario`: el
        // correo puede cambiar y una cadena no es una identidad.
        pedido: { usuarioId: sesion.usuarioId },
      },
      orderBy: { creadaEn: "desc" },
      take: 50,
      include: {
        pedido: {
          select: {
            id: true,
            codigo: true,
            estado: true,
            franja: {
              select: { inicio: true, comercio: { select: { nombre: true } } },
            },
          },
        },
      },
    });

    const avisos = filas
      .filter((n) => n.pedido !== null)
      .map((n) => ({
        id: n.id,
        tipo: n.tipo,
        creadaEn: n.creadaEn.toISOString(),
        leida: n.leidaEn !== null,
        pedidoId: n.pedido!.id,
        codigo: n.pedido!.codigo,
        estadoPedido: n.pedido!.estado,
        comercio: n.pedido!.franja.comercio.nombre,
        franjaInicio: n.pedido!.franja.inicio.toISOString(),
      }));

    return ok({
      avisos,
      sinLeer: avisos.filter((a) => !a.leida).length,
    });
  } catch (e) {
    return manejarError(e);
  }
}

/**
 * Marca como leídos. Sin cuerpo marca todos; con `{ id }` marca uno.
 *
 * `updateMany` con el usuario en el filtro, nunca `update` por id: si no, con
 * el id de un aviso ajeno se podría marcar como leído el de otra persona. No es
 * grave, pero es exactamente la clase de descuido que después aparece en un
 * endpoint donde sí importa.
 */
export async function PATCH(req: Request) {
  try {
    const sesion = await exigirSesion();

    let id: string | undefined;
    try {
      const cuerpo = await req.json();
      if (cuerpo && typeof cuerpo.id === "string") id = cuerpo.id;
    } catch {
      // Sin cuerpo: marcar todos. Es el caso normal, al abrir la bandeja.
    }

    const { count } = await prisma.notificacion.updateMany({
      where: {
        canal: "PUSH",
        leidaEn: null,
        pedido: { usuarioId: sesion.usuarioId },
        ...(id ? { id } : {}),
      },
      data: { leidaEn: new Date() },
    });

    return ok({ marcados: count });
  } catch (e) {
    return manejarError(e);
  }
}
