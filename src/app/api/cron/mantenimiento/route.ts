/**
 * POST /api/cron/mantenimiento — barrido periódico.
 *
 * Hace seis cosas, todas idempotentes: marca NO_SHOW, recalcula cumplimiento
 * vencido, vacía la bandeja de correo pendiente, reintenta los avisos push que
 * la entrega inmediata no logró, purga contadores de límite y borra
 * credenciales vencidas.
 *
 * Es además el LATIDO del despliegue (ADR-18): el proveedor de base de datos
 * gratuito suspende un proyecto que pasa demasiado tiempo sin consultas, y esta
 * invocación diaria es la que garantiza que eso no ocurra durante un receso
 * académico. Se protege con un secreto compartido
 * porque un cron no tiene sesión; sin él, cualquiera podría dispararlo.
 */
import { prisma } from "@/lib/db";
import { barrerVencidos } from "@/core/ciclo-vida";
import {
  purgarCredenciales,
  purgarLimites,
  purgarNotificaciones,
} from "@/core/limites";
import { vaciarBandeja } from "@/lib/correo";
import { vaciarBandejaPush } from "@/lib/push";
import { fallo, manejarError, ok } from "@/lib/http";
import { timingSafeEqual } from "node:crypto";

function secretoValido(req: Request): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  const recibido =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * El programador de Vercel invoca por GET y adjunta
 * `Authorization: Bearer $CRON_SECRET` automáticamente. Se aceptan los dos
 * métodos con la misma lógica: sin el GET, el cron del despliegue devolvería
 * 405 en silencio y el barrido nunca correría — nadie se enteraría hasta que
 * los NO_SHOW no aparecieran en el análisis.
 */
export async function GET(req: Request) {
  return ejecutar(req);
}

export async function POST(req: Request) {
  return ejecutar(req);
}

async function ejecutar(req: Request) {
  try {
    if (!secretoValido(req)) {
      return fallo("NO_AUTORIZADO", "Secreto de cron inválido", 401);
    }
    // En SERIE a propósito, aunque un analizador estático sugiera paralelizar:
    // el barrido puede dejar pedidos en un estado que genera notificaciones, y
    // vaciar la bandeja antes de que termine dejaría esos correos para la
    // corrida siguiente. Diez minutos de retraso en un aviso de "tu pedido está
    // listo" lo vuelve inútil.
    const barrido = await barrerVencidos(prisma);
    const correo = await vaciarBandeja(prisma);
    // Red de seguridad, no camino principal: el aviso push se entrega en el
    // momento del cambio de estado. Acá solo cae lo que falló entonces.
    const push = await vaciarBandejaPush(prisma);
    const limitesPurgados = await purgarLimites(prisma);
    const credenciales = await purgarCredenciales(prisma);
    // Retención: se van los avisos ya resueltos y viejos, que son operativos.
    // Los pedidos y sus eventos se quedan — son la evidencia del piloto, y son
    // justamente lo que más pesa. Ver `purgarNotificaciones`.
    const avisosPurgados = await purgarNotificaciones(prisma);
    return ok({
      ...barrido,
      correo,
      push,
      limitesPurgados,
      credenciales,
      avisosPurgados,
    });
  } catch (e) {
    return manejarError(e);
  }
}
