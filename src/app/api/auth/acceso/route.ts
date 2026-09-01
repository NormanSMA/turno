/**
 * POST /api/auth/acceso — entrada con usuario y contraseña.
 * Solo para cuentas de operación (COMERCIO / ADMIN); ver ADR-08.
 */
import { cookies } from "next/headers";
import { z } from "zod";
import {
  accederConCredenciales,
  COOKIE_SESION,
  opcionesCookie,
} from "@/lib/auth";
import { cuerpo, exigirLimite, fallo, ipDe, manejarError, ok } from "@/lib/http";

const esquema = z.object({
  correo: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const datos = await cuerpo(req, esquema);

    // Dos límites: por IP corta el barrido, por cuenta corta el ataque dirigido
    // contra una cuenta concreta desde muchas IP.
    const porIp = await exigirLimite("ACCESO_POR_IP", ipDe(req));
    if (porIp) return porIp;
    const porCuenta = await exigirLimite("ACCESO_POR_CUENTA", datos.correo);
    if (porCuenta) return porCuenta;

    const r = await accederConCredenciales(
      datos.correo,
      datos.password,
      req.headers.get("user-agent"),
    );

    if (!r.ok) {
      // Un solo mensaje para cuenta inexistente, rol equivocado y contraseña
      // incorrecta: cualquier distinción convierte el endpoint en un oráculo
      // para averiguar qué correos son cuentas de operación.
      return fallo(
        "CREDENCIALES_INVALIDAS",
        "Usuario o contraseña incorrectos",
        401,
      );
    }

    const almacen = await cookies();
    almacen.set(COOKIE_SESION, r.token, opcionesCookie(r.expiraEn));
    return ok({
      autenticado: true,
      rol: r.rol,
      debeCambiarPassword: r.debeCambiarPassword,
    });
  } catch (e) {
    return manejarError(e, req);
  }
}
