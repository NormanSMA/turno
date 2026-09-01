/**
 * TURNO — Reserva de franja con control transaccional (ADR-03).
 *
 * Cuatro clases de conflicto concurrente, todas atendidas acá:
 *
 *   Nivel 1 — dos usuarios por la última plaza de una franja  → SELECT FOR UPDATE
 *   Nivel 2 — un producto se agota mientras se pide           → relectura bajo lock
 *   Nivel 3 — el mismo usuario envía el pedido dos veces      → idempotencyKey
 *   Nivel 4 — el comercio cambia precio/t(p) durante la compra→ snapshot en el item
 *
 * Criterio verificable — indicador 9 (§14.5): CERO sobreventas bajo reservas
 * simultáneas, es decir carga_asignada ≤ α · C(f) siempre, para toda franja.
 */

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  cabeEnFranja,
  calcularOpcionesConCutoff,
  pasoCutoff,
  tiempoPreparacionMaximo,
  validarPedido,
  type CondicionExperimental,
  type FranjaCapacidad,
  type LineaPedido,
  type OpcionFranja,
  type ParametrosComercio,
  type MotivoRechazo,
} from "./admision";
import { ESTADOS_ACTIVOS } from "./estados";

export interface SolicitudPedido {
  usuarioId: string;
  comercioId: string;
  franjaSolicitadaId: string;
  items: { productoId: string; cantidad: number }[];
  /** Clave de reintento del cliente. Dos POST con la misma clave = un pedido. */
  idempotencyKey: string;
  canalCaptacion?: string | null;
  /** Inyectable para que las pruebas y el simulador controlen el reloj. */
  ahora?: Date;
}

export type MotivoNoAdmitido =
  | MotivoRechazo
  | "SIN_FRANJA_DISPONIBLE"
  | "FRANJA_INEXISTENTE"
  | "FUERA_DE_CUTOFF"
  | "COMERCIO_NO_DISPONIBLE"
  | "LIMITE_PEDIDOS_ACTIVOS"
  | "IDEMPOTENCIA_AJENA"
  | "IDEMPOTENCIA_EN_CONFLICTO";

export interface PedidoAdmitido {
  admitido: true;
  pedidoId: string;
  codigo: string;
  franjaId: string;
  franjaInicio: Date;
  franjaFin: Date;
  cargaEstimadaMin: number;
  total: string;
  /** true si este resultado vino de una clave repetida y no creó nada nuevo. */
  reintento: boolean;
}

export interface PedidoNoAdmitido {
  admitido: false;
  motivo: MotivoNoAdmitido;
  detalle?: string;
  /** franjas alternativas con espacio — el sistema propone, no rechaza (§6.1) */
  alternativas: OpcionFranja[];
}

export type ResultadoReserva = PedidoAdmitido | PedidoNoAdmitido;

const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function codigoRetiro(): string {
  // Código corto legible en el mostrador. Sin ambigüedad visual (0/O, 1/I).
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALFABETO_CODIGO[b % ALFABETO_CODIGO.length];
  return s.slice(0, 3) + "-" + s.slice(3);
}

interface FilaFranjaBloqueada {
  id: string;
  inicio: Date;
  fin: Date;
  capacidad_minutos: number;
  carga_asignada: number;
  abierta: boolean;
}

interface FilaProducto {
  id: string;
  nombre: string;
  precio: string;
  tiempoPreparacionMin: number;
  anticipable: boolean;
  disponible: boolean;
}

function aPedidoAdmitido(p: {
  id: string;
  codigo: string;
  franjaId: string;
  cargaEstimadaMin: number;
  total: unknown;
  franja: { inicio: Date; fin: Date };
}): PedidoAdmitido {
  return {
    admitido: true,
    pedidoId: p.id,
    codigo: p.codigo,
    franjaId: p.franjaId,
    franjaInicio: p.franja.inicio,
    franjaFin: p.franja.fin,
    cargaEstimadaMin: p.cargaEstimadaMin,
    total: String(p.total),
    reintento: true,
  };
}

/**
 * Huella de lo que NO puede cambiar entre dos envíos con la misma clave.
 *
 * Lleva el comercio y las líneas; **no lleva la franja**, y esa ausencia es
 * deliberada. La regla que dejó el hallazgo 4 es que la clave se mantiene a
 * través de un rechazo por capacidad —ese rechazo no creó nada, así que
 * reintentar con OTRA franja es el mismo intento—. Si la franja entrara en la
 * huella, ese reintento legítimo se rechazaría como conflicto.
 *
 * Las líneas se ordenan porque `[A,B]` y `[B,A]` son el mismo pedido y el
 * cliente no garantiza el orden.
 */
export function huellaSolicitud(
  comercioId: string,
  items: { productoId: string; cantidad: number }[],
): string {
  const lineas = items
    .map((i) => `${i.productoId}x${i.cantidad}`)
    .sort()
    .join("|");
  return `${comercioId}::${lineas}`;
}

/**
 * Qué hacer cuando la clave de idempotencia ya existe.
 *
 * Devolver el pedido encontrado sin más —que es lo que se hacía— tiene dos
 * agujeros, y los dos terminan entregando un CÓDIGO DE RETIRO:
 *
 *   1. No se comprobaba el dueño. La clave es única a nivel global, así que un
 *      usuario que presentara la clave de otro recibía el pedido de ese otro,
 *      con su código. Es un UUID v4 y adivinarlo es inviable, pero la clave
 *      viaja en una cabecera —la ven los proxies, los logs y cualquier
 *      herramienta de red— y una comprobación de dueño no cuesta nada.
 *
 *   2. No se comparaba el contenido. Dos pedidos distintos enviados con la
 *      misma clave devolvían el primero, en silencio y con el código
 *      equivocado. El hallazgo 4 describe exactamente ese escenario y lo
 *      arregló del lado del cliente, renovando la clave por intento; del lado
 *      del servidor no había nada. Una idempotencia que no mira el cuerpo no
 *      protege de un cliente equivocado: lo obedece.
 *
 * Ante cualquiera de los dos casos NO se devuelve el pedido. Se rechaza, que
 * es lo que pide el punto 9 de la auditoría.
 */
function resolverReintento(
  previo: {
    id: string;
    codigo: string;
    usuarioId: string;
    franjaId: string;
    cargaEstimadaMin: number;
    total: unknown;
    franja: { inicio: Date; fin: Date; comercioId: string };
    items: { productoId: string; cantidad: number }[];
  },
  solicitud: SolicitudPedido,
): ResultadoReserva {
  if (previo.usuarioId !== solicitud.usuarioId) {
    return {
      admitido: false,
      motivo: "IDEMPOTENCIA_AJENA",
      alternativas: [],
    };
  }

  const guardada = huellaSolicitud(previo.franja.comercioId, previo.items);
  const entrante = huellaSolicitud(solicitud.comercioId, solicitud.items);
  if (guardada !== entrante) {
    return {
      admitido: false,
      motivo: "IDEMPOTENCIA_EN_CONFLICTO",
      alternativas: [],
    };
  }

  return aPedidoAdmitido(previo);
}

/** Lo que hay que traer para poder decidir un reintento. */
const CON_HUELLA = {
  franja: true,
  items: { select: { productoId: true, cantidad: true } },
} as const;

/**
 * Ejecuta la admisión. Devuelve un pedido admitido, o alternativas.
 *
 * Estrategia de bloqueo: se bloquean todas las franjas candidatas del comercio
 * en orden determinista (por `inicio`), de modo que dos transacciones nunca
 * adquieran los mismos locks en orden distinto (evita deadlock). Los productos
 * se releen DENTRO de la transacción: leerlos antes abre una ventana en la que
 * el comercio puede marcar un producto agotado y el pedido entrar igual.
 */
export async function reservar(
  prisma: PrismaClient,
  solicitud: SolicitudPedido,
): Promise<ResultadoReserva> {
  // Camino rápido de idempotencia, fuera de la transacción: la enorme mayoría
  // de los reintentos llega cuando el pedido original ya está confirmado.
  const previo = await prisma.pedido.findUnique({
    where: { idempotencyKey: solicitud.idempotencyKey },
    include: CON_HUELLA,
  });
  if (previo) return resolverReintento(previo, solicitud);

  // En paralelo: son dos lecturas independientes y esto está en la ruta
  // caliente de creación de pedido, donde cada ida y vuelta a la base se paga
  // con el usuario esperando.
  const [comercio, usuario] = await Promise.all([
    prisma.comercio.findUniqueOrThrow({ where: { id: solicitud.comercioId } }),
    prisma.usuario.findUniqueOrThrow({ where: { id: solicitud.usuarioId } }),
  ]);

  if (!comercio.activo || comercio.estadoOperacion !== "ABIERTO") {
    return {
      admitido: false,
      motivo: "COMERCIO_NO_DISPONIBLE",
      detalle: comercio.estadoOperacion,
      alternativas: [],
    };
  }

  const params: ParametrosComercio = {
    factorSeguridad: Number(comercio.factorSeguridad),
    tiempoMinAnticipable: comercio.tiempoMinAnticipable,
  };
  try {
    const r = await ejecutarAdmision(
      prisma,
      solicitud,
      comercio,
      usuario,
      params,
      solicitud.ahora,
    );
    // Un rechazo de negocio en un REINTENTO no es un rechazo: si otra ejecución
    // con esta misma clave ya creó el pedido, la intención del cliente está
    // cumplida. Sin esta comprobación, dos reintentos simultáneos pueden chocar
    // contra una cuota (tope de pedidos activos) que el pedido ganador acaba de
    // consumir — y el cliente vería un error por un pedido que sí existe.
    if (!r.admitido) {
      const ganador = await prisma.pedido.findUnique({
        where: { idempotencyKey: solicitud.idempotencyKey },
        include: CON_HUELLA,
      });
      if (ganador) return resolverReintento(ganador, solicitud);
    }
    return r;
  } catch (e) {
    // Última línea de defensa de la idempotencia: dos reintentos verdaderamente
    // simultáneos pasan ambos las relecturas y colisionan en el UNIQUE. La
    // colisión NO es un error para el cliente: significa que su pedido existe.
    // No se inspecciona la forma del error: se comprueba el HECHO. Si existe un
    // pedido con esta clave, la intención del cliente ya se cumplió — la
    // perdió esta transacción, la ganó otra, y el resultado es el mismo pedido.
    const ganador = await prisma.pedido.findUnique({
      where: { idempotencyKey: solicitud.idempotencyKey },
      include: CON_HUELLA,
    });
    if (ganador) return resolverReintento(ganador, solicitud);
    throw e;
  }
}

async function ejecutarAdmision(
  prisma: PrismaClient,
  solicitud: SolicitudPedido,
  comercio: { id: string; factorSeguridad: unknown; tiempoMinAnticipable: number; margenCutoffMin: number; maxPedidosActivos: number },
  usuario: { id: string; correo: string; condicionExperimental: "A" | "B"; canalCaptacion: string | null; primerPedidoEn: Date | null },
  params: ParametrosComercio,
  /**
   * El reloj **inyectado**, si lo hay.
   *
   * Se recibe sin resolver a propósito: cuando no viene, la hora se toma
   * DENTRO de la transacción y después de los locks (ver abajo). Resolverlo
   * acá arriba era el defecto P0‑2.
   */
  ahoraInyectado: Date | undefined,
): Promise<ResultadoReserva> {
  const alfa = params.factorSeguridad;
  const condicion = usuario.condicionExperimental as CondicionExperimental;

  return prisma.$transaction(
    async (tx) => {
      // --- Nivel 3: idempotencia bajo transacción -------------------------
      // Relectura: dos reintentos verdaderamente simultáneos pasan ambos el
      // camino rápido. El unique de la BD es la última línea de defensa.
      const dentro = await tx.pedido.findUnique({
        where: { idempotencyKey: solicitud.idempotencyKey },
        include: CON_HUELLA,
      });
      if (dentro) return resolverReintento(dentro, solicitud);

      // --- Tope de pedidos activos por usuario ----------------------------
      /*
       * Se bloquea la fila del USUARIO antes de contar, y sin eso el tope no
       * aguanta (hallazgo T-17).
       *
       * Contar filas no las bloquea: bajo READ COMMITTED, N transacciones
       * simultáneas del mismo usuario ven todas cero activos, todas pasan la
       * comprobación y todas insertan. Se verificó: con el tope en 3, seis
       * pedidos lanzados a la vez entraron los seis. El bloqueo de franja no lo
       * impedía porque cada pedido iba a una franja distinta, así que no había
       * nada en común sobre lo que competir.
       *
       * El candado va sobre el usuario porque el tope es POR usuario: dos
       * personas distintas no se estorban, y las peticiones de una misma se
       * serializan, que es justo lo que la regla quiere decir.
       *
       * Orden de bloqueo: usuario y DESPUÉS franjas, siempre. Mantenerlo
       * constante es lo que evita el abrazo mortal, igual que el orden por
       * `inicio` dentro de las franjas.
       */
      await tx.$queryRaw`SELECT id FROM usuario WHERE id = ${solicitud.usuarioId}::uuid FOR UPDATE`;

      const activos = await tx.pedido.count({
        where: {
          usuarioId: solicitud.usuarioId,
          estado: { in: ESTADOS_ACTIVOS as unknown as never[] },
        },
      });
      if (activos >= comercio.maxPedidosActivos) {
        return {
          admitido: false as const,
          motivo: "LIMITE_PEDIDOS_ACTIVOS" as const,
          detalle: `${activos}/${comercio.maxPedidosActivos}`,
          alternativas: [],
        };
      }

      // --- Nivel 2: productos releídos dentro de la transacción -----------
      const productos = await tx.$queryRaw<FilaProducto[]>`
        SELECT id, nombre, precio::text AS precio, "tiempoPreparacionMin",
               anticipable, disponible
        FROM producto
        WHERE "comercioId" = ${solicitud.comercioId}::uuid
          AND id = ANY(${solicitud.items.map((i) => i.productoId)}::uuid[])
          AND archivado = false
        FOR SHARE
      `;
      const porId = new Map(productos.map((p) => [p.id, p]));

      const lineas: LineaPedido[] = [];
      for (const item of solicitud.items) {
        const p = porId.get(item.productoId);
        if (!p) {
          return {
            admitido: false as const,
            motivo: "PRODUCTO_NO_ELEGIBLE" as const,
            detalle: item.productoId,
            alternativas: [],
          };
        }
        lineas.push({
          cantidad: item.cantidad,
          producto: {
            id: p.id,
            tiempoPreparacionMin: p.tiempoPreparacionMin,
            anticipable: p.anticipable,
            disponible: p.disponible,
          },
        });
      }

      const validacion = validarPedido(lineas, params);
      if (!validacion.valido) {
        return {
          admitido: false as const,
          motivo: validacion.motivo!,
          detalle: validacion.detalle,
          alternativas: [],
        };
      }
      const carga = validacion.carga;

      const solicitada = await tx.franja.findUnique({
        where: { id: solicitud.franjaSolicitadaId },
      });
      if (!solicitada || solicitada.comercioId !== solicitud.comercioId) {
        return {
          admitido: false as const,
          motivo: "FRANJA_INEXISTENTE" as const,
          alternativas: [],
        };
      }

      // --- Nivel 1: lock pesimista sobre las franjas candidatas -----------
      const bloqueadas = await tx.$queryRaw<FilaFranjaBloqueada[]>`
        SELECT id, inicio, fin,
               "capacidadMinutos" AS capacidad_minutos,
               "cargaAsignada"    AS carga_asignada,
               abierta
        FROM franja
        WHERE "comercioId" = ${solicitud.comercioId}::uuid
          AND abierta = true
          AND inicio >= ${solicitada.inicio}
        ORDER BY inicio ASC
        FOR UPDATE
      `;

      const franjas: FranjaCapacidad[] = bloqueadas.map((f) => ({
        id: f.id,
        inicio: f.inicio,
        fin: f.fin,
        capacidadMinutos: Number(f.capacidad_minutos),
        cargaAsignada: Number(f.carga_asignada),
        abierta: f.abierta,
      }));

      /*
       * La hora, recién ahora.
       *
       * Acá arriba ya se adquirieron los locks: si esta transacción estuvo
       * esperando a que otra soltara la franja, esa espera pudo durar
       * segundos. El cut-off es la regla que dice "ya no da tiempo de
       * cocinarlo", y medirla con la hora de cuando se pidió el turno —en vez
       * de la de cuando le tocó— admite pedidos que el sistema sabe que no
       * puede cumplir.
       *
       * El reloj inyectado se respeta cuando existe: es lo que hace
       * verificables las reglas que dependen del tiempo, y las pruebas y el
       * simulador dependen de ello. Solo se toma el reloj real cuando nadie
       * dijo qué hora es.
       */
      const ahora = ahoraInyectado ?? new Date();

      const opciones = calcularOpcionesConCutoff(
        franjas,
        lineas,
        carga,
        alfa,
        condicion,
        ahora,
        comercio.margenCutoffMin,
        solicitud.franjaSolicitadaId,
      );

      const destino = franjas.find((f) => f.id === solicitud.franjaSolicitadaId);
      if (!destino) {
        return {
          admitido: false as const,
          motivo: "SIN_FRANJA_DISPONIBLE" as const,
          alternativas: opciones.opciones,
        };
      }

      // Cut-off: se distingue del rechazo por capacidad porque el mensaje al
      // usuario es distinto ("ya no da tiempo" ≠ "está llena").
      if (
        pasoCutoff({
          ahora,
          franja: destino,
          tiempoPreparacionMaxMin: tiempoPreparacionMaximo(lineas),
          margenMin: comercio.margenCutoffMin,
        })
      ) {
        return {
          admitido: false as const,
          motivo: "FUERA_DE_CUTOFF" as const,
          alternativas: opciones.opciones,
        };
      }

      // Se respeta siempre la franja elegida por el usuario si cabe. La condición
      // B interviene en QUÉ se sugiere antes de elegir (UI), no en imponer un
      // destino distinto al confirmado: eso confundiría el efecto medido con una
      // reasignación forzada.
      // Reverificación bajo el lock: esta línea es la fuente de verdad.
      if (!cabeEnFranja(destino, carga, alfa)) {
        return {
          admitido: false as const,
          motivo: "SIN_FRANJA_DISPONIBLE" as const,
          alternativas: opciones.opciones.filter(
            (o) => o.franjaId !== destino.id,
          ),
        };
      }

      const total = lineas.reduce(
        (acc, l) => acc + Number(porId.get(l.producto.id)!.precio) * l.cantidad,
        0,
      );

      await tx.franja.update({
        where: { id: destino.id },
        data: { cargaAsignada: { increment: carga } },
      });

      const pedido = await tx.pedido.create({
        data: {
          codigo: codigoRetiro(),
          idempotencyKey: solicitud.idempotencyKey,
          usuarioId: solicitud.usuarioId,
          franjaId: destino.id,
          condicionExperimental: usuario.condicionExperimental,
          franjaSolicitadaId: solicitud.franjaSolicitadaId,
          franjasOfrecidas: opciones.opciones as unknown as Prisma.InputJsonValue,
          motivoAsignacion:
            opciones.sugeridaId === destino.id
              ? "SUGERIDA_ACEPTADA"
              : "SOLICITADA_POR_USUARIO",
          cargaEstimadaMin: carga,
          total: total.toFixed(2),
          canalCaptacion: solicitud.canalCaptacion ?? usuario.canalCaptacion,
          items: {
            create: lineas.map((l) => {
              const p = porId.get(l.producto.id)!;
              return {
                productoId: p.id,
                cantidad: l.cantidad,
                // Snapshot (nivel 4): el catálogo cambia, el histórico no.
                nombreProducto: p.nombre,
                precioUnitario: Number(p.precio).toFixed(2),
                tiempoPreparacionMin: p.tiempoPreparacionMin,
                subtotal: (Number(p.precio) * l.cantidad).toFixed(2),
              };
            }),
          },
          eventos: { create: { estado: "RECIBIDO", actorId: usuario.id } },
          // Dos canales para el mismo hecho (ADR-14). El push entrega al
          // bolsillo con la aplicacion cerrada; el correo es el respaldo para
          // quien no instalo o nego el permiso. Cada fila lleva su propio
          // estado y sus propios reintentos.
          notificaciones: {
            create: [
              {
                destinatario: usuario.correo,
                tipo: "PEDIDO_CONFIRMADO",
                canal: "CORREO",
              },
              {
                destinatario: usuario.correo,
                tipo: "PEDIDO_CONFIRMADO",
                canal: "PUSH",
              },
            ],
          },
        },
      });

      // Tiempo de activación (§11.3): distancia entre registro y primer pedido.
      if (!usuario.primerPedidoEn) {
        await tx.usuario.update({
          where: { id: usuario.id },
          data: { primerPedidoEn: pedido.creadoEn },
        });
      }

      return {
        admitido: true as const,
        pedidoId: pedido.id,
        codigo: pedido.codigo,
        franjaId: destino.id,
        franjaInicio: destino.inicio,
        franjaFin: destino.fin,
        cargaEstimadaMin: carga,
        total: total.toFixed(2),
        reintento: false,
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 20000 },
  );
}
