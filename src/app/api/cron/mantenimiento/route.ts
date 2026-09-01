/**
 * Mantenimiento periódico: barrido de vencidos, bandeja de salida y purgas.
 *
 * **Se dispara desde DOS relojes, y no es redundancia.**
 *
 * El `vercel.json` declara una ejecución **diaria**, porque el plan Hobby no
 * admite más: un cron cada diez minutos hace fallar el despliegue entero. Esa
 * corrida diaria es la red de seguridad — garantiza que nada se quede sin
 * atender aunque todo lo demás falle.
 *
 * La cadencia real la marca un **disparador externo** que llama a esta misma
 * ruta con el secreto en la cabecera. Eso tiene dos ventajas sobre el cron de
 * la plataforma, más allá de esquivar el límite del plan:
 *
 *  - **Se puede acotar al horario del campus.** Neon duerme a los cinco
 *    minutos de inactividad y el plan gratuito da 100 CU-hours al mes; un cron
 *    cada diez minutos las veinticuatro horas mantendría la base despierta
 *    siempre y se comería el mes. De madrugada no hay pedidos que barrer.
 *  - **No ata la operación al proveedor de hosting.** Mover el despliegue no
 *    obliga a rehacer la programación.
 *
 * Es idempotente: correrla de más no hace daño, correrla de menos sí — un
 * pedido vencido que nadie barre sigue ocupando capacidad de una franja.
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
    return manejarError(e, req);
  }
}
