/**
 * Prueba de carga — indicador 8 (§14.5): P95 ≤ 2 s.
 *
 *   npm run carga
 *   npm run carga -- --usuarios=60 --duracion=30
 *
 * Mide latencia bajo concurrencia sobre el servidor que esté corriendo. No es un
 * sustituto de una herramienta como k6; es lo suficiente para responder el
 * indicador con evidencia propia y reproducible, sin agregar otra dependencia.
 *
 * Tres decisiones que hacen que el número signifique algo:
 *
 *  1. Se reporta **P95, no el promedio**. El promedio esconde justo la cola que
 *     al usuario le duele: si 19 peticiones tardan 100 ms y una tarda 8 s, el
 *     promedio dice 495 ms y miente sobre la experiencia de esa persona.
 *
 *  2. Se separa por endpoint. Mezclar el menú (lectura cacheable) con la
 *     creación de pedido (transacción con bloqueo) da un número que no describe
 *     ninguna de las dos cosas.
 *
 *  3. Se cuentan los errores. Una prueba de carga con latencia baja porque el
 *     servidor devolvía 500 rápido no es una prueba aprobada.
 */

import "dotenv/config";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

function arg(nombre: string, porDefecto: number): number {
  const v = process.argv
    .find((a) => a.startsWith(`--${nombre}=`))
    ?.slice(nombre.length + 3);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

interface Muestra {
  endpoint: string;
  ms: number;
  status: number;
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  // Método del rango más cercano: con muestras chicas es el que no inventa
  // valores intermedios que nunca se observaron.
  const i = Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1);
  return o[i];
}

async function medir(
  endpoint: string,
  hacer: () => Promise<Response>,
): Promise<Muestra> {
  const t0 = performance.now();
  try {
    const r = await hacer();
    // Se consume el cuerpo: sin esto se mide el tiempo hasta la cabecera, no
    // hasta que la respuesta está completa, que es lo que el usuario espera.
    await r.arrayBuffer();
    return { endpoint, ms: performance.now() - t0, status: r.status };
  } catch {
    return { endpoint, ms: performance.now() - t0, status: 0 };
  }
}

async function main() {
  const usuarios = arg("usuarios", 40);
  const duracionSeg = arg("duracion", 20);
  const slug =
    process.argv.find((a) => a.startsWith("--comercio="))?.slice(11) ??
    "cafeteria-central";

  console.log(`Prueba de carga contra ${BASE}`);
  console.log(
    `  ${usuarios} usuarios simultáneos · ${duracionSeg} s · comercio "${slug}"`,
  );
  console.log("");

  // Verificación previa: sin esto, una prueba contra un servidor caído reporta
  // "0 ms" y parecería un éxito rotundo.
  const sonda = await fetch(`${BASE}/api/comercios/${slug}/menu`).catch(
    () => null,
  );
  if (!sonda || !sonda.ok) {
    console.error(
      `El servidor no responde en ${BASE}. Levantalo con "npm run dev" antes de medir.`,
    );
    process.exit(1);
  }
  const menu = await sonda.json();
  const productos = (menu.productos ?? []).filter(
    (p: { elegible: boolean }) => p.elegible,
  );
  if (productos.length === 0) {
    console.error("El comercio no tiene productos anticipables.");
    process.exit(1);
  }
  const productoId = productos[0].id;

  const muestras: Muestra[] = [];
  const hasta = Date.now() + duracionSeg * 1000;

  // Cada "usuario" es un bucle independiente que repite el recorrido real:
  // ver el menú, consultar horas, y consultar su sesión. La creación de pedidos
  // no se incluye acá porque escribiría datos en la base del piloto; la
  // concurrencia de escritura ya está cubierta por `tests/concurrencia.test.ts`,
  // que además verifica correctitud y no solo latencia.
  async function recorrido() {
    while (Date.now() < hasta) {
      muestras.push(
        await medir("GET /menu", () =>
          fetch(`${BASE}/api/comercios/${slug}/menu`),
        ),
      );
      muestras.push(
        await medir("POST /franjas", () =>
          fetch(`${BASE}/api/comercios/${slug}/franjas`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ items: [{ productoId, cantidad: 1 }] }),
          }),
        ),
      );
      muestras.push(
        await medir("GET /sesion", () => fetch(`${BASE}/api/auth/sesion`)),
      );
    }
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: usuarios }, recorrido));
  const total = (performance.now() - t0) / 1000;

  // --- Informe -----------------------------------------------------------
  const endpoints = [...new Set(muestras.map((m) => m.endpoint))];
  const filas = endpoints.map((e) => {
    const propias = muestras.filter((m) => m.endpoint === e);
    const ms = propias.map((m) => m.ms);
    const errores = propias.filter((m) => m.status === 0 || m.status >= 500);
    return {
      endpoint: e,
      n: propias.length,
      p50: percentil(ms, 50),
      p95: percentil(ms, 95),
      p99: percentil(ms, 99),
      max: Math.max(...ms),
      errores: errores.length,
    };
  });

  const ancho = (s: string, n: number) => s.padEnd(n);
  console.log(
    ancho("  endpoint", 18) +
      ancho("n", 8) +
      ancho("p50", 10) +
      ancho("p95", 10) +
      ancho("p99", 10) +
      ancho("máx", 10) +
      "errores",
  );
  console.log("  " + "─".repeat(72));
  for (const f of filas) {
    console.log(
      ancho("  " + f.endpoint, 18) +
        ancho(String(f.n), 8) +
        ancho(f.p50.toFixed(0) + " ms", 10) +
        ancho(f.p95.toFixed(0) + " ms", 10) +
        ancho(f.p99.toFixed(0) + " ms", 10) +
        ancho(f.max.toFixed(0) + " ms", 10) +
        String(f.errores),
    );
  }

  const p95Global = percentil(
    muestras.map((m) => m.ms),
    95,
  );
  const errores = muestras.filter((m) => m.status === 0 || m.status >= 500);
  const rps = muestras.length / total;

  console.log("");
  console.log(
    `  ${muestras.length} peticiones en ${total.toFixed(1)} s · ${rps.toFixed(0)} req/s`,
  );
  console.log("");

  const cumpleLatencia = p95Global <= 2000;
  const cumpleErrores = errores.length === 0;

  console.log(
    `  INDICADOR 8 · P95 global ${p95Global.toFixed(0)} ms (meta ≤ 2000 ms): ` +
      (cumpleLatencia ? "CUMPLE" : "NO CUMPLE"),
  );
  console.log(
    `  Errores 5xx o de red: ${errores.length} · ` +
      (cumpleErrores ? "CUMPLE" : "NO CUMPLE"),
  );

  if (!cumpleErrores) {
    // Un P95 bajo con errores no es un aprobado: puede estar bajo justamente
    // porque el servidor devolvía errores rápido.
    console.log("");
    console.log(
      "  Ojo: con errores presentes, el P95 no se puede leer como éxito — el " +
        "servidor puede estar respondiendo rápido porque está fallando.",
    );
  }

  console.log("");
  console.log(
    "  Medido en local, contra el servidor de desarrollo. El número del " +
      "Capítulo V debe medirse contra el despliegue real, que tiene latencia " +
      "de red y arranque en frío.",
  );
  console.log("");

  process.exit(cumpleLatencia && cumpleErrores ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
