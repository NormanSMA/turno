/**
 * Capturas de referencia del rediseño — tarea 0.3 del plan.
 *
 * NO es regresión visual: eso ya lo hace `interfaz.spec.ts` con
 * `toHaveScreenshot`, que compara contra una instantánea y falla si difiere.
 * Esto es otra cosa — un archivo del "antes" que un humano mira al lado del
 * "después" para juzgar si el rediseño mejoró algo. Sin él, terminada la
 * fase 9 no habría con qué comparar más que el recuerdo.
 *
 * Corre solo con `CAPTURAS_BASE=1` (`npm run rediseno:base`). Si corriera con
 * la suite normal, cada `audit:e2e` pisaría el "antes" con el estado actual y
 * el archivo dejaría de servir exactamente para lo que existe.
 *
 * Cinco pantallas × dos temas × dos anchos = veinte archivos.
 */
import { test } from "@playwright/test";
import { entrar } from "./sesion";
import { mkdir } from "node:fs/promises";

const ESTUDIANTE = "estudiante001@uam.edu.ni";
const DESTINO = "audit/visual/base";

const PANTALLAS = [
  { ruta: "/", nombre: "inicio" },
  { ruta: "/explorar", nombre: "explorar" },
  { ruta: "/c/comedor-el-jaguar", nombre: "comercio" },
  { ruta: "/mis-pedidos", nombre: "mis-pedidos" },
  { ruta: "/perfil", nombre: "perfil" },
];

const TEMAS = ["claro", "oscuro"] as const;

/** Móvil real y escritorio, los dos anchos que pide el plan. */
const ANCHOS = [
  { w: 390, h: 844, nombre: "390" },
  { w: 1440, h: 900, nombre: "1440" },
];

test.describe("capturas base del rediseño", () => {
  test.skip(
    process.env.CAPTURAS_BASE !== "1",
    "Solo con CAPTURAS_BASE=1: pisar el 'antes' lo inutiliza.",
  );

  for (const tema of TEMAS) {
    for (const { w, h, nombre: ancho } of ANCHOS) {
      for (const { ruta, nombre } of PANTALLAS) {
        test(`${nombre} · ${tema} · ${ancho}`, async ({ page, context }) => {
          await mkdir(DESTINO, { recursive: true });
          await entrar(context, ESTUDIANTE);
          await page.setViewportSize({ width: w, height: h });

          /*
           * El tema se fija ANTES de la primera navegación.
           *
           * `Arranque` lo lee de `localStorage` durante la carga; ponerlo
           * después obligaría a recargar y dejaría capturado el destello del
           * tema anterior, que es justo lo que no se quiere archivar.
           */
          await context.addInitScript(
            ([clave, valor]) => localStorage.setItem(clave, valor),
            ["turno-tema", tema],
          );

          await page.goto(ruta, { waitUntil: "networkidle" });
          // Las entradas escalonadas y los contadores animados terminan solos;
          // sin esta espera se archiva la pantalla a medio pintar.
          await page.waitForTimeout(1200);

          await page.screenshot({
            path: `${DESTINO}/${nombre}-${tema}-${ancho}.png`,
            fullPage: true,
            animations: "disabled",
          });
        });
      }
    }
  }
});
