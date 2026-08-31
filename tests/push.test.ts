/**
 * ADR-14 — Web Push.
 *
 * Lo que se verifica acá no es "el push funciona": eso depende de un servicio
 * externo y de un teléfono real. Se verifica lo que sí es responsabilidad de
 * este código y lo que rompería en silencio si estuviera mal:
 *
 *  1. Cada hecho genera sus DOS filas de bandeja, una por canal, sin duplicar.
 *  2. El vaciado de correo NO toca las filas de push (y viceversa). Es la
 *     regresión más peligrosa de todo el ADR: la tabla es compartida, y sin el
 *     filtro por canal la bandeja de correo intentaría "enviar por correo" una
 *     fila destinada a un teléfono, marcándola como entregada.
 *  3. Una suscripción muerta se borra en vez de reintentarse para siempre.
 *  4. Un usuario sin dispositivos no deja la bandeja atascada.
 *  5. La entrega inmediata es idempotente respecto del cron.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reservar } from "@/core/reserva";
import { cambiarEstado } from "@/core/ciclo-vida";
import { vaciarBandeja } from "@/lib/correo";
import {
  componerPush,
  entregarPushDePedido,
  enviarPushAUsuario,
  pushConfigurado,
  vaciarBandejaPush,
} from "@/lib/push";
import { CABECERA_SIN_CAMBIOS, coincideEtag } from "@/lib/http";
import { crearPrismaTest, limpiar, montarEscenario } from "./helpers/db";

/**
 * El doble de `web-push`. Se controla desde `guion`, que decide qué le pasa a
 * cada endpoint. `vi.hoisted` es necesario porque `vi.mock` se eleva por encima
 * de los imports y el objeto tiene que existir antes.
 */
const g = vi.hoisted(() => ({
  guion: new Map<string, number>(),
  enviados: [] as { endpoint: string; carga: string }[],
}));

vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(
      mensaje: string,
      readonly statusCode: number,
      readonly headers: unknown,
      readonly body: string,
    ) {
      super(mensaje);
      this.name = "WebPushError";
    }
  }
  return {
    WebPushError,
    default: {
      setVapidDetails: () => undefined,
      generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }),
      sendNotification: async (
        sus: { endpoint: string },
        carga: string,
      ) => {
        const estado = g.guion.get(sus.endpoint);
        if (estado && estado >= 400) {
          throw new WebPushError("falló", estado, {}, "detalle");
        }
        g.enviados.push({ endpoint: sus.endpoint, carga });
        return { statusCode: 201 };
      },
    },
  };
});

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
  g.guion.clear();
  g.enviados.length = 0;
  // Con claves configuradas el módulo intenta enviar de verdad — contra el
  // doble de arriba. Sin ellas se iría por la rama "modo consola" y estas
  // pruebas no verificarían nada.
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "clave-publica-de-prueba";
  process.env.VAPID_PRIVATE_KEY = "clave-privada-de-prueba";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function escenarioConPedido() {
  const esc = await montarEscenario(prisma, { cantidadUsuarios: 2 });
  const r = await reservar(prisma, {
    usuarioId: esc.usuarios[0].id,
    comercioId: esc.comercio.id,
    franjaSolicitadaId: esc.franjas[0].id,
    items: [{ productoId: esc.producto.id, cantidad: 1 }],
    idempotencyKey: crypto.randomUUID(),
  });
  if (!r.admitido) throw new Error("El escenario base debía admitir");
  return { ...esc, pedidoId: r.pedidoId! };
}

async function suscribir(usuarioId: string, endpoint: string) {
  return prisma.suscripcionPush.create({
    data: { usuarioId, endpoint, p256dh: "p256dh-de-prueba", auth: "auth-prueba" },
  });
}

// ------------------------------------------------------------ La bandeja ---

describe("un hecho, dos canales", () => {
  it("confirmar un pedido encola CORREO y PUSH, no uno solo", async () => {
    const { pedidoId } = await escenarioConPedido();

    const filas = await prisma.notificacion.findMany({
      where: { pedidoId, tipo: "PEDIDO_CONFIRMADO" },
    });

    expect(filas.map((f) => f.canal).sort()).toEqual(["CORREO", "PUSH"]);
  });

  it("marcar LISTO encola los dos canales, y repetirlo no duplica", async () => {
    const { pedidoId, usuarios } = await escenarioConPedido();

    await cambiarEstado(prisma, {
      pedidoId,
      hacia: "EN_PREPARACION",
      actor: "COMERCIO",
      actorId: usuarios[0].id,
    });
    await cambiarEstado(prisma, {
      pedidoId,
      hacia: "LISTO",
      actor: "COMERCIO",
      actorId: usuarios[0].id,
    });

    const filas = await prisma.notificacion.findMany({
      where: { pedidoId, tipo: "PEDIDO_LISTO" },
    });
    expect(filas.map((f) => f.canal).sort()).toEqual(["CORREO", "PUSH"]);
  });
});

describe("los canales no se pisan", () => {
  it("vaciar la bandeja de correo NO marca las filas de push", async () => {
    const { pedidoId } = await escenarioConPedido();

    await vaciarBandeja(prisma);

    const correo = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "CORREO" },
    });
    const push = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "PUSH" },
    });

    expect(correo.estado).toBe("ENVIADA");
    // Sin el filtro por canal, esta fila saldría también como ENVIADA sin que
    // ningún teléfono se hubiera enterado de nada.
    expect(push.estado).toBe("PENDIENTE");
    expect(push.intentos).toBe(0);
  });

  it("vaciar la bandeja de push NO marca las filas de correo", async () => {
    const { pedidoId } = await escenarioConPedido();

    await vaciarBandejaPush(prisma);

    const correo = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "CORREO" },
    });
    expect(correo.estado).toBe("PENDIENTE");
  });
});

// -------------------------------------------------------------- El envío ---

describe("entrega a los dispositivos", () => {
  it("entrega a todos los dispositivos del usuario", async () => {
    const { usuarios } = await escenarioConPedido();
    await suscribir(usuarios[0].id, "https://push.example/uno");
    await suscribir(usuarios[0].id, "https://push.example/dos");

    const r = await enviarPushAUsuario(prisma, usuarios[0].id, {
      titulo: "t",
      cuerpo: "c",
      url: "/x",
      tag: "tag",
    });

    expect(r.entregados).toBe(2);
    expect(g.enviados).toHaveLength(2);
  });

  it("no le entrega el aviso de una persona a otra", async () => {
    const { usuarios } = await escenarioConPedido();
    await suscribir(usuarios[0].id, "https://push.example/mio");
    await suscribir(usuarios[1].id, "https://push.example/ajeno");

    await enviarPushAUsuario(prisma, usuarios[0].id, {
      titulo: "t",
      cuerpo: "c",
      url: "/x",
      tag: "tag",
    });

    expect(g.enviados.map((e) => e.endpoint)).toEqual([
      "https://push.example/mio",
    ]);
  });

  it("un 410 borra la suscripción en vez de reintentarla para siempre", async () => {
    const { usuarios } = await escenarioConPedido();
    await suscribir(usuarios[0].id, "https://push.example/muerto");
    await suscribir(usuarios[0].id, "https://push.example/vivo");
    g.guion.set("https://push.example/muerto", 410);

    const r = await enviarPushAUsuario(prisma, usuarios[0].id, {
      titulo: "t",
      cuerpo: "c",
      url: "/x",
      tag: "tag",
    });

    expect(r.caducadas).toBe(1);
    expect(r.entregados).toBe(1);

    const quedan = await prisma.suscripcionPush.findMany({
      where: { usuarioId: usuarios[0].id },
    });
    expect(quedan.map((s) => s.endpoint)).toEqual(["https://push.example/vivo"]);
  });

  it("un 503 cuenta el fallo pero conserva el dispositivo", async () => {
    const { usuarios } = await escenarioConPedido();
    const s = await suscribir(usuarios[0].id, "https://push.example/caido");
    g.guion.set("https://push.example/caido", 503);

    await enviarPushAUsuario(prisma, usuarios[0].id, {
      titulo: "t",
      cuerpo: "c",
      url: "/x",
      tag: "tag",
    });

    const vivo = await prisma.suscripcionPush.findUnique({ where: { id: s.id } });
    expect(vivo?.fallos).toBe(1);
  });

  it("a los cinco fallos consecutivos descarta el dispositivo", async () => {
    const { usuarios } = await escenarioConPedido();
    await prisma.suscripcionPush.create({
      data: {
        usuarioId: usuarios[0].id,
        endpoint: "https://push.example/agotado",
        p256dh: "p",
        auth: "a",
        fallos: 4,
      },
    });
    g.guion.set("https://push.example/agotado", 500);

    await enviarPushAUsuario(prisma, usuarios[0].id, {
      titulo: "t",
      cuerpo: "c",
      url: "/x",
      tag: "tag",
    });

    expect(await prisma.suscripcionPush.count()).toBe(0);
  });
});

// ------------------------------------------------- Bandeja y entrega juntas ---

describe("bandeja de push", () => {
  it("un usuario sin dispositivos no deja la bandeja atascada", async () => {
    const { pedidoId } = await escenarioConPedido();

    const r = await vaciarBandejaPush(prisma);

    const fila = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "PUSH" },
    });
    // Se cierra como ENVIADA a propósito: no hay nada que reintentar, y
    // dejarla PENDIENTE haría que el cron la arrastrara en cada corrida.
    expect(fila.estado).toBe("ENVIADA");
    expect(fila.ultimoError).toBe("Sin dispositivos suscritos");
    expect(r.pendientes).toBe(0);
  });

  it("la entrega inmediata cierra la fila y el cron ya no la reenvía", async () => {
    const { pedidoId, usuarios } = await escenarioConPedido();
    await suscribir(usuarios[0].id, "https://push.example/uno");

    const r = await entregarPushDePedido(prisma, pedidoId, "PEDIDO_CONFIRMADO");
    expect(r.entregados).toBe(1);
    expect(g.enviados).toHaveLength(1);

    // Esto es lo que evita el aviso duplicado: el cron corre después y no
    // vuelve a encontrar la fila pendiente.
    await vaciarBandejaPush(prisma);
    expect(g.enviados).toHaveLength(1);

    const fila = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "PUSH", tipo: "PEDIDO_CONFIRMADO" },
    });
    expect(fila.estado).toBe("ENVIADA");
  });

  it("si el servicio falla, el cron reintenta lo que la entrega inmediata no logró", async () => {
    const { pedidoId, usuarios } = await escenarioConPedido();
    await suscribir(usuarios[0].id, "https://push.example/intermitente");
    g.guion.set("https://push.example/intermitente", 503);

    await entregarPushDePedido(prisma, pedidoId, "PEDIDO_CONFIRMADO");

    let fila = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "PUSH", tipo: "PEDIDO_CONFIRMADO" },
    });
    expect(fila.estado).toBe("PENDIENTE");
    expect(fila.intentos).toBe(1);

    // El servicio se recupera y el cron la entrega.
    g.guion.clear();
    await vaciarBandejaPush(prisma);

    fila = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "PUSH", tipo: "PEDIDO_CONFIRMADO" },
    });
    expect(fila.estado).toBe("ENVIADA");
    expect(g.enviados).toHaveLength(1);
  });

  it("la entrega inmediata nunca lanza, aunque el pedido no exista", async () => {
    await expect(
      entregarPushDePedido(prisma, crypto.randomUUID(), "PEDIDO_LISTO"),
    ).resolves.toEqual({ entregados: 0 });
  });
});

// ---------------------------------------------------------- Lo que se ve ---

describe("el contenido del aviso", () => {
  it("el código de retiro viaja en el cuerpo, no solo en la pantalla", async () => {
    const { pedidoId } = await escenarioConPedido();
    const fila = await prisma.notificacion.findFirstOrThrow({
      where: { pedidoId, canal: "PUSH" },
      include: { pedido: { include: { franja: { include: { comercio: true } } } } },
    });

    const carga = componerPush({ ...fila, tipo: "PEDIDO_LISTO" })!;

    expect(carga.titulo).toBe("Tu pedido está listo");
    // Mucha gente lee el aviso en la pantalla de bloqueo y no lo abre. Con el
    // código a la vista ya puede llegar al mostrador.
    expect(carga.cuerpo).toContain(fila.pedido!.codigo);
    expect(carga.url).toBe(`/pedido/${pedidoId}`);
  });

  it("el enlace de acceso no se manda por push", async () => {
    expect(componerPush({ tipo: "ENLACE_ACCESO", pedido: null })).toBeNull();
  });
});

describe("configuración", () => {
  it("sin claves VAPID el sistema no envía y no rompe", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(pushConfigurado()).toBe(false);

    const { usuarios } = await escenarioConPedido();
    await suscribir(usuarios[0].id, "https://push.example/uno");

    const r = await enviarPushAUsuario(prisma, usuarios[0].id, {
      titulo: "t",
      cuerpo: "c",
      url: "/x",
      tag: "tag",
    });

    // Se reporta como entregado —igual que el controlador `consola` del
    // correo— para no llenar la bandeja de reintentos que nunca van a salir.
    expect(r.entregados).toBe(1);
    expect(g.enviados).toHaveLength(0);
  });
});

// ------------------------------------------------------- Revalidación ---

describe("validador de frescura", () => {
  const etag = 'W/"p-1787590248300"';

  function conIfNoneMatch(valor: string | null): Request {
    const h = new Headers();
    if (valor !== null) h.set("If-None-Match", valor);
    return new Request("https://turno.test/api/pedidos/x", { headers: h });
  }

  it("reconoce el mismo validador", () => {
    expect(coincideEtag(conIfNoneMatch(etag), etag)).toBe(true);
  });

  it("no reconoce uno viejo", () => {
    expect(coincideEtag(conIfNoneMatch('W/"p-1"'), etag)).toBe(false);
  });

  it("sin cabecera, siempre responde completo", () => {
    expect(coincideEtag(conIfNoneMatch(null), etag)).toBe(false);
  });

  it("acepta una lista, que es lo que permite HTTP", () => {
    expect(coincideEtag(conIfNoneMatch(`W/"p-1", ${etag}`), etag)).toBe(true);
  });

  it("la cabecera del marcador no se renombra sin querer", () => {
    // `public/sw.js` la busca por este nombre exacto. Si cambia acá y no allá,
    // el worker deja de reconocer "no cambió nada" y vuelve a pedir todo — sin
    // ningún error visible, solo el gasto de cómputo de vuelta.
    expect(CABECERA_SIN_CAMBIOS).toBe("X-Turno-Sin-Cambios");
  });
});
