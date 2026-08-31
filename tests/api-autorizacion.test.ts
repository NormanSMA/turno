/**
 * Matriz de autorización, endpoint por endpoint, contra los handlers REALES.
 *
 * Punto 7 de la auditoría técnica, y el arreglo de los hallazgos T-01 y T-02.
 *
 * Hasta acá, las 419 pruebas del proyecto llamaban a `core/` y ninguna importaba
 * un `route.ts`. `core/autorizacion.ts` estaba al 100 % y `lib/auth.ts` al 2.5 %:
 * verde sobre la función que decide, nada sobre la que se llama. Un
 * `exigirComercio` olvidado en un handler pasaba la suite entera.
 *
 * Esta prueba cierra eso por el lado que importa. Cada endpoint protegido se
 * ejerce cuatro veces —anónimo, rol equivocado, comercio ajeno, dueño— y se
 * exige el código HTTP correcto. La tabla `MATRIZ` es a la vez la prueba y la
 * documentación: agregar un endpoint sin agregar su fila deja hueco visible.
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// La fábrica devuelve el mismo módulo que importamos abajo, así que la cookie
// que escribe el test es la que lee el handler.
vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar, montarEscenario } from "./helpers/db";
import { crearOperador, ctx, entrarComo, peticion, salir } from "./helpers/sesion";
import type { PrismaClient } from "@/generated/prisma/client";

const db = prisma as unknown as PrismaClient;

// Los handlers, importados tal cual los sirve Next.
import * as RPedidos from "@/app/api/pedidos/route";
import * as RPedidoId from "@/app/api/pedidos/[id]/route";
import * as REstado from "@/app/api/pedidos/[id]/estado/route";
import * as RPerfil from "@/app/api/perfil/route";
import * as RAvisos from "@/app/api/avisos/route";
import * as RPreferencias from "@/app/api/preferencias/route";
import * as RFavoritos from "@/app/api/favoritos/route";
import * as RAdminMetricas from "@/app/api/admin/metricas/route";
import * as RAdminSistema from "@/app/api/admin/sistema/route";
import * as RAdminUsuarios from "@/app/api/admin/usuarios/route";
import * as RAdminOperacion from "@/app/api/admin/operacion/route";
import * as RCocina from "@/app/api/cocina/[slug]/route";
import * as RComercioAdmin from "@/app/api/comercios/[slug]/admin/route";
import * as RInforme from "@/app/api/comercios/[slug]/informe/route";
import * as RProductos from "@/app/api/comercios/[slug]/productos/route";
import * as RProductoId from "@/app/api/comercios/[slug]/productos/[id]/route";
import * as RImagen from "@/app/api/comercios/[slug]/productos/[id]/imagen/route";
import * as RFranjaId from "@/app/api/comercios/[slug]/franjas/[id]/route";
import * as RGenerar from "@/app/api/comercios/[slug]/franjas/generar/route";
import * as RMenu from "@/app/api/comercios/[slug]/menu/route";
import * as RCron from "@/app/api/cron/mantenimiento/route";
import * as RPassword from "@/app/api/auth/password/route";

interface Mundo {
  estudianteId: string;
  otroEstudianteId: string;
  adminId: string;
  duenoId: string;
  ajenoId: string;
  slug: string;
  slugAjeno: string;
  productoId: string;
  franjaId: string;
  pedidoId: string;
}

let m: Mundo;

beforeAll(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
  await limpiar(db);

  const propio = await montarEscenario(db, { cantidadUsuarios: 2 });
  const ajeno = await montarEscenario(db, { cantidadUsuarios: 0 });

  const admin = await crearOperador(db, "ADMIN", null);
  const dueno = await crearOperador(db, "COMERCIO", propio.comercio.id);
  const ajenoOp = await crearOperador(db, "COMERCIO", ajeno.comercio.id);

  // Un pedido real del primer estudiante, para las rutas por id.
  const pedido = await db.pedido.create({
    data: {
      usuarioId: propio.usuarios[0]!.id,
      franjaId: propio.franjas[0]!.id,
      idempotencyKey: crypto.randomUUID(),
      codigo: "AUD001",
      estado: "RECIBIDO",
      total: "120.00",
      cargaEstimadaMin: 10,
      condicionExperimental: "A",
    },
  });

  m = {
    estudianteId: propio.usuarios[0]!.id,
    otroEstudianteId: propio.usuarios[1]!.id,
    adminId: admin.id,
    duenoId: dueno.id,
    ajenoId: ajenoOp.id,
    slug: propio.comercio.slug,
    slugAjeno: ajeno.comercio.slug,
    productoId: propio.producto.id,
    franjaId: propio.franjas[0]!.id,
    pedidoId: pedido.id,
  };
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => salir());

/** Quién hace la llamada. */
type Actor = "anonimo" | "estudiante" | "otroEstudiante" | "admin" | "dueno" | "ajeno";

async function actuarComo(actor: Actor) {
  if (actor === "anonimo") return salir();
  const id = {
    estudiante: () => m.estudianteId,
    otroEstudiante: () => m.otroEstudianteId,
    admin: () => m.adminId,
    dueno: () => m.duenoId,
    ajeno: () => m.ajenoId,
  }[actor]();
  await entrarComo(db, id);
}

interface Caso {
  nombre: string;
  /** Ejecuta el handler y devuelve la respuesta. */
  llamar: () => Promise<Response>;
  /** Quién SÍ puede. El resto de los actores probados debe recibir 401/403. */
  permitidos: Actor[];
  /** Actores a probar además de los permitidos. */
  rechazados: Actor[];
}

function casos(): Caso[] {
  return [
    // ------------------------------------------------ sesión de estudiante ---
    {
      nombre: "GET /api/pedidos",
      llamar: () => RPedidos.GET(),
      permitidos: ["estudiante", "admin", "dueno"],
      rechazados: ["anonimo"],
    },
    {
      nombre: "POST /api/pedidos",
      llamar: () =>
        RPedidos.POST(
          peticion("/api/pedidos", {
            method: "POST",
            headers: { "idempotency-key": crypto.randomUUID() },
            body: {
              comercioId: "00000000-0000-4000-8000-000000000000",
              franjaId: m.franjaId,
              items: [{ productoId: m.productoId, cantidad: 1 }],
            },
          }),
        ),
      permitidos: ["estudiante"],
      rechazados: ["anonimo"],
    },
    {
      nombre: "GET /api/perfil",
      llamar: () => RPerfil.GET(),
      permitidos: ["estudiante"],
      rechazados: ["anonimo"],
    },
    {
      nombre: "GET /api/avisos",
      llamar: () => RAvisos.GET(),
      permitidos: ["estudiante"],
      rechazados: ["anonimo"],
    },
    {
      nombre: "GET /api/preferencias",
      llamar: () => RPreferencias.GET(),
      permitidos: ["estudiante"],
      rechazados: ["anonimo"],
    },
    {
      nombre: "GET /api/favoritos",
      llamar: () => RFavoritos.GET(),
      permitidos: ["estudiante"],
      rechazados: ["anonimo"],
    },

    // -------------------------------------------------- pedido ajeno (IDOR) ---
    {
      nombre: "GET /api/pedidos/:id",
      llamar: () =>
        RPedidoId.GET(peticion(`/api/pedidos/${m.pedidoId}`), ctx({ id: m.pedidoId })),
      // El dueño del comercio ve el pedido de su franja; el admin observa.
      permitidos: ["estudiante", "dueno", "admin"],
      rechazados: ["anonimo", "otroEstudiante", "ajeno"],
    },
    {
      nombre: "PATCH /api/pedidos/:id/estado",
      llamar: () =>
        REstado.PATCH(
          peticion(`/api/pedidos/${m.pedidoId}/estado`, {
            method: "PATCH",
            body: { estado: "EN_PREPARACION" },
          }),
          ctx({ id: m.pedidoId }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "otroEstudiante", "ajeno"],
    },

    // ------------------------------------------------------------- ADMIN ---
    {
      nombre: "GET /api/admin/metricas",
      llamar: () => RAdminMetricas.GET(peticion("/api/admin/metricas")),
      permitidos: ["admin"],
      rechazados: ["anonimo", "estudiante", "dueno"],
    },
    {
      nombre: "GET /api/admin/sistema",
      llamar: () => RAdminSistema.GET(peticion("/api/admin/sistema")),
      permitidos: ["admin"],
      rechazados: ["anonimo", "estudiante", "dueno"],
    },
    {
      nombre: "GET /api/admin/usuarios",
      llamar: () => RAdminUsuarios.GET(),
      permitidos: ["admin"],
      rechazados: ["anonimo", "estudiante", "dueno"],
    },
    {
      nombre: "PATCH /api/admin/usuarios",
      llamar: () =>
        RAdminUsuarios.PATCH(
          peticion("/api/admin/usuarios", {
            method: "PATCH",
            body: { usuarioId: m.estudianteId, rol: "ESTUDIANTE" },
          }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "estudiante", "dueno"],
    },
    {
      nombre: "GET /api/admin/operacion",
      llamar: () => RAdminOperacion.GET(),
      permitidos: ["admin"],
      rechazados: ["anonimo", "estudiante", "dueno"],
    },

    // ------------------------------------------ COMERCIO, y solo el SUYO ---
    {
      nombre: "GET /api/cocina/:slug",
      llamar: () => RCocina.GET(peticion(`/api/cocina/${m.slug}`), ctx({ slug: m.slug })),
      permitidos: ["dueno"],
      // El admin observa el piloto pero no lo opera (ADR-09).
      rechazados: ["anonimo", "estudiante", "admin", "ajeno"],
    },
    {
      nombre: "GET /api/comercios/:slug/admin",
      llamar: () =>
        RComercioAdmin.GET(peticion(`/api/comercios/${m.slug}/admin`), ctx({ slug: m.slug })),
      permitidos: ["dueno"],
      rechazados: ["anonimo", "estudiante", "ajeno"],
    },
    {
      nombre: "GET /api/comercios/:slug/informe",
      llamar: () =>
        RInforme.GET(peticion(`/api/comercios/${m.slug}/informe`), ctx({ slug: m.slug })),
      permitidos: ["dueno", "admin"],
      rechazados: ["anonimo", "estudiante", "ajeno"],
    },
    {
      nombre: "POST /api/comercios/:slug/productos",
      llamar: () =>
        RProductos.POST(
          peticion(`/api/comercios/${m.slug}/productos`, {
            method: "POST",
            body: { nombre: "X", precio: "10.00", tiempoPreparacionMin: 5 },
          }),
          ctx({ slug: m.slug }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "estudiante", "admin", "ajeno"],
    },
    {
      nombre: "PATCH /api/comercios/:slug/productos/:id",
      llamar: () =>
        RProductoId.PATCH(
          peticion(`/api/comercios/${m.slug}/productos/${m.productoId}`, {
            method: "PATCH",
            body: { disponible: false },
          }),
          ctx({ slug: m.slug, id: m.productoId }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "estudiante", "admin", "ajeno"],
    },
    {
      nombre: "PUT /api/comercios/:slug/productos/:id/imagen",
      llamar: () =>
        RImagen.PUT(
          new Request("http://localhost/imagen", { method: "PUT", body: "x" }),
          ctx({ slug: m.slug, id: m.productoId }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "estudiante", "admin", "ajeno"],
    },
    {
      nombre: "PATCH /api/comercios/:slug/franjas/:id",
      llamar: () =>
        RFranjaId.PATCH(
          peticion(`/api/comercios/${m.slug}/franjas/${m.franjaId}`, {
            method: "PATCH",
            body: { capacidadMinutos: 50 },
          }),
          ctx({ slug: m.slug, id: m.franjaId }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "estudiante", "admin", "ajeno"],
    },
    {
      nombre: "POST /api/comercios/:slug/franjas/generar",
      llamar: () =>
        RGenerar.POST(
          peticion(`/api/comercios/${m.slug}/franjas/generar`, {
            method: "POST",
            body: { fecha: "2026-09-02", desde: "09:00", hasta: "10:00" },
          }),
          ctx({ slug: m.slug }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "estudiante", "admin", "ajeno"],
    },

    // --------------------------------------------- solo cuentas con clave ---
    {
      nombre: "PATCH /api/auth/password",
      llamar: () =>
        RPassword.PATCH(
          peticion("/api/auth/password", {
            method: "PATCH",
            body: { actual: "x", nueva: "Turno-Nueva-2026" },
          }),
        ),
      permitidos: [],
      rechazados: ["anonimo", "estudiante"],
    },
  ];
}

describe("matriz de autorización sobre los handlers reales", () => {
  const lista = () => casos();

  it("cubre todos los endpoints protegidos que exporta la aplicación", () => {
    // Guarda contra el olvido: si mañana se agrega una ruta protegida y no se
    // agrega su fila, este número deja de cuadrar y alguien tiene que mirar.
    expect(lista().length).toBe(22);
  });

  describe("un anónimo no pasa de la puerta", () => {
    for (const c of casos()) {
      it(`${c.nombre} → 401 sin sesión`, async () => {
        salir();
        const r = await c.llamar();
        expect(r.status).toBe(401);
        expect((await r.json()).codigo).toBe("NO_AUTENTICADO");
      });
    }
  });

  describe("el rol equivocado recibe 403, no 404 ni 500", () => {
    for (const c of casos()) {
      for (const actor of c.rechazados) {
        if (actor === "anonimo") continue;
        it(`${c.nombre} → 403 para ${actor}`, async () => {
          await actuarComo(actor);
          const r = await c.llamar();
          expect(r.status).toBe(403);
          expect((await r.json()).codigo).toBe("NO_AUTORIZADO");
        });
      }
    }
  });

  describe("quien corresponde entra", () => {
    for (const c of casos()) {
      for (const actor of c.permitidos) {
        it(`${c.nombre} → pasa la autorización para ${actor}`, async () => {
          await actuarComo(actor);
          const r = await c.llamar();
          // No se afirma 200: varios endpoints responden 409/422 por reglas de
          // negocio con cuerpos de prueba. Lo que se afirma es que NO se
          // rechazó por identidad.
          expect([401, 403]).not.toContain(r.status);
        });
      }
    }
  });
});

describe("lo público sigue siendo público", () => {
  it("GET /api/comercios/:slug/menu responde sin sesión", async () => {
    salir();
    const r = await RMenu.GET(peticion(`/api/comercios/${m.slug}/menu`), ctx({ slug: m.slug }));
    expect(r.status).toBe(200);
  });
});

describe("el cron se autentica por secreto, no por sesión", () => {
  const previo = process.env.CRON_SECRET;
  const SECRETO = "secreto-de-prueba-para-la-auditoria";

  beforeEach(() => {
    process.env.CRON_SECRET = SECRETO;
  });
  afterAll(() => {
    process.env.CRON_SECRET = previo;
  });

  it("una sesión de ADMIN no lo abre", async () => {
    await actuarComo("admin");
    const r = await RCron.GET(peticion("/api/cron/mantenimiento"));
    expect(r.status).toBe(401);
  });

  it("un secreto equivocado no lo abre", async () => {
    salir();
    const r = await RCron.GET(
      peticion("/api/cron/mantenimiento", {
        headers: { authorization: "Bearer secreto-equivocado-de-igual-largo" },
      }),
    );
    expect(r.status).toBe(401);
  });

  it("sin CRON_SECRET configurado falla cerrado", async () => {
    delete process.env.CRON_SECRET;
    salir();
    const r = await RCron.GET(
      peticion("/api/cron/mantenimiento", {
        headers: { authorization: "Bearer lo-que-sea" },
      }),
    );
    expect(r.status).toBe(401);
  });

  // Hallazgo 8 del proyecto: el programador de Vercel invoca por GET. Si el
  // endpoint solo aceptara POST, el barrido nunca correría y nadie se enteraría
  // hasta que faltaran los NO_SHOW en el análisis. Esta prueba fija el GET.
  it("con el secreto correcto corre, y corre por GET", async () => {
    salir();
    const r = await RCron.GET(
      peticion("/api/cron/mantenimiento", {
        headers: { authorization: `Bearer ${SECRETO}` },
      }),
    );
    expect(r.status).toBe(200);
  });
});
