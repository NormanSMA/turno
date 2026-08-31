/**
 * Exploración del espacio de parámetros (§15).
 *
 *   npm run simular
 *   npm run simular -- --calibrar
 *
 * Responde las preguntas que el piloto no puede responder, porque no se puede
 * experimentar con un negocio real: ¿cuál es el Δ óptimo? ¿qué α maximiza
 * pedidos sin bajar del 90% de cumplimiento? ¿hasta qué volumen aguanta?
 *
 * Con `--calibrar` toma los parámetros observados de la base (t(p) reales,
 * personal, Δ, α y demanda diaria medida) en vez de los valores por defecto.
 * Ese paso es el que le da validez externa: sin calibrar contra lo observado,
 * la simulación es un juguete.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  alfaOptimo,
  barrer,
  simular,
  volumenSostenible,
  type ParametrosSimulacion,
  type ProductoSim,
} from "../src/core/simulador";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const pct = (v: number) => (v * 100).toFixed(1) + "%";

function tabla(filas: Record<string, string>[]) {
  if (filas.length === 0) return;
  const cols = Object.keys(filas[0]);
  const ancho = cols.map((c) =>
    Math.max(c.length, ...filas.map((f) => f[c].length)),
  );
  const linea = (celdas: string[]) =>
    "  " + celdas.map((c, i) => c.padEnd(ancho[i])).join("  ");
  console.log(linea(cols));
  console.log("  " + ancho.map((a) => "─".repeat(a)).join("  "));
  for (const f of filas) console.log(linea(cols.map((c) => f[c])));
}

/** Lee del piloto los parámetros que hay que meterle al modelo. */
async function calibrar(slug: string): Promise<ParametrosSimulacion | null> {
  const comercio = await prisma.comercio.findUnique({ where: { slug } });
  if (!comercio) return null;

  const productos = await prisma.producto.findMany({
    where: { comercioId: comercio.id, anticipable: true, archivado: false },
  });
  if (productos.length === 0) return null;

  // El peso de cada producto en la demanda sale de cuántas veces se pidió de
  // verdad, no de una suposición.
  const conteos = await prisma.itemPedido.groupBy({
    by: ["productoId"],
    where: { producto: { comercioId: comercio.id } },
    _sum: { cantidad: true },
  });
  const peso = new Map(conteos.map((c) => [c.productoId, c._sum.cantidad ?? 0]));

  const productosSim: ProductoSim[] = productos.map((p) => ({
    id: p.id,
    tiempoPreparacionMin: p.tiempoPreparacionMin,
    peso: Math.max(1, peso.get(p.id) ?? 1),
  }));

  // Demanda diaria observada: pedidos por día con actividad.
  const pedidos = await prisma.pedido.findMany({
    where: { franja: { comercioId: comercio.id } },
    select: { creadoEn: true, condicionExperimental: true },
  });
  const dias = new Set(
    pedidos.map((p) => p.creadoEn.toISOString().slice(0, 10)),
  ).size;
  const demandaDiaria = dias === 0 ? 30 : Math.round(pedidos.length / dias);
  const enB = pedidos.filter((p) => p.condicionExperimental === "B").length;

  const franja = await prisma.franja.findFirst({
    where: { comercioId: comercio.id },
    orderBy: { inicio: "asc" },
  });
  const apertura = franja
    ? franja.inicio.getHours() * 60 + franja.inicio.getMinutes()
    : 11 * 60 + 30;

  return {
    anchoFranjaMin: comercio.anchoFranjaMin,
    factorSeguridad: Number(comercio.factorSeguridad),
    personalCocina: comercio.personalCocina,
    aperturaMin: apertura,
    cierreMin: apertura + 90,
    demandaDiaria,
    productos: productosSim,
    proporcionB: pedidos.length === 0 ? 0.5 : enB / pedidos.length,
    // Sin dato de campo todavía: la adherencia a la sugerencia se mide en el
    // piloto comparando franja solicitada contra franja asignada. Hasta
    // entonces es un supuesto declarado, no un número medido.
    adherenciaB: 0.75,
    tasaNoShow: 0.06,
    // Ídem: sale de cronometrar la preparación real varias veces por producto.
    variabilidadCocina: 0.25,
    margenCutoffMin: comercio.margenCutoffMin,
    dias: 20,
    semilla: 42,
  };
}

const POR_DEFECTO: ParametrosSimulacion = {
  anchoFranjaMin: 10,
  factorSeguridad: 0.85,
  personalCocina: 4,
  aperturaMin: 11 * 60 + 30,
  cierreMin: 13 * 60,
  demandaDiaria: 30,
  productos: [
    { id: "almuerzo", tiempoPreparacionMin: 12, peso: 3 },
    { id: "pizza", tiempoPreparacionMin: 10, peso: 3 },
    { id: "quesillo", tiempoPreparacionMin: 5, peso: 2 },
    { id: "cafe", tiempoPreparacionMin: 3, peso: 2 },
  ],
  proporcionB: 0.5,
  adherenciaB: 0.75,
  tasaNoShow: 0.06,
  variabilidadCocina: 0.25,
  margenCutoffMin: 2,
  dias: 20,
  semilla: 42,
};

async function main() {
  const calibrado = process.argv.includes("--calibrar");
  const slug =
    process.argv.find((a) => a.startsWith("--comercio="))?.slice(11) ??
    "cafeteria-central";

  let base = POR_DEFECTO;
  if (calibrado) {
    const c = await calibrar(slug);
    if (!c) {
      console.error(`No hay datos suficientes de "${slug}" para calibrar.`);
      process.exit(1);
    }
    base = c;
    console.log(`Calibrado con los datos observados de "${slug}".`);
  } else {
    console.log("Parámetros por defecto. Usá --calibrar para tomar los del piloto.");
  }

  console.log("");
  console.log(
    `  Δ = ${base.anchoFranjaMin} min · α = ${base.factorSeguridad} · ` +
      `${base.personalCocina} en cocina · demanda ${base.demandaDiaria}/día · ` +
      `${base.dias} días simulados`,
  );

  // --- Validación: ¿el modelo reproduce el escenario base? ---------------
  const control = simular(base);
  console.log("");
  console.log("ESCENARIO BASE");
  console.log(
    `  admite ${pct(control.tasaAdmision)} de los intentos · ` +
      `cumple ${pct(control.tasaCumplimiento)} · ` +
      `pico/promedio ${control.relacionPicoPromedio.toFixed(2)} · ` +
      `aprovecha ${pct(control.aprovechamiento)} de la capacidad`,
  );

  // --- ¿Cuál es el Δ óptimo? --------------------------------------------
  console.log("");
  console.log("ANCHO DE FRANJA (Δ)");
  const porAncho = barrer(base, {
    anchos: [5, 10, 15, 20, 30],
    repeticiones: 6,
  });
  tabla(
    porAncho.map((p) => ({
      "Δ": `${p.anchoFranjaMin} min`,
      admite: pct(p.tasaAdmision),
      cumple: pct(p.tasaCumplimiento),
      "pico/prom": p.relacionPicoPromedio.toFixed(2),
      aprovecha: pct(p.aprovechamiento),
    })),
  );
  console.log(
    "  Δ angosto da promesas más precisas y rechaza más; Δ ancho al revés.",
  );

  // --- ¿Qué α maximiza pedidos sin bajar del 90%? ------------------------
  console.log("");
  console.log("FACTOR DE SEGURIDAD (α)");
  const porAlfa = barrer(base, {
    alfas: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1],
    demandas: [base.demandaDiaria * 3],
    repeticiones: 6,
  });
  tabla(
    porAlfa.map((p) => ({
      "α": p.factorSeguridad.toFixed(2),
      "sirve/día": p.admitidosPorDia.toFixed(1),
      cumple: pct(p.tasaCumplimiento),
      aprovecha: pct(p.aprovechamiento),
    })),
  );

  const mejor = alfaOptimo(porAlfa, 0.9);
  if (mejor) {
    console.log("");
    console.log(
      `  → α = ${mejor.factorSeguridad.toFixed(2)} sirve más pedidos ` +
        `(${mejor.admitidosPorDia.toFixed(0)} por día bajo demanda saturada) ` +
        `sin bajar del 90% de cumplimiento.`,
    );
  } else {
    console.log("");
    console.log(
      "  → Ningún α alcanza el 90% de cumplimiento con esta demanda. El " +
        "problema no está en α: está en la capacidad de la cocina.",
    );
  }

  // --- ¿Hasta qué volumen aguanta? --------------------------------------
  console.log("");
  console.log("VOLUMEN DIARIO");
  const porDemanda = barrer(base, {
    demandas: [20, 40, 60, 80, 120, 160, 240],
    repeticiones: 6,
  });
  tabla(
    porDemanda.map((p) => ({
      "intentos/día": String(p.demandaDiaria),
      "sirve/día": p.admitidosPorDia.toFixed(1),
      admite: pct(p.tasaAdmision),
      cumple: pct(p.tasaCumplimiento),
    })),
  );

  const techo = volumenSostenible(porDemanda, 0.9);
  console.log("");
  if (techo) {
    console.log(
      `  → Con Δ = ${base.anchoFranjaMin} min y α = ${base.factorSeguridad}, el ` +
        `comercio SIRVE hasta ${techo.servidosPorDia.toFixed(0)} pedidos por día ` +
        `manteniendo el cumplimiento sobre 90%.`,
    );
    console.log(
      `    Ese techo se alcanza con ${techo.demandaEnSaturacion} intentos ` +
        `diarios, y ahí ya se rechaza ${pct(techo.tasaRechazo)} de la demanda.`,
    );
    console.log(
      "    Ojo con la lectura: el cumplimiento se mantiene alto PORQUE el " +
        "sistema rechaza. Servir más exige más personal, otra ventana de " +
        "servicio o un segundo punto de retiro — no un α más alto.",
    );
  } else {
    console.log("  → Ningún volumen probado sostiene el 90% de cumplimiento.");
  }

  console.log("");
  console.log(
    "Estos números salen de un MODELO. Valen en la medida en que sus " +
      "parámetros estén calibrados con mediciones de campo y el modelo " +
      "reproduzca lo observado en el piloto.",
  );
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
