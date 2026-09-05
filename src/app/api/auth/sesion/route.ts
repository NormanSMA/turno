/** GET /api/auth/sesion — quién soy. DELETE — cerrar sesión. */
import { cookies } from "next/headers";
import { cerrarSesion, COOKIE_SESION, sesionActual } from "@/lib/auth";
import { manejarError, ok } from "@/lib/http";

export async function GET() {
  try {
    const s = await sesionActual();
    if (!s) return ok({ autenticado: false });
    return ok({
      autenticado: true,
      usuario: {
        id: s.usuarioId,
        correo: s.correo,
        // Va en la sesión y no en una petición aparte: el saludo de la portada
        // lo necesita en el primer render, y el punto 25 de la auditoría
        // redujo justamente este tipo de viajes repetidos.
        nombre: s.nombre,
        rol: s.rol,
        comercioId: s.comercioId,
        // El slug es lo que permite construir /cocina/... y /comercio/...
        comercioSlug: s.comercioSlug,
        // La condición experimental se expone para que la UI aplique la
        // variante A o B; el servidor es quien la decidió y la persiste.
        condicion: s.condicionExperimental,
      },
    });
  } catch (e) {
    return manejarError(e);
  }
}

export async function DELETE() {
  try {
    const s = await sesionActual();
    if (s) await cerrarSesion(s.sesionId);
    const almacen = await cookies();
    almacen.delete(COOKIE_SESION);
    return ok({ autenticado: false });
  } catch (e) {
    return manejarError(e);
  }
}
