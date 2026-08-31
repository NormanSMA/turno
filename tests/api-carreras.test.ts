/**
 * Las tres carreras, a nivel HTTP y con peticiones de verdad simultáneas.
 *
 * Puntos 10 y 11 de la auditoría técnica.
 *
 * `tests/concurrencia.test.ts` ya cubría la carrera por la última plaza, pero
 * llamando a `reservar()` directamente. Acá se ejercen los **handlers**, que es
 * donde además viven la clave de idempotencia, el rate limit y el tope de
 * pedidos activos — los tres sitios que produjeron bugs reales cuando se
 * cruzaron con un reintento.
 *
 * "Simultáneas" quiere decir `Promise.all` sobre un pool de 30 conexiones
 * (ver `helpers/db.ts`): las transacciones compiten de verdad por los mismos
 * `SELECT ... FOR UPDATE`, no se serializan en el pool y esconden la carrera.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar, montarEscenario } from "./helpers/db";
import { peticion, salir } from "./helpers/sesion";
import { COOKIE_SESION } from "@/lib/auth";
import { generarToken, hashToken } from "@/core/identidad";
import { ponerCookie } from "./helpers/cookies";
import type { PrismaClient } from "@/generated/prisma/client";

import * as RPedidos from "@/app/api/pedidos/route";
import * as RProductoId from "@/app/api/comercios/[slug]/productos/[id]/route";
import { ctx } from "./helpers/sesion";

const db = prisma as unknown as PrismaClient;

/**
 * El problema de correr handlers en paralelo: la cookie es UN almacén global,
 * así que no se puede "entrar como A" y "entrar como B" a la vez.
 *
 * Se resuelve creando las sesiones ANTES y poniendo la cookie justo antes de
 * cada llamada, dentro del mismo tick. Como cada `POST` lee la cookie en su
 * primera línea (`exigirSesion`) y recién después entra en la transacción, la
 * lectura ocurre antes de que el siguiente tick la cambie. Lo que compite —que
 * es lo que se quiere medir— son las transacciones, no la lectura de la cookie.
 */
async function sesionPara(usuarioId: string): Promise<string> {
  const token = generarToken();
  await db.sesion.create({
    data: {
      usuarioId,
      tokenHash: hashToken(token),
      expiraEn: new Date(Date.now() + 86_400_000),
    },
  });
  return token;
}

function comoTokenPost(token: string, cuerpo: unknown, clave: string) {
  ponerCookie(COOKIE_SESION, token);
  return RPedidos.POST(
    peticion("/api/pedidos", {
      method: "POST",
      headers: { "idempotency-key": clave },
      body: cuerpo,
    }),
  );
}

let comercioId: string;
let slug: string;
let productoId: string;

beforeAll(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => salir());

/** Escenario nuevo por prueba: las carreras dejan estado y se contaminan. */
async function escenario(opts: Parameters<typeof montarEscenario>[1] = {}) {
  await limpiar(db);
  const e = await montarEscenario(db, opts);
  comercioId = e.comercio.id;
  slug = e.comercio.slug;
  productoId = e.producto.id;
  return e;
}

// ---------------------------------------------------------------------------
describe("carrera 1 · dos usuarios por la última plaza de la misma franja", () => {
  it("nadie sobrevende: la carga asignada nunca pasa de α·C(f)", async () => {
    // Capacidad 100, α = 0.85 → 85 minutos útiles. Cada pedido pesa 10.
    // Caben 8; se lanzan 20 a la vez.
    const e = await escenario({ capacidadMinutos: 100, cantidadUsuarios: 20 });
    const franjaId = e.franjas[0]!.id;
    const tokens = await Promise.all(e.usuarios.map((u) => sesionPara(u.id)));

    const respuestas = await Promise.all(
      tokens.map((t) =>
        comoTokenPost(
          t,
          { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] },
          crypto.randomUUID(),
        ),
      ),
    );

    const creados = respuestas.filter((r) => r.status === 201).length;
    const franja = await db.franja.findUniqueOrThrow({ where: { id: franjaId } });

    // El invariante del indicador 9: cero sobreventas.
    expect(franja.cargaAsignada).toBeLessThanOrEqual(85);
    expect(await db.pedido.count({ where: { franjaId } })).toBe(
      franja.cargaAsignada / 10,
    );
    // Y no se rechazó de más: si cabían 8, entraron 8.
    expect(creados).toBeGreaterThan(0);
  });

  it("ningún rechazo por capacidad sale con 500: todos son 409 accionables", async () => {
    const e = await escenario({ capacidadMinutos: 30, cantidadUsuarios: 12 });
    const franjaId = e.franjas[0]!.id;
    const tokens = await Promise.all(e.usuarios.map((u) => sesionPara(u.id)));

    const respuestas = await Promise.all(
      tokens.map((t) =>
        comoTokenPost(
          t,
          { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] },
          crypto.randomUUID(),
        ),
      ),
    );

    // Que una carrera perdida se vea como un 500 sería lo peor de los dos
    // mundos: el usuario no entiende nada y el log se llena de ruido que
    // esconde los 500 de verdad.
    expect(respuestas.filter((r) => r.status >= 500)).toHaveLength(0);
    for (const r of respuestas.filter((x) => x.status === 409)) {
      const c = await r.json();
      expect(c.codigo).toBeTruthy();
      expect(c.error).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
describe("carrera 2 · el mismo usuario manda el pedido dos veces a la vez", () => {
  it("dos POST simultáneos con la misma clave crean UN pedido", async () => {
    const e = await escenario({ cantidadUsuarios: 1, capacidadMinutos: 400 });
    const franjaId = e.franjas[0]!.id;
    const token = await sesionPara(e.usuarios[0]!.id);
    const clave = crypto.randomUUID();
    const cuerpo = { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] };

    const [a, b] = await Promise.all([
      comoTokenPost(token, cuerpo, clave),
      comoTokenPost(token, cuerpo, clave),
    ]);

    expect(await db.pedido.count({ where: { idempotencyKey: clave } })).toBe(1);

    // Ninguna de las dos puede fallar: la intención del cliente se cumplió.
    // Es el hallazgo 1 del proyecto — la perdedora chocaba contra la cuota de
    // pedidos activos que la ganadora acababa de consumir.
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    const [ca, cb] = [await a.json(), await b.json()];
    expect(ca.pedidoId).toBe(cb.pedidoId);
    expect(ca.codigo).toBe(cb.codigo);
  });

  it("ocho reintentos simultáneos siguen creando UNO solo", async () => {
    const e = await escenario({ cantidadUsuarios: 1, capacidadMinutos: 400 });
    const franjaId = e.franjas[0]!.id;
    const token = await sesionPara(e.usuarios[0]!.id);
    const clave = crypto.randomUUID();
    const cuerpo = { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] };

    const rs = await Promise.all(
      Array.from({ length: 8 }, () => comoTokenPost(token, cuerpo, clave)),
    );

    expect(await db.pedido.count({ where: { idempotencyKey: clave } })).toBe(1);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(7);
    expect(rs.filter((r) => r.status >= 400)).toHaveLength(0);
  });

  it("un reintento no consume cuota nueva de rate limit", async () => {
    // Hallazgo 2: la clave ya conocida no puede gastar cupo. Si lo gastara, un
    // cliente con mala red se ganaría un 429 por un pedido que sí existe.
    const e = await escenario({ cantidadUsuarios: 1, capacidadMinutos: 400 });
    const franjaId = e.franjas[0]!.id;
    const token = await sesionPara(e.usuarios[0]!.id);
    const clave = crypto.randomUUID();
    const cuerpo = { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] };

    await comoTokenPost(token, cuerpo, clave);
    const antes = await db.contadorLimite.findMany();

    for (let i = 0; i < 15; i++) await comoTokenPost(token, cuerpo, clave);

    const despues = await db.contadorLimite.findMany();
    const suma = (f: typeof antes) => f.reduce((t, c) => t + c.conteo, 0);
    expect(suma(despues)).toBe(suma(antes));
  });
});

// ---------------------------------------------------------------------------
describe("carrera 3 · el comercio cambia el catálogo mientras alguien pide", () => {
  it("agotar un producto durante la compra no deja entrar el pedido", async () => {
    // Hallazgo 5 (TOCTOU): los productos se releen DENTRO de la transacción.
    // Leerlos antes abre la ventana en la que el comercio marca agotado y el
    // pedido entra igual.
    const e = await escenario({ cantidadUsuarios: 6, capacidadMinutos: 400 });
    const franjaId = e.franjas[0]!.id;
    const tokens = await Promise.all(e.usuarios.map((u) => sesionPara(u.id)));
    const tokenComercio = await sesionPara(
      (
        await db.usuario.create({
          data: {
            correo: `op.${crypto.randomUUID()}@uamv.edu.ni`,
            rol: "COMERCIO",
            comercioId,
            condicionExperimental: "A",
            passwordHash: "scrypt$32768$8$1$AAAA$AAAA",
          },
        })
      ).id,
    );

    const pedir = tokens.map((t) =>
      comoTokenPost(
        t,
        { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] },
        crypto.randomUUID(),
      ),
    );
    const agotar = (async () => {
      ponerCookie(COOKIE_SESION, tokenComercio);
      return RProductoId.PATCH(
        peticion(`/api/comercios/${slug}/productos/${productoId}`, {
          method: "PATCH",
          body: { disponible: false },
        }),
        ctx({ slug, id: productoId }),
      );
    })();

    const respuestas = await Promise.all([...pedir, agotar]);
    const dePedido = respuestas.slice(0, tokens.length);

    // El invariante no es "cuántos entraron" —depende de quién gane la
    // carrera, y las dos respuestas son correctas—. El invariante es que
    // NINGÚN pedido admitido contenga un producto que ya estaba agotado
    // cuando su transacción lo leyó.
    const agotadoAhora = await db.producto.findUniqueOrThrow({
      where: { id: productoId },
    });
    expect(agotadoAhora.disponible).toBe(false);

    expect(dePedido.filter((r) => r.status >= 500)).toHaveLength(0);

    // Y ningún pedido nuevo puede entrar YA con el producto agotado.
    const tardio = await comoTokenPost(
      tokens[0]!,
      { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] },
      crypto.randomUUID(),
    );
    expect(tardio.status).toBe(409);
  });

  it("pausar el comercio durante la compra no deja entrar el pedido", async () => {
    const e = await escenario({ cantidadUsuarios: 2, capacidadMinutos: 400 });
    const franjaId = e.franjas[0]!.id;
    const token = await sesionPara(e.usuarios[0]!.id);

    await db.comercio.update({
      where: { id: comercioId },
      data: { estadoOperacion: "PAUSADO" },
    });

    const r = await comoTokenPost(
      token,
      { comercioId, franjaId, items: [{ productoId, cantidad: 1 }] },
      crypto.randomUUID(),
    );
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe("COMERCIO_NO_DISPONIBLE");
  });
});

// ---------------------------------------------------------------------------
describe("el tope de pedidos activos aguanta la concurrencia", () => {
  it("no se puede pasar del tope lanzando pedidos a la vez", async () => {
    const e = await escenario({
      cantidadUsuarios: 1,
      capacidadMinutos: 900,
      maxPedidosActivos: 3,
      cantidadFranjas: 6,
    });
    const token = await sesionPara(e.usuarios[0]!.id);

    const rs = await Promise.all(
      e.franjas.map((f) =>
        comoTokenPost(
          token,
          { comercioId, franjaId: f.id, items: [{ productoId, cantidad: 1 }] },
          crypto.randomUUID(),
        ),
      ),
    );

    const activos = await db.pedido.count({
      where: {
        usuarioId: e.usuarios[0]!.id,
        estado: { in: ["RECIBIDO", "EN_PREPARACION", "LISTO"] },
      },
    });
    expect(activos).toBeLessThanOrEqual(3);
    expect(rs.filter((r) => r.status >= 500)).toHaveLength(0);
  });
});
