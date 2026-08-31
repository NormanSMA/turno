/**
 * PUT    /api/comercios/:slug/productos/:id/imagen — subir o reemplazar la foto
 * DELETE /api/comercios/:slug/productos/:id/imagen — quitarla
 *
 * El navegador ya convirtió a WebP y redujo el tamaño, pero **el servidor no
 * confía en eso**: la conversión en el cliente es una optimización de red, no
 * un control. Acá se valida el tipo declarado, el tamaño real y la FIRMA del
 * archivo, porque un `Content-Type` lo escribe quien envía.
 */
import { prisma } from "@/lib/db";
import { exigirComercioPorSlug, NoAutorizado } from "@/lib/auth";
import { fallo, manejarError, ok } from "@/lib/http";

/** 600 KB. Un WebP de 1200 px de lado ronda los 60-120 KB; esto es holgado. */
const MAX_BYTES = 600 * 1024;

/**
 * ¿Es realmente un WebP?
 *
 * Los primeros doce bytes de un archivo WebP son `RIFF` + tamaño + `WEBP`.
 * Comprobarlo evita guardar cualquier cosa a la que alguien le puso el
 * `Content-Type` correcto: un SVG con scripts servido después desde nuestro
 * propio origen sería un XSS almacenado.
 */
function esWebp(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const t = (i: number, s: string) =>
    String.fromCharCode(...b.slice(i, i + s.length)) === s;
  return t(0, "RIFF") && t(8, "WEBP");
}

/** El producto tiene que ser del comercio de la sesión. */
async function exigirProductoPropio(slug: string, productoId: string) {
  const { comercio } = await exigirComercioPorSlug(slug);
  const producto = await prisma.producto.findUnique({
    where: { id: productoId },
  });
  // Mismo error para "no existe" y "es de otro": responder distinto convertiría
  // el endpoint en un oráculo del catálogo ajeno.
  if (!producto || producto.comercioId !== comercio.id) {
    throw new NoAutorizado("Producto inexistente o ajeno");
  }
  return producto;
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await ctx.params;
    const producto = await exigirProductoPropio(slug, id);

    const bytes = new Uint8Array(await req.arrayBuffer());

    if (bytes.length === 0) {
      return fallo("IMAGEN_VACIA", "No llegó ninguna imagen", 400);
    }
    if (bytes.length > MAX_BYTES) {
      return fallo(
        "IMAGEN_GRANDE",
        `La imagen pesa ${Math.round(bytes.length / 1024)} KB y el máximo es ${MAX_BYTES / 1024} KB`,
        413,
      );
    }
    if (!esWebp(bytes)) {
      return fallo(
        "IMAGEN_INVALIDA",
        "Solo se aceptan imágenes WebP. El navegador debería convertirla antes de enviarla.",
        415,
      );
    }

    const url = new URL(req.url);
    const ancho = Number(url.searchParams.get("ancho") ?? 0);
    const alto = Number(url.searchParams.get("alto") ?? 0);

    /*
     * Se BORRA y se crea, en vez de actualizar.
     *
     * Así la foto nueva estrena `id`, y como la URL lleva ese id, la que el
     * navegador tenía en caché deja de existir en lugar de quedar servida por
     * un año desde el disco del usuario. Es lo que permite cachear de forma
     * agresiva sin que una foto reemplazada se quede pegada.
     */
    const foto = await prisma.$transaction(async (tx) => {
      await tx.fotoProducto.deleteMany({ where: { productoId: producto.id } });
      return tx.fotoProducto.create({
        data: {
          productoId: producto.id,
          datos: Buffer.from(bytes),
          tipo: "image/webp",
          ancho: Number.isFinite(ancho) ? Math.max(0, Math.trunc(ancho)) : 0,
          alto: Number.isFinite(alto) ? Math.max(0, Math.trunc(alto)) : 0,
          bytes: bytes.length,
        },
      });
    });

    const imagenUrl = `/api/imagenes/${foto.id}`;
    await prisma.producto.update({
      where: { id: producto.id },
      data: { imagenUrl },
    });

    return ok({ imagenUrl, bytes: foto.bytes }, 201);
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await ctx.params;
    const producto = await exigirProductoPropio(slug, id);

    await prisma.$transaction(async (tx) => {
      await tx.fotoProducto.deleteMany({ where: { productoId: producto.id } });
      // `imagenUrl` vuelve a null: la interfaz dibuja el mosaico del nombre, que
      // se ve mejor que un hueco con un icono de imagen rota.
      await tx.producto.update({
        where: { id: producto.id },
        data: { imagenUrl: null },
      });
    });

    return ok({ quitada: true });
  } catch (e) {
    return manejarError(e);
  }
}
