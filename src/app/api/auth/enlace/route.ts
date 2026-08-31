/** POST /api/auth/enlace — emite el enlace mágico. */
import { emitirEnlace } from "@/lib/auth";
import { controladorActivo, correoEnlaceAcceso, enviarCorreo } from "@/lib/correo";
import { cuerpo, exigirLimite, ipDe, manejarError, ok } from "@/lib/http";
import { esquemaEnlace } from "@/lib/esquemas";

export async function POST(req: Request) {
  try {
    const datos = await cuerpo(req, esquemaEnlace);

    // Dos límites: por buzón (evita bombardear a un tercero) y por IP (evita
    // que un solo cliente enumere direcciones institucionales).
    const porIp = await exigirLimite("ENLACE_POR_IP", ipDe(req));
    if (porIp) return porIp;
    const porCorreo = await exigirLimite("ENLACE_POR_CORREO", datos.correo);
    if (porCorreo) return porCorreo;

    const { token, nuevo } = await emitirEnlace(datos.correo, datos);

    // El enlace se envía EN EL MOMENTO, no por la bandeja de salida: el token en
    // claro no se persiste nunca, así que no hay nada que un worker posterior
    // pueda recuperar para armar el correo.
    const envio = await enviarCorreo(
      correoEnlaceAcceso(datos.correo, token, datos.volver),
    );
    if (!envio.enviado) {
      console.error("[turno] no se pudo enviar el enlace:", envio.error);
    }

    // El token se devuelve SOLO fuera de producción y SOLO si no hay proveedor
    // de correo configurado. Con proveedor activo viaja nada más por el buzón,
    // incluso en desarrollo: si no, la prueba no verifica lo que va a producción.
    const mostrarToken =
      process.env.NODE_ENV !== "production" && controladorActivo() === "consola";

    return ok({
      enviado: envio.enviado,
      nuevo,
      mensaje: "Si el correo es institucional, recibirás un enlace de acceso.",
      ...(mostrarToken ? { tokenDesarrollo: token } : {}),
    });
  } catch (e) {
    // Un correo no institucional responde 403 con mensaje claro: no es un caso
    // a ocultar, es la regla de pertenencia declarada en el Capítulo III.
    return manejarError(e);
  }
}
