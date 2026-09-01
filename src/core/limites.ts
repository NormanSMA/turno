/**
 * TURNO — Limitación de tasa.
 *
 * Persistida en PostgreSQL, no en memoria: en serverless cada invocación puede
 * caer en una instancia distinta, así que un contador en RAM no limita nada —
 * daría una sensación de control sin control. El costo es una escritura por
 * petición sobre una tabla diminuta con clave primaria; es aceptable para la
 * escala del piloto y honesto sobre lo que garantiza.
 *
 * Algoritmo: ventana fija. Más simple que ventana deslizante y suficiente para
 * el objetivo real, que es evitar el abuso del correo transaccional y la
 * enumeración de cuentas — no defenderse de un ataque distribuido.
 */

import type { PrismaClient } from "@/generated/prisma/client";

export interface PoliticaLimite {
  /** Peticiones permitidas dentro de la ventana. */
  maximo: number;
  /** Ancho de la ventana en segundos. */
  ventanaSeg: number;
}

/** Políticas por acción. El envío de enlaces es el más estricto: cuesta dinero
 *  y molesta a un tercero (el dueño del buzón). */
export const POLITICAS = {
  ENLACE_POR_CORREO: { maximo: 3, ventanaSeg: 900 },
  ENLACE_POR_IP: { maximo: 10, ventanaSeg: 900 },
  PEDIDO_POR_USUARIO: { maximo: 20, ventanaSeg: 300 },
  CANJE_POR_IP: { maximo: 20, ventanaSeg: 900 },
  /// Acceso con contraseña: más estricto por cuenta que por IP, porque el
  /// ataque que importa acá es la fuerza bruta contra una cuenta conocida.
  ACCESO_POR_CUENTA: { maximo: 8, ventanaSeg: 900 },
  ACCESO_POR_IP: { maximo: 30, ventanaSeg: 900 },
} as const satisfies Record<string, PoliticaLimite>;

export type AccionLimitada = keyof typeof POLITICAS;

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  reiniciaEn: Date;
}

function inicioVentana(ahora: Date, ventanaSeg: number): Date {
  const ms = ventanaSeg * 1000;
  return new Date(Math.floor(ahora.getTime() / ms) * ms);
}

/**
 * Consume una unidad del cupo. Devuelve si la petición procede.
 *
 * El upsert con `increment` es atómico en PostgreSQL, así que dos peticiones
 * concurrentes no se pisan el contador — que es justo el caso que un atacante
 * provocaría a propósito.
 */
export async function consumirLimite(
  prisma: PrismaClient,
  accion: AccionLimitada,
  identificador: string,
  ahora = new Date(),
): Promise<ResultadoLimite> {
  const politica = POLITICAS[accion];
  const ventanaEn = inicioVentana(ahora, politica.ventanaSeg);
  const clave = `${accion}:${identificador}:${ventanaEn.toISOString()}`;

  const fila = await prisma.contadorLimite.upsert({
    where: { clave },
    create: { clave, ventanaEn, conteo: 1 },
    update: { conteo: { increment: 1 } },
  });

  const reiniciaEn = new Date(ventanaEn.getTime() + politica.ventanaSeg * 1000);
  return {
    permitido: fila.conteo <= politica.maximo,
    restantes: Math.max(0, politica.maximo - fila.conteo),
    reiniciaEn,
  };
}

/** Purga de ventanas viejas. Se llama desde el cron de mantenimiento. */
export async function purgarLimites(
  prisma: PrismaClient,
  ahora = new Date(),
): Promise<number> {
  const corte = new Date(ahora.getTime() - 24 * 3600 * 1000);
  const r = await prisma.contadorLimite.deleteMany({
    where: { ventanaEn: { lt: corte } },
  });
  return r.count;
}

/**
 * Purga de credenciales vencidas.
 *
 * Un token de acceso usado o vencido no sirve para nada y sigue guardando el
 * vínculo con un usuario. Lo mismo una sesión expirada. Conservarlos no aporta
 * al análisis —la instrumentación del Capítulo V vive en `pedido` y
 * `evento_pedido`, no acá— y sí aumenta lo que se pierde en una filtración.
 * Minimización de datos, que es lo que §13.2 se compromete a hacer.
 */
export async function purgarCredenciales(
  prisma: PrismaClient,
  ahora = new Date(),
): Promise<{ tokens: number; sesiones: number }> {
  // Margen de un día sobre el vencimiento: si algo salió mal con los relojes,
  // no se borra una credencial que todavía podría estar en uso.
  const corte = new Date(ahora.getTime() - 86_400_000);

  const tokens = await prisma.tokenAcceso.deleteMany({
    where: { OR: [{ expiraEn: { lt: corte } }, { usadoEn: { lt: corte } }] },
  });
  const sesiones = await prisma.sesion.deleteMany({
    where: { OR: [{ expiraEn: { lt: corte } }, { revocadaEn: { lt: corte } }] },
  });

  return { tokens: tokens.count, sesiones: sesiones.count };
}

/**
 * Purga de la bandeja de avisos ya resuelta.
 *
 * **Qué se borra y qué no, y por qué la diferencia importa.**
 *
 * Una notificación entregada hace tres meses no le sirve a nadie: el aviso
 * "tu pedido está listo" caducó el mismo día. Pero su `payload` es JSON y la
 * tabla crece con cada pedido, así que conservarla cuesta espacio real contra
 * un techo que existe (512 MB en el plan gratuito de Neon).
 *
 * **Los pedidos y sus eventos NO se purgan**, aunque sean lo que más pesa.
 * Son la evidencia del piloto: el análisis A/B, el cumplimiento por día y la
 * carga por franja se calculan sobre ellos, y el panel exporta el CSV crudo
 * justo para que un tercero pueda rehacer las cuentas. Borrarlos a los noventa
 * días sería destruir el resultado del trabajo para ahorrar unos megabytes.
 * Cuando el volumen apriete —a 12 MB por mes de piloto, eso es algo más de un
 * año—, lo que corresponde es archivar fuera de la base, no eliminar.
 *
 * Solo se tocan las que ya llegaron a un estado final. Una PENDIENTE o una
 * ENVIANDO todavía tiene trabajo por delante, por vieja que sea.
 */
export async function purgarNotificaciones(
  prisma: PrismaClient,
  ahora = new Date(),
  dias = 90,
): Promise<number> {
  const corte = new Date(ahora.getTime() - dias * 86_400_000);
  const r = await prisma.notificacion.deleteMany({
    where: {
      creadaEn: { lt: corte },
      estado: { in: ["ENVIADA", "FALLIDA"] },
    },
  });
  return r.count;
}
