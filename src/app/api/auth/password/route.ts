/** PATCH /api/auth/password — cambio de contraseña por el propio usuario. */
import { z } from "zod";
import { cambiarPassword, exigirRol } from "@/lib/auth";
import { cuerpo, fallo, manejarError, ok } from "@/lib/http";

const esquema = z.object({
  actual: z.string().min(1).max(200),
  nueva: z.string().min(1).max(200),
});

export async function PATCH(req: Request) {
  try {
    const sesion = await exigirRol("COMERCIO", "ADMIN");
    const { actual, nueva } = await cuerpo(req, esquema);

    const r = await cambiarPassword(sesion.usuarioId, actual, nueva, sesion.sesionId);
    if (!r.ok) return fallo("PASSWORD_INVALIDA", r.motivo!, 400);

    // La sesión actual sigue viva; las demás quedaron cerradas. Se devuelve el
    // destino para que la interfaz continúe en vez de mandar al login.
    return ok({
      cambiada: true,
      destino: sesion.rol === "ADMIN" ? "/panel" : "/cocina",
    });
  } catch (e) {
    return manejarError(e, req);
  }
}
