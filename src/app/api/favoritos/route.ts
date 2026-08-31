/**
 * GET / POST / DELETE /api/favoritos
 *
 *   - **Sigue a la persona, no al navegador**: por eso vive en la base.
 *   - **Marcar dos veces no es un error**: el corazón se toca doble, y `upsert`
 *     hace la operación idempotente sin clave de idempotencia.
 *
 * La lectura devuelve el producto entero: pedir nombre y precio aparte sería
 * una segunda vuelta para pintar una lista corta.
 */
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/auth";
import { cuerpo, manejarError, ok } from "@/lib/http";
import { z } from "zod";

const esquema = z.object({ productoId: z.string().uuid() });

export async function GET() {
  try {
    const sesion = await exigirSesion();

    const filas = await prisma.favorito.findMany({
      where: { usuarioId: sesion.usuarioId },
      orderBy: { creadoEn: "desc" },
      include: {
        producto: { include: { comercio: true } },
      },
    });

    return ok({
      favoritos: filas
        /*
         * Un producto archivado deja de existir para el estudiante, pero su
         * fila de favorito sigue ahí. Mostrarlo llevaría a una tarjeta que no
         * se puede pedir; borrarlo en silencio perdería la marca si el comercio
         * lo vuelve a activar. Se filtra al leer y la fila se conserva.
         */
        .filter((f) => !f.producto.archivado)
        .map((f) => ({
          id: f.producto.id,
          nombre: f.producto.nombre,
          descripcion: f.producto.descripcion,
          imagenUrl: f.producto.imagenUrl,
          precio: String(f.producto.precio),
          minutos: f.producto.tiempoPreparacionMin,
          anticipable: f.producto.anticipable,
          disponible: f.producto.disponible,
          comercio: f.producto.comercio.nombre,
          comercioSlug: f.producto.comercio.slug,
          comercioUbicacion: f.producto.comercio.ubicacion,
          comercioAbierto: f.producto.comercio.estadoOperacion === "ABIERTO",
        })),
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function POST(req: Request) {
  try {
    const sesion = await exigirSesion();
    const { productoId } = await cuerpo(req, esquema);

    // `upsert` y no `create`: tocar dos veces el corazón no es un error del
    // usuario, y devolverle un conflicto por eso sería castigar un doble toque.
    await prisma.favorito.upsert({
      where: { usuarioId_productoId: { usuarioId: sesion.usuarioId, productoId } },
      create: { usuarioId: sesion.usuarioId, productoId },
      update: {},
    });

    return ok({ marcado: true });
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const sesion = await exigirSesion();
    const { productoId } = await cuerpo(req, esquema);

    // `deleteMany` en vez de `delete`: desmarcar algo que ya no estaba marcado
    // es el resultado que el usuario pidió, no un 404.
    await prisma.favorito.deleteMany({
      where: { usuarioId: sesion.usuarioId, productoId },
    });

    return ok({ marcado: false });
  } catch (e) {
    return manejarError(e);
  }
}
