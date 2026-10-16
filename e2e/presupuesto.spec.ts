/**
 * Presupuesto de JS por ruta (ADR-23, sección 4).
 *
 * Mide los KB comprimidos de JavaScript que baja una visita en frío (contexto
 * nuevo, sin caché) a cada ruta, sobre la compilación de producción. Falla si
 * una ruta pasa de su techo, y falla si una ruta que no es del panel descarga
 * Recharts, TanStack Table o Lottie en la carga inicial.
 *
 * Medición del 2026-10-15 (KB comprimidos, visita en frío), antes y después de sacar
 * Motion de la navegación y del layout: `/` 239 a 185, `/explorar` 239 a 185,
 * `/c/[slug]` 248 a 194, `/pedido/[id]` 242 a 233, cocina 220 a 186, informe 235 a 229,
 * `/panel` 660 a 606 (Recharts, diferido) y `/panel/simulador` 230 a 176. Antes de
 * cargar las hojas con `next/dynamic` eran 267 a 277. Motion solo se descarga donde
 * hay mascota, personaje o gráficos animados (`ConMovimiento`).
 *
 * Los techos son esa línea base más un margen de 6 %: no
 * son la meta del ADR (110 a 140 KB), son el freno para que no empeore. Cada
 * vez que una mejora baja el peso, se baja el techo en el mismo cambio.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { consultar, entrar } from "./sesion";

const ESTUDIANTE = "estudiante001@uam.edu.ni";
const COMERCIO = "jaguar@uamv.edu.ni";
const ADMIN = "admin@uamv.edu.ni";
const SLUG = "comedor-el-jaguar";

/** Techos en KB comprimidos. */
const TECHOS: { ruta: string; correo?: string; kb: number; pesados: boolean }[] = [
  { ruta: "/", kb: 196, pesados: false },
  { ruta: "/explorar", correo: ESTUDIANTE, kb: 196, pesados: false },
  { ruta: `/c/${SLUG}`, correo: ESTUDIANTE, kb: 206, pesados: false },
  { ruta: "PEDIDO", correo: ESTUDIANTE, kb: 247, pesados: false },
  { ruta: `/cocina/${SLUG}`, correo: COMERCIO, kb: 197, pesados: false },
  { ruta: `/comercio/${SLUG}?ver=informe`, correo: COMERCIO, kb: 243, pesados: false },
  { ruta: "/panel", correo: ADMIN, kb: 642, pesados: true },
  { ruta: "/panel/simulador", correo: ADMIN, kb: 187, pesados: false },
];

const PESADOS = /recharts|lottie|createTable|useTable/;

test.describe("presupuesto de JS por ruta", () => {
  for (const caso of TECHOS) {
    test(`${caso.ruta.slice(0, 40)} no pasa de ${caso.kb} KB`, async ({ browser }) => {
      let ruta = caso.ruta;
      if (ruta === "PEDIDO") {
        const [p] = await consultar<{ id: string }>(
          `SELECT p.id FROM pedido p JOIN usuario u ON u.id = p."usuarioId"
           WHERE u.correo = $1 ORDER BY p."creadoEn" DESC LIMIT 1`,
          [ESTUDIANTE],
        );
        test.skip(!p, "sin pedidos demo");
        ruta = `/pedido/${p!.id}`;
      }

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      if (caso.correo) await entrar(ctx, caso.correo);
      const page = await ctx.newPage();
      await page.goto(ruta, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      const archivos = await page.evaluate(() => [
        ...new Map(
          (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
            .filter((e) => e.name.includes("/_next/static/") && e.name.endsWith(".js"))
            .map((e) => [e.name, { nombre: e.name.split("/").pop() as string, bytes: e.encodedBodySize }]),
        ).values(),
      ]);
      await ctx.close();

      const kb = archivos.reduce((a, f) => a + f.bytes, 0) / 1024;
      const pesados = archivos
        .filter((f) => f.bytes > 5_000 && PESADOS.test(readFileSync(`.next/static/chunks/${f.nombre}`, "utf8")))
        .map((f) => f.nombre);

      test.info().annotations.push({ type: "kb", description: kb.toFixed(0) });

      if (!caso.pesados) {
        expect(pesados, `${ruta} descarga librerías pesadas en la carga inicial`).toEqual([]);
      }
      expect(kb, `${ruta}: ${kb.toFixed(0)} KB de JS comprimido`).toBeLessThanOrEqual(caso.kb);
    });
  }
});
