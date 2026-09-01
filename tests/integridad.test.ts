/**
 * Fase 1 — Correctitud. Los cuatro niveles de conflicto concurrente, el ciclo de
 * vida y el cut-off, verificados contra la base real.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reservar } from "@/core/reserva";
import { barrerVencidos, cambiarEstado } from "@/core/ciclo-vida";
import { TransicionInvalida } from "@/core/estados";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function pedidoBase(opts: Parameters<typeof montarEscenario>[1] = {}) {
  const esc = await montarEscenario(prisma, { cantidadUsuarios: 2, ...opts });
  const r = await reservar(prisma, {
    usuarioId: esc.usuarios[0].id,
    comercioId: esc.comercio.id,
    franjaSolicitadaId: esc.franjas[0].id,
    items: [{ productoId: esc.producto.id, cantidad: 1 }],
    idempotencyKey: crypto.randomUUID(),
  });
  if (!r.admitido) throw new Error("El escenario base debía admitir: " + r.motivo);
  return { ...esc, pedido: r };
}

// ---------------------------------------------------------------- Nivel 3 ---

describe("Nivel 3 — idempotencia: el mismo pedido enviado N veces", () => {
  it("10 POST idénticos crean UN solo pedido", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1 },
    );
    const clave = crypto.randomUUID();

    const resultados = await Promise.all(
      Array.from({ length: 10 }, () =>
        reservar(prisma, {
          usuarioId: usuarios[0].id,
          comercioId: comercio.id,
          franjaSolicitadaId: franjas[0].id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: clave,
        }),
      ),
    );

    const ids = new Set(
      resultados.filter((r) => r.admitido).map((r) => (r as never)["pedidoId"]),
    );
    expect(ids.size).toBe(1);
    expect(await prisma.pedido.count()).toBe(1);

    // Y la capacidad se consumió una sola vez: la carrera no infló la franja.
    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBe(10);
  });

  it("el reintento tardío devuelve el mismo pedido, marcado como reintento", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1 },
    );
    const clave = crypto.randomUUID();
    const args = {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: clave,
    };

    const primero = await reservar(prisma, args);
    const segundo = await reservar(prisma, args);

    expect(primero.admitido && segundo.admitido).toBe(true);
    if (!primero.admitido || !segundo.admitido) return;
    expect(segundo.pedidoId).toBe(primero.pedidoId);
    expect(segundo.codigo).toBe(primero.codigo);
    expect(primero.reintento).toBe(false);
    expect(segundo.reintento).toBe(true);
    expect(await prisma.pedido.count()).toBe(1);
  });

  it("un reintento nunca es rechazado por el tope de pedidos activos", async () => {
    // Regresión: el tope se evalúa antes de saber que la petición es reintento.
    // Con el cupo ya consumido, los reintentos simultáneos chocaban contra la
    // cuota que el pedido ganador acababa de ocupar — y el cliente veía un
    // error por un pedido que sí existía.
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1, maxPedidosActivos: 1 },
    );
    const clave = crypto.randomUUID();
    const resultados = await Promise.all(
      Array.from({ length: 8 }, () =>
        reservar(prisma, {
          usuarioId: usuarios[0].id,
          comercioId: comercio.id,
          franjaSolicitadaId: franjas[0].id,
          items: [{ productoId: producto.id, cantidad: 1 }],
          idempotencyKey: clave,
        }),
      ),
    );

    // Los ocho terminan admitidos y en el mismo pedido.
    expect(resultados.every((r) => r.admitido)).toBe(true);
    const ids = new Set(
      resultados.map((r) => (r.admitido ? r.pedidoId : "x")),
    );
    expect(ids.size).toBe(1);
    expect(await prisma.pedido.count()).toBe(1);

    // Pero el tope SÍ sigue aplicando a una clave nueva.
    const otro = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(otro.admitido).toBe(false);
    if (!otro.admitido) expect(otro.motivo).toBe("LIMITE_PEDIDOS_ACTIVOS");
  });

  it("claves distintas del mismo usuario sí crean pedidos distintos", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1, maxPedidosActivos: 5 },
    );
    for (let i = 0; i < 3; i++) {
      const r = await reservar(prisma, {
        usuarioId: usuarios[0].id,
        comercioId: comercio.id,
        franjaSolicitadaId: franjas[0].id,
        items: [{ productoId: producto.id, cantidad: 1 }],
        idempotencyKey: crypto.randomUUID(),
      });
      expect(r.admitido).toBe(true);
    }
    expect(await prisma.pedido.count()).toBe(3);
  });
});

// ---------------------------------------------------------------- Nivel 2 ---

describe("Nivel 2 — el producto se agota durante la compra", () => {
  it("un producto marcado no disponible se rechaza sin consumir capacidad", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1 },
    );
    await prisma.producto.update({
      where: { id: producto.id },
      data: { disponible: false },
    });

    const r = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });

    expect(r.admitido).toBe(false);
    if (!r.admitido) expect(r.motivo).toBe("PRODUCTO_NO_ELEGIBLE");
    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBe(0);
  });

  it("agotar el producto mientras entran pedidos no deja pasar ninguno después", async () => {
    // La lectura del producto ocurre DENTRO de la transacción: no hay ventana
    // entre "leí que estaba disponible" y "escribí el pedido".
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 12, capacidadMinutos: 1000, maxPedidosActivos: 5 },
    );

    const carrera = usuarios.map((u, i) =>
      reservar(prisma, {
        usuarioId: u.id,
        comercioId: comercio.id,
        franjaSolicitadaId: franjas[0].id,
        items: [{ productoId: producto.id, cantidad: 1 }],
        idempotencyKey: crypto.randomUUID(),
      }).then((r) => ({ i, r })),
    );
    const apagon = prisma.producto.update({
      where: { id: producto.id },
      data: { disponible: false },
    });

    const [resultados] = await Promise.all([Promise.all(carrera), apagon]);

    const admitidos = resultados.filter((x) => x.r.admitido).length;
    // Cualquier reparto es válido; lo que NO puede pasar es que se admita un
    // pedido y la carga de la franja no lo refleje.
    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBe(admitidos * 10);

    // Y una vez apagado, ningún pedido nuevo entra.
    const tardio = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(tardio.admitido).toBe(false);
  });
});

// ---------------------------------------------------------------- Nivel 4 ---

describe("Nivel 4 — el comercio cambia el catálogo después del pedido", () => {
  it("el pedido conserva nombre, precio y t(p) del momento de la compra", async () => {
    const { producto, pedido } = await pedidoBase();

    await prisma.producto.update({
      where: { id: producto.id },
      data: {
        nombre: "Pizza personal GRANDE",
        precio: "170.00",
        tiempoPreparacionMin: 25,
      },
    });

    const items = await prisma.itemPedido.findMany({
      where: { pedidoId: pedido.pedidoId },
    });
    expect(items[0].nombreProducto).toBe("Pizza personal");
    expect(String(items[0].precioUnitario)).toBe("120");
    expect(items[0].tiempoPreparacionMin).toBe(10);
    expect(String(items[0].subtotal)).toBe("120");

    const p = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.pedidoId },
    });
    expect(String(p.total)).toBe("120");
    expect(p.cargaEstimadaMin).toBe(10);
  });
});

// --------------------------------------------------------- Ciclo de vida ---

describe("ciclo de vida y liberación de capacidad", () => {
  it("recorre el camino feliz y registra la línea de tiempo", async () => {
    const { pedido, usuarios } = await pedidoBase();

    await cambiarEstado(prisma, {
      pedidoId: pedido.pedidoId,
      hacia: "EN_PREPARACION",
      actor: "COMERCIO",
    });
    const listo = await cambiarEstado(prisma, {
      pedidoId: pedido.pedidoId,
      hacia: "LISTO",
      actor: "COMERCIO",
    });
    expect(listo.cumplimiento).toBe("CUMPLIDO");

    await cambiarEstado(prisma, {
      pedidoId: pedido.pedidoId,
      hacia: "RETIRADO",
      actor: "COMERCIO",
      actorId: usuarios[0].id,
    });

    const p = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.pedidoId },
      include: { eventos: { orderBy: { timestamp: "asc" } }, notificaciones: true },
    });
    expect(p.estado).toBe("RETIRADO");
    expect(p.listoEn).toBeInstanceOf(Date);
    expect(p.retiradoEn).toBeInstanceOf(Date);
    expect(p.eventos.map((e) => e.estado)).toEqual([
      "RECIBIDO",
      "EN_PREPARACION",
      "LISTO",
      "RETIRADO",
    ]);
    // Bandeja de salida: confirmación + listo, una de cada tipo POR CANAL.
    /*
     * Los avisos de pedido van SOLO por push.
     *
     * Antes se encolaban también por correo. Con ochocientos estudiantes eso
     * son miles de correos al mes contra el límite diario de la cuenta que los
     * envía, y un aviso que llega tarde es peor que uno que no se prometió. El
     * correo quedó para el enlace de acceso, que es lo único que tiene que
     * llegar ANTES de que exista un navegador con permiso para notificar.
     *
     * Sigue prohibido que un mismo (tipo, canal) aparezca dos veces: de eso se
     * encarga el unique de la tabla, y es lo que hace que un reintento no
     * duplique el aviso.
     */
    expect(
      p.notificaciones.map((n) => `${n.tipo}:${n.canal}`).sort(),
    ).toEqual(["PEDIDO_CONFIRMADO:PUSH", "PEDIDO_LISTO:PUSH"]);
  });

  it("rechaza una transición inválida", async () => {
    const { pedido } = await pedidoBase();
    await expect(
      cambiarEstado(prisma, {
        pedidoId: pedido.pedidoId,
        hacia: "RETIRADO",
        actor: "COMERCIO",
      }),
    ).rejects.toThrow(TransicionInvalida);

    const p = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.pedidoId },
    });
    expect(p.estado).toBe("RECIBIDO"); // no se movió
  });

  it("no permite revivir un pedido retirado", async () => {
    const { pedido } = await pedidoBase();
    for (const hacia of ["EN_PREPARACION", "LISTO", "RETIRADO"] as const) {
      await cambiarEstado(prisma, {
        pedidoId: pedido.pedidoId,
        hacia,
        actor: "COMERCIO",
      });
    }
    await expect(
      cambiarEstado(prisma, {
        pedidoId: pedido.pedidoId,
        hacia: "EN_PREPARACION",
        actor: "ADMIN",
      }),
    ).rejects.toThrow(TransicionInvalida);
  });

  it("cancelar libera exactamente la carga del pedido", async () => {
    const { pedido, franjas } = await pedidoBase();
    const antes = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(antes.cargaAsignada).toBe(10);

    const r = await cambiarEstado(prisma, {
      pedidoId: pedido.pedidoId,
      hacia: "CANCELADO",
      actor: "USUARIO",
    });
    expect(r.capacidadLiberadaMin).toBe(10);

    const despues = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(despues.cargaAsignada).toBe(0);
  });

  it("dos cancelaciones simultáneas no liberan capacidad dos veces", async () => {
    // El invariante leído al revés: sobreventa por la puerta de atrás.
    const { pedido, franjas } = await pedidoBase();

    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        cambiarEstado(prisma, {
          pedidoId: pedido.pedidoId,
          hacia: "CANCELADO",
          actor: "USUARIO",
        }),
      ),
    );

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    expect(exitosas).toHaveLength(1);

    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBe(0);
    expect(franja.cargaAsignada).toBeGreaterThanOrEqual(0);
  });

  it("la capacidad liberada vuelve a estar disponible para otro usuario", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { capacidadMinutos: 10, factorSeguridad: 1, cantidadUsuarios: 2 },
    );
    const primero = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(primero.admitido).toBe(true);
    if (!primero.admitido) return;

    // La franja quedó exactamente llena: el segundo no cabe.
    const bloqueado = await reservar(prisma, {
      usuarioId: usuarios[1].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(bloqueado.admitido).toBe(false);

    await cambiarEstado(prisma, {
      pedidoId: primero.pedidoId,
      hacia: "CANCELADO",
      actor: "USUARIO",
    });

    const ahora = await reservar(prisma, {
      usuarioId: usuarios[1].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(ahora.admitido).toBe(true);
  });

  it("el usuario no puede cancelar una vez que la cocina empezó", async () => {
    const { pedido } = await pedidoBase();
    await cambiarEstado(prisma, {
      pedidoId: pedido.pedidoId,
      hacia: "EN_PREPARACION",
      actor: "COMERCIO",
    });
    await expect(
      cambiarEstado(prisma, {
        pedidoId: pedido.pedidoId,
        hacia: "CANCELADO",
        actor: "USUARIO",
      }),
    ).rejects.toThrow(/no puede cancelar/);
    // El comercio sí.
    await expect(
      cambiarEstado(prisma, {
        pedidoId: pedido.pedidoId,
        hacia: "CANCELADO",
        actor: "COMERCIO",
      }),
    ).resolves.toMatchObject({ capacidadLiberadaMin: 10 });
  });

  it("NO_SHOW no devuelve capacidad: la cocina ya gastó los minutos", async () => {
    const { pedido, franjas } = await pedidoBase();
    for (const hacia of ["EN_PREPARACION", "LISTO"] as const) {
      await cambiarEstado(prisma, {
        pedidoId: pedido.pedidoId,
        hacia,
        actor: "COMERCIO",
      });
    }
    const r = await cambiarEstado(prisma, {
      pedidoId: pedido.pedidoId,
      hacia: "NO_SHOW",
      actor: "SISTEMA",
    });
    expect(r.capacidadLiberadaMin).toBe(0);

    const franja = await prisma.franja.findUniqueOrThrow({
      where: { id: franjas[0].id },
    });
    expect(franja.cargaAsignada).toBe(10);
  });
});

describe("barrido de vencidos", () => {
  it("marca NO_SHOW pasado el umbral y es idempotente", async () => {
    const { pedido } = await pedidoBase({ minutosNoShow: 20 });
    const listoEn = new Date("2026-09-01T12:05:00Z");
    for (const hacia of ["EN_PREPARACION", "LISTO"] as const) {
      await cambiarEstado(prisma, {
        pedidoId: pedido.pedidoId,
        hacia,
        actor: "COMERCIO",
        ahora: listoEn,
      });
    }

    const tarde = new Date("2026-09-01T12:40:00Z");
    const uno = await barrerVencidos(prisma, tarde);
    expect(uno.noShow).toBe(1);

    // Correrlo otra vez no cambia nada: el barrido es idempotente.
    const dos = await barrerVencidos(prisma, tarde);
    expect(dos.noShow).toBe(0);

    const p = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.pedidoId },
    });
    expect(p.estado).toBe("NO_SHOW");
  });

  it("marca incumplido lo que sigue en preparación con la franja vencida", async () => {
    const { pedido } = await pedidoBase();
    await cambiarEstado(prisma, {
      pedidoId: pedido.pedidoId,
      hacia: "EN_PREPARACION",
      actor: "COMERCIO",
    });

    const r = await barrerVencidos(prisma, new Date("2026-09-02T00:00:00Z"));
    expect(r.incumplidos).toBe(1);

    const p = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.pedidoId },
    });
    // El estado operacional NO cambia: solo el resultado de servicio.
    expect(p.estado).toBe("EN_PREPARACION");
    expect(p.cumplimiento).toBe("INCUMPLIDO");
  });
});

// -------------------------------------------------------------- Cut-off ----

describe("cut-off y disponibilidad operativa", () => {
  it("rechaza un pedido que ya no da tiempo de preparar", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1, margenCutoffMin: 2 },
    );
    /*
     * El instante se deriva de la franja, no se escribe.
     *
     * Acá había un `2026-09-01T11:59:00Z` que solo tenía sentido con las
     * franjas en una fecha fija; al hacerlas relativas al presente, la hora
     * quedó apuntando a cualquier lado. Lo que la prueba quiere decir es
     * "un minuto DESPUÉS de que se cerrara el cut-off", y eso se calcula.
     *
     * t(p) = 10 y margen = 2, así que hay que pedir 12 minutos antes del fin.
     * Pidiendo a 11, ya no da tiempo — por un minuto.
     */
    const once = new Date(franjas[0].fin.getTime() - 11 * 60_000);
    const r = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
      ahora: once,
    });

    expect(r.admitido).toBe(false);
    if (!r.admitido) {
      expect(r.motivo).toBe("FUERA_DE_CUTOFF");
      // Y se ofrecen franjas posteriores que sí son alcanzables.
      expect(r.alternativas.length).toBeGreaterThan(0);
      expect(r.alternativas.map((a) => a.franjaId)).not.toContain(franjas[0].id);
    }
  });

  it("admite justo antes del cut-off", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1, margenCutoffMin: 2 },
    );
    const r = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
      ahora: new Date("2026-09-01T11:58:00Z"),
    });
    expect(r.admitido).toBe(true);
  });

  it("un comercio pausado no acepta pedidos aunque haya capacidad", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1 },
    );
    await prisma.comercio.update({
      where: { id: comercio.id },
      data: { estadoOperacion: "PAUSADO" },
    });

    const r = await reservar(prisma, {
      usuarioId: usuarios[0].id,
      comercioId: comercio.id,
      franjaSolicitadaId: franjas[0].id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(r.admitido).toBe(false);
    if (!r.admitido) expect(r.motivo).toBe("COMERCIO_NO_DISPONIBLE");
  });

  it("aplica el tope de pedidos activos por usuario", async () => {
    const { comercio, producto, franjas, usuarios } = await montarEscenario(
      prisma,
      { cantidadUsuarios: 1, maxPedidosActivos: 2 },
    );
    const pedir = () =>
      reservar(prisma, {
        usuarioId: usuarios[0].id,
        comercioId: comercio.id,
        franjaSolicitadaId: franjas[0].id,
        items: [{ productoId: producto.id, cantidad: 1 }],
        idempotencyKey: crypto.randomUUID(),
      });

    expect((await pedir()).admitido).toBe(true);
    expect((await pedir()).admitido).toBe(true);
    const tercero = await pedir();
    expect(tercero.admitido).toBe(false);
    if (!tercero.admitido) expect(tercero.motivo).toBe("LIMITE_PEDIDOS_ACTIVOS");

    // Al cancelar uno, se libera el cupo del usuario.
    const activo = await prisma.pedido.findFirstOrThrow({
      where: { usuarioId: usuarios[0].id, estado: "RECIBIDO" },
    });
    await cambiarEstado(prisma, {
      pedidoId: activo.id,
      hacia: "CANCELADO",
      actor: "USUARIO",
    });
    expect((await pedir()).admitido).toBe(true);
  });
});
