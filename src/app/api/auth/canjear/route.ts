/** POST /api/auth/canjear — cambia el enlace mágico por una sesión. */
import { cookies } from "next/headers";
import { canjearEnlace, COOKIE_SESION, opcionesCookie } from "@/lib/auth";
import { cuerpo, exigirLimite, fallo, ipDe, manejarError, ok } from "@/lib/http";
import { esquemaCanje } from "@/lib/esquemas";

export async function POST(req: Request) {
  try {
    const limite = await exigirLimite("CANJE_POR_IP", ipDe(req));
    if (limite) return limite;

    const { token } = await cuerpo(req, esquemaCanje);
    const r = await canjearEnlace(token, req.headers.get("user-agent"));

    if (!r.ok) {
      // Mismo status para inexistente / expirado / usado: distinguirlos daría
      // un oráculo para saber si un token existió alguna vez.
      return fallo(
        "ENLACE_INVALIDO",
        "El enlace no es válido o ya fue usado. Pedí uno nuevo.",
        401,
      );
    }

    const almacen = await cookies();
    almacen.set(COOKIE_SESION, r.token, opcionesCookie(r.expiraEn));
    return ok({ autenticado: true });
  } catch (e) {
    return manejarError(e);
  }
}
