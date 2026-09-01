/**
 * TURNO — Ciclo de vida del pedido con liberación de capacidad.
 *
 * La cancelación es el invariante de admisión leído al revés: si al cancelar se
 * devuelve la carga a la franja sin control, dos cancelaciones simultáneas del
 * mismo pedido decrementan dos veces y dejan capacidad fantasma — sobreventa por
 * la puerta de atrás. Por eso la liberación exige, en la misma transacción:
 *
 *   1. lock de la fila del pedido  (evita la doble transición)
 *   2. bandera `capacidadLiberada` (evita el doble decremento aun con lock)
 *   3. lock de la fila de la franja (serializa contra admisiones concurrentes)
 */

import type { PrismaClient } from "@/generated/prisma/client";
import {
  correspondeNoShow,
  evaluarCumplimiento,
  exigirTransicion,
  puedeCancelar,
  TransicionInvalida,
  type Cumplimiento,
  type EstadoPedido,
} from "./estados";

export type Actor = "USUARIO" | "COMERCIO" | "ADMIN" | "SISTEMA";

export interface CambioEstado {
  pedidoId: string;
  hacia: EstadoPedido;
  actor: Actor;
  actorId?: string | null;
  nota?: string;
  ahora?: Date;
}

export interface ResultadoCambio {
  pedidoId: string;
  desde: EstadoPedido;
  hacia: EstadoPedido;
  cumplimiento: Cumplimiento;
  capacidadLiberadaMin: number;
}

export class CancelacionNoPermitida extends Error {
  constructor(estado: EstadoPedido, actor: Actor) {
    super(`Un actor ${actor} no puede cancelar un pedido en estado ${estado}`);
    this.name = "CancelacionNoPermitida";
  }
}

/**
 * Aplica una transición de estado. Único punto de escritura del estado del
 * pedido en todo el sistema: si algún endpoint escribe `estado` directamente,
 * la máquina de estados deja de ser una garantía y pasa a ser una sugerencia.
 */
export async function cambiarEstado(
  prisma: PrismaClient,
  cambio: CambioEstado,
): Promise<ResultadoCambio> {
  const ahora = cambio.ahora ?? new Date();

  return prisma.$transaction(
    async (tx) => {
      // Lock de la fila del pedido: dos transiciones simultáneas se serializan.
      const filas = await tx.$queryRaw<
        {
          id: string;
          estado: EstadoPedido;
          franjaId: string;
          cargaEstimadaMin: number;
          listoEn: Date | null;
          capacidadLiberada: boolean;
        }[]
      >`
        SELECT id, estado, "franjaId", "cargaEstimadaMin", "listoEn",
               "capacidadLiberada"
        FROM pedido WHERE id = ${cambio.pedidoId}::uuid
        FOR UPDATE
      `;
      const pedido = filas[0];
      if (!pedido) throw new Error(`Pedido inexistente: ${cambio.pedidoId}`);

      const desde = pedido.estado;

      if (cambio.hacia === "CANCELADO" && cambio.actor !== "SISTEMA") {
        if (!puedeCancelar(desde, cambio.actor)) {
          throw new CancelacionNoPermitida(desde, cambio.actor);
        }
      }
      exigirTransicion(desde, cambio.hacia);

      const franja = await tx.franja.findUniqueOrThrow({
        where: { id: pedido.franjaId },
      });

      const listoEn =
        cambio.hacia === "LISTO" ? ahora : (pedido.listoEn ?? null);

      const cumplimiento = evaluarCumplimiento({
        estado: cambio.hacia,
        listoEn,
        finFranja: franja.fin,
        ahora,
      });

      // --- Liberación de capacidad ---------------------------------------
      // Solo al cancelar, y solo una vez. NO_SHOW no libera: la cocina ya
      // consumió los minutos, el pedido existe físicamente. Confundirlos
      // inflaría artificialmente la capacidad disponible del comercio.
      let liberada = 0;
      if (cambio.hacia === "CANCELADO" && !pedido.capacidadLiberada) {
        await tx.$queryRaw`
          SELECT id FROM franja WHERE id = ${pedido.franjaId}::uuid FOR UPDATE
        `;
        liberada = pedido.cargaEstimadaMin;
        await tx.franja.update({
          where: { id: pedido.franjaId },
          data: { cargaAsignada: { decrement: liberada } },
        });
      }

      await tx.pedido.update({
        where: { id: pedido.id },
        data: {
          estado: cambio.hacia,
          cumplimiento,
          listoEn: cambio.hacia === "LISTO" ? ahora : undefined,
          retiradoEn: cambio.hacia === "RETIRADO" ? ahora : undefined,
          canceladoEn: cambio.hacia === "CANCELADO" ? ahora : undefined,
          capacidadLiberada: liberada > 0 ? true : undefined,
        },
      });

      await tx.eventoPedido.create({
        data: {
          pedidoId: pedido.id,
          estado: cambio.hacia,
          timestamp: ahora,
          actorId: cambio.actorId ?? null,
          nota: cambio.nota,
        },
      });

      if (cambio.hacia === "LISTO") {
        const p = await tx.pedido.findUniqueOrThrow({
          where: { id: pedido.id },
          include: { usuario: true },
        });
        // Bandeja de salida: la notificación se entrega después. El unique
        // (pedidoId, tipo) hace que un reintento no duplique el correo.
        // Solo push: ver la nota en `core/reserva.ts`. El correo se reserva
        // para el enlace de acceso, que es el único aviso que tiene que llegar
        // antes de que exista un navegador con permiso para notificar.
        await tx.notificacion.upsert({
          where: {
            pedidoId_tipo_canal: {
              pedidoId: pedido.id,
              tipo: "PEDIDO_LISTO",
              canal: "PUSH",
            },
          },
          update: {},
          create: {
            pedidoId: pedido.id,
            destinatario: p.usuario.correo,
            tipo: "PEDIDO_LISTO",
            canal: "PUSH",
          },
        });
      }

      return {
        pedidoId: pedido.id,
        desde,
        hacia: cambio.hacia,
        cumplimiento,
        capacidadLiberadaMin: liberada,
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}

/**
 * Barrido de mantenimiento: marca NO_SHOW y recalcula cumplimiento vencido.
 * Se ejecuta desde un cron; es idempotente por construcción, así que correrlo
 * dos veces no cambia el resultado.
 */
export async function barrerVencidos(
  prisma: PrismaClient,
  ahora = new Date(),
): Promise<{ noShow: number; incumplidos: number }> {
  const listos = await prisma.pedido.findMany({
    where: { estado: "LISTO" },
    select: { id: true, listoEn: true, franja: { select: { fin: true } } },
  });

  let noShow = 0;
  for (const p of listos) {
    const comercio = await prisma.pedido.findUniqueOrThrow({
      where: { id: p.id },
      select: { franja: { select: { comercio: { select: { minutosNoShow: true } } } } },
    });
    const corresponde = correspondeNoShow({
      estado: "LISTO",
      listoEn: p.listoEn,
      minutosNoShow: comercio.franja.comercio.minutosNoShow,
      ahora,
    });
    if (!corresponde) continue;
    try {
      await cambiarEstado(prisma, {
        pedidoId: p.id,
        hacia: "NO_SHOW",
        actor: "SISTEMA",
        nota: "Barrido automático",
        ahora,
      });
      noShow++;
    } catch (e) {
      // Otro proceso lo transicionó primero: es el resultado esperado, no un error.
      if (!(e instanceof TransicionInvalida)) throw e;
    }
  }

  // Pedidos cuya franja ya venció y todavía no están listos: incumplidos.
  const vencidos = await prisma.pedido.findMany({
    where: {
      estado: { in: ["RECIBIDO", "EN_PREPARACION"] },
      cumplimiento: "PENDIENTE",
      franja: { fin: { lt: ahora } },
    },
    select: { id: true },
  });
  if (vencidos.length > 0) {
    await prisma.pedido.updateMany({
      where: { id: { in: vencidos.map((v) => v.id) } },
      data: { cumplimiento: "INCUMPLIDO" },
    });
  }

  return { noShow, incumplidos: vencidos.length };
}
