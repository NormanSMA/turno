/**
 * GET /api/imagenes/:id — sirve la foto de un producto.
 *
 * PÚBLICA a propósito: el menú se ve sin iniciar sesión (RF-04), así que sus
 * fotos también. No revela nada — el id es un UUID que no se puede adivinar y
 * no dice a qué producto ni a qué comercio pertenece.
 *
 * Se cachea por un año y como `immutable`. Es seguro porque la URL lleva el id
 * de la FOTO, no el del producto: subir una nueva crea otro id, así que la
 * anterior no se "actualiza" — se deja de referenciar. Esa es justamente la
 * razón por la que la subida borra y crea en vez de actualizar.
 */
import { prisma } from "@/lib/db";

const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // Se valida la forma antes de consultar: un id que no es UUID hace que
  // Postgres tire un error de tipo, y eso saldría como 500 en vez de 404.
  if (!RE_UUID.test(id)) return new Response(null, { status: 404 });

  const foto = await prisma.fotoProducto.findUnique({
    where: { id },
    select: { datos: true, tipo: true, bytes: true, creadaEn: true },
  });
  if (!foto) return new Response(null, { status: 404 });

  // El contenido es inmutable, así que el ETag puede ser el propio id. Un
  // cliente que ya la tiene no vuelve a bajar los bytes.
  const etag = `"${id}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(new Uint8Array(foto.datos), {
    status: 200,
    headers: {
      "Content-Type": foto.tipo,
      "Content-Length": String(foto.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
      // Sin esto, un navegador podría interpretar el contenido de otra forma si
      // el tipo declarado no coincidiera con lo que ve.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
