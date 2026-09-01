/**
 * POST /api/pedidos — creación con control de admisión.
 * GET  /api/pedidos — mis pedidos.
 *
 * La cabecera `Idempotency-Key` es OBLIGATORIA: sin ella, un doble clic o un
 * reintento tras timeout crearían dos pedidos. Exigirla en vez de generarla en
 * el servidor es lo que hace que el reintento sea reconocible como tal.
 */
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { reservar } from "@/core/reserva";
import { cuerpo, exigirLimite, fallo, manejarError, ok } from "@/lib/http";
import { esquemaPedido } from "@/lib/esquemas";

const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const sesion = await exigirSesion();

    const clave = req.headers.get("idempotency-key");
    if (!clave || !RE_UUID.test(clave)) {
      return fallo(
        "IDEMPOTENCY_KEY_REQUERIDA",
        "Se requiere la cabecera Idempotency-Key con un UUID v4",
        400,
      );
    }

    // Un reintento NO consume cuota nueva: la petición ya fue contada cuando se
    // envió la primera vez. Sin esta comprobación, un cliente con mala red podría
    // agotar su propio límite reintentando un pedido que ya existe, y recibir un
    // 429 por algo que sí se creó.
    const yaExiste = await prisma.pedido.findUnique({
      where: { idempotencyKey: clave },
      select: { id: true },
    });
    if (!yaExiste) {
      const limite = await exigirLimite("PEDIDO_POR_USUARIO", sesion.usuarioId);
      if (limite) return limite;
    }

    const datos = await cuerpo(req, esquemaPedido);

    const r = await reservar(prisma, {
      usuarioId: sesion.usuarioId,
      comercioId: datos.comercioId,
      franjaSolicitadaId: datos.franjaId,
      items: datos.items,
      idempotencyKey: clave,
      canalCaptacion: datos.canalCaptacion,
    });

    if (!r.admitido) {
      // 409, no 400: la solicitud es válida, el sistema no puede cumplirla
      // ahora. Y se devuelven alternativas — el sistema propone, no rechaza.
      return NextJsonNoAdmitido(r);
    }

    // 200 en el reintento y 201 en la creación real: el cliente distingue si
    // su POST creó algo o recuperó lo ya creado.
    return ok(
      {
        pedidoId: r.pedidoId,
        codigo: r.codigo,
        franjaId: r.franjaId,
        franjaInicio: r.franjaInicio.toISOString(),
        franjaFin: r.franjaFin.toISOString(),
        cargaEstimadaMin: r.cargaEstimadaMin,
        total: r.total,
        reintento: r.reintento,
      },
      r.reintento ? 200 : 201,
    );
  } catch (e) {
    return manejarError(e, req);
  }
}

function NextJsonNoAdmitido(r: {
  motivo: string;
  detalle?: string;
  alternativas: { franjaId: string; inicio: Date; fin: Date; holguraMin: number; sugerida: boolean }[];
}) {
  const mensajes: Record<string, string> = {
    SIN_FRANJA_DISPONIBLE: "Esa franja ya se llenó. Te proponemos otras.",
    FUERA_DE_CUTOFF: "Ya no da tiempo de prepararlo para esa hora.",
    COMERCIO_NO_DISPONIBLE:
      "El comercio dejó de recibir pedidos mientras armabas el tuyo. Tu carrito queda guardado; probá en unos minutos.",
    // Accionable: el estudiante no puede resolver esto eligiendo otra hora,
    // así que hay que decirle qué SÍ lo resuelve.
    LIMITE_PEDIDOS_ACTIVOS:
      "Ya tenés el máximo de pedidos activos en este comercio. Retirá o cancelá uno desde «Mis pedidos» para poder pedir otro.",
    PRODUCTO_NO_ELEGIBLE:
      "Un producto del pedido dejó de admitir pedido anticipado. Quitalo del carrito y volvé a intentar.",
    FRANJA_INEXISTENTE: "La franja seleccionada no existe.",
    PEDIDO_VACIO: "El pedido no tiene productos.",
    CANTIDAD_INVALIDA: "Alguna cantidad no es válida.",
    CARGA_EXCEDE_CAPACIDAD_TOTAL: "El pedido excede la capacidad de una franja.",
    // Los dos de idempotencia no se resuelven eligiendo otra hora, así que NO
    // pueden abrir la hoja de "franja agotada" (la regla que dejó el 409 que
    // decía "no hay hora"). Se dice qué pasó y qué lo resuelve: empezar de nuevo.
    IDEMPOTENCIA_EN_CONFLICTO:
      "Este pedido llegó con la marca de otro pedido distinto. Volvé al carrito y confirmalo de nuevo para no arriesgar un código de retiro equivocado.",
    IDEMPOTENCIA_AJENA:
      "Esta solicitud no corresponde a tu cuenta. Volvé al carrito y confirmá el pedido de nuevo.",
  };
  return fallo(
    r.motivo,
    mensajes[r.motivo] ?? "No fue posible admitir el pedido",
    409,
    {
      alternativas: r.alternativas.map((a) => ({
        franjaId: a.franjaId,
        inicio: a.inicio.toISOString(),
        fin: a.fin.toISOString(),
        holguraMin: Math.floor(a.holguraMin),
        sugerida: a.sugerida,
      })),
    },
  );
}

export async function GET() {
  try {
    const sesion = await exigirSesion();
    const pedidos = await prisma.pedido.findMany({
      // Filtro por dueño: la lista nunca puede devolver pedidos ajenos.
      where: { usuarioId: sesion.usuarioId },
      orderBy: { creadoEn: "desc" },
      take: 50,
      include: {
        items: true,
        franja: {
          include: {
            comercio: {
              select: { nombre: true, slug: true, ubicacion: true },
            },
          },
        },
      },
    });

    return ok({
      pedidos: pedidos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        estado: p.estado,
        cumplimiento: p.cumplimiento,
        total: String(p.total),
        creadoEn: p.creadoEn.toISOString(),
        listoEn: p.listoEn?.toISOString() ?? null,
        retiradoEn: p.retiradoEn?.toISOString() ?? null,
        comercio: p.franja.comercio.nombre,
        // La primera pregunta del estudiante con un pedido en curso es "¿dónde
        // voy?", y hasta ahora la tarjeta no la respondía: sabía el nombre del
        // comercio pero no dónde queda.
        comercioUbicacion: p.franja.comercio.ubicacion,
        // El slug y los `productoId` son lo que hace posible "pedir lo mismo":
        // sin ellos la lista solo sirve para mirar, y rehacer un pedido
        // habitual obliga a recorrer el menú entero otra vez.
        comercioSlug: p.franja.comercio.slug,
        franjaInicio: p.franja.inicio.toISOString(),
        franjaFin: p.franja.fin.toISOString(),
        items: p.items.map((i) => ({
          productoId: i.productoId,
          nombre: i.nombreProducto,
          cantidad: i.cantidad,
          precioUnitario: String(i.precioUnitario),
          subtotal: String(i.subtotal),
        })),
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}
