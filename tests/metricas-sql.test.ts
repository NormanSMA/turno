import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { crearPrismaTest, limpiar } from "./helpers/db";
import {
  cargaPorHoraDelDia,
  cumplimientoPorDia,
  type PedidoMetrica,
} from "@/core/metricas";
import {
  cargaPorHoraSql,
  conteosSql,
  cumplimientoPorDiaSql,
} from "@/lib/metricas-sql";

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  exigirRol: async () => ({}),
}));

const prisma = crearPrismaTest();
const DIA = 86_400_000;
const ahora = Date.now();
const slugA = "com-a-" + Math.floor(Math.random() * 1e9).toString(36);
const slugB = "com-b-" + Math.floor(Math.random() * 1e9).toString(36);
let pedidosDb: PedidoMetrica[] = [];
const slugPorFranja = new Map<string, string>();

beforeAll(async () => {
  await limpiar(prisma);
  const usuario = await prisma.usuario.create({
    data: {
      correo: `m${Date.now()}@uam.edu.ni`,
      condicionExperimental: "A",
      consentimiento: true,
    },
  });
  let n = 0;
  for (const slug of [slugA, slugB]) {
    const comercio = await prisma.comercio.create({ data: { nombre: slug, slug } });
    // 3 días, dos horas por día (UTC; en Managua son 6 horas antes).
    for (const dias of [1, 2, 3]) {
      for (const [h, cond, estado, cumpl] of [
        [17, "A", "RETIRADO", "CUMPLIDO"],
        [17, "B", "RETIRADO", "INCUMPLIDO"],
        [18, "B", "CANCELADO", "NO_APLICA"],
        [18, "A", "EN_PREPARACION", "PENDIENTE"],
      ] as const) {
        const inicio = new Date(ahora - dias * DIA);
        inicio.setUTCHours(h, 30, 0, 0);
        const franja = await prisma.franja.upsert({
          where: { comercioId_inicio: { comercioId: comercio.id, inicio } },
          update: {},
          create: {
            comercioId: comercio.id,
            inicio,
            fin: new Date(inicio.getTime() + 600_000),
            capacidadMinutos: 100,
          },
        });
        slugPorFranja.set(franja.id, slug);
        await prisma.pedido.create({
          data: {
            codigo: `C${n}-${Date.now()}`,
            idempotencyKey: `k${n++}-${Date.now()}`,
            usuarioId: usuario.id,
            franjaId: franja.id,
            condicionExperimental: cond,
            cargaEstimadaMin: 5 + (n % 7),
            estado,
            cumplimiento: cumpl,
            total: "10.00",
            creadoEn: new Date(inicio.getTime() - 3_600_000),
          },
        });
      }
    }
  }
  // Un pedido viejo, fuera de los últimos 30 días.
  const comercioA = await prisma.comercio.findUniqueOrThrow({ where: { slug: slugA } });
  const inicioViejo = new Date(ahora - 60 * DIA);
  const fViejo = await prisma.franja.create({
    data: {
      comercioId: comercioA.id,
      inicio: inicioViejo,
      fin: new Date(inicioViejo.getTime() + 600_000),
      capacidadMinutos: 100,
    },
  });
  slugPorFranja.set(fViejo.id, slugA);
  await prisma.pedido.create({
    data: {
      codigo: `V-${Date.now()}`,
      idempotencyKey: `v-${Date.now()}`,
      usuarioId: usuario.id,
      franjaId: fViejo.id,
      condicionExperimental: "A",
      cargaEstimadaMin: 9,
      estado: "RETIRADO",
      cumplimiento: "CUMPLIDO",
      total: "10.00",
      creadoEn: inicioViejo,
    },
  });

  const filas = await prisma.pedido.findMany({
    include: { franja: true },
    orderBy: { creadoEn: "asc" },
  });
  pedidosDb = filas.map((p) => ({
    id: p.id,
    condicionExperimental: p.condicionExperimental,
    franjaId: p.franjaId,
    cargaEstimadaMin: p.cargaEstimadaMin,
    estado: p.estado,
    cumplimiento: p.cumplimiento,
    creadoEn: p.creadoEn,
    franjaInicio: p.franja.inicio,
    franjaFin: p.franja.fin,
    listoEn: p.listoEn,
    retiradoEn: p.retiradoEn,
    canalCaptacion: p.canalCaptacion,
  }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

const amplio = () => ({ desde: new Date(ahora - 90 * DIA), hasta: new Date(ahora + DIA) });

describe("agregados SQL equivalen a las funciones puras", () => {
  it("cumplimientoPorDiaSql y cargaPorHoraSql, sin filtro de comercio", async () => {
    const f = amplio();
    expect(await cumplimientoPorDiaSql(prisma, f)).toEqual(cumplimientoPorDia(pedidosDb));
    for (const c of ["A", "B", "TODAS"] as const) {
      expect(await cargaPorHoraSql(prisma, f, c)).toEqual(
        cargaPorHoraDelDia(pedidosDb, c),
      );
    }
  });

  it("el filtro de comercio excluye al otro", async () => {
    const f = { ...amplio(), comercio: slugB };
    const solo = pedidosDb.filter((p) => slugPorFranja.get(p.franjaId) === slugB);
    expect(solo.length).toBe(12);
    expect(await cumplimientoPorDiaSql(prisma, f)).toEqual(cumplimientoPorDia(solo));
    expect(await cargaPorHoraSql(prisma, f, "B")).toEqual(cargaPorHoraDelDia(solo, "B"));
    expect((await conteosSql(prisma, f)).pedidos).toBe(12);
  });

  it("el rango excluye pedidos fuera de él", async () => {
    const f = { desde: new Date(ahora - 30 * DIA), hasta: new Date(ahora) };
    const dentro = pedidosDb.filter((p) => p.creadoEn >= f.desde && p.creadoEn <= f.hasta);
    expect(dentro.length).toBe(24);
    expect(pedidosDb.length).toBe(25);
    expect(await cumplimientoPorDiaSql(prisma, f)).toEqual(cumplimientoPorDia(dentro));
    const c = await conteosSql(prisma, f);
    expect(c).toEqual({ pedidos: 24, usuarios: 1, activados: 0 });
  });
});

describe("GET /api/admin/metricas", () => {
  const pedir = async (qs: string) => {
    const { GET } = await import("@/app/api/admin/metricas/route");
    return GET(new Request(`http://localhost/api/admin/metricas${qs}`));
  };

  it("rechaza un rango invertido con 400", async () => {
    const r = await pedir(
      `?desde=${new Date(ahora).toISOString()}&hasta=${new Date(ahora - DIA).toISOString()}`,
    );
    expect(r.status).toBe(400);
  });

  it("rechaza un rango de más de 365 días y una fecha inválida", async () => {
    const largo = await pedir(
      `?desde=${new Date(ahora - 400 * DIA).toISOString()}&hasta=${new Date(ahora).toISOString()}`,
    );
    expect(largo.status).toBe(400);
    expect((await pedir("?desde=hola")).status).toBe(400);
  });

  it("sin parámetros usa los últimos 30 días", async () => {
    const r = await pedir("");
    expect(r.status).toBe(200);
    const j = await r.json();
    const span = Date.parse(j.rango.hasta) - Date.parse(j.rango.desde);
    expect(span).toBe(30 * DIA);
    expect(j.rango.comercio).toBeNull();
    expect(j.totales.pedidos).toBe(24);
  });

  it("acepta el filtro de comercio", async () => {
    const j = await (await pedir(`?comercio=${slugA}`)).json();
    expect(j.totales.pedidos).toBe(12);
    expect(j.rango.comercio).toBe(slugA);
  });
});
