import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright — puntos 16 a 22 de la auditoría técnica.
 *
 * Apunta al servidor de **producción** en el 3100, no a `next dev`. Es la
 * lección del hallazgo 10: la CSP con nonce, el service worker y el renderizado
 * dinámico solo se comportan como en la realidad en la compilación de
 * producción, y esa era justamente la que no se probaba.
 *
 * `webServer` no se declara a propósito: el servidor lo levanta quien corre la
 * auditoría (`npm run build && npm start -- -p 3100`). Dejar que Playwright lo
 * reconstruya solo sería recompilar `.next` mientras alguien tiene la
 * aplicación abierta, que es el aviso operativo de `status.md`.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./audit/e2e/artefactos",
  /*
   * El nombre del proyecto va en la ruta.
   *
   * Sin `{projectName}`, los proyectos `escritorio` y `oscuro` escriben el
   * MISMO archivo: la primera corrida en oscuro pisó las seis capturas claras
   * y la regresión visual pasó a comparar cada tema contra el otro. Un tema por
   * carpeta es lo que hace que la prueba signifique algo.
   */
  snapshotPathTemplate:
    "./e2e/instantaneas/{testFilePath}/{projectName}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    // Umbral de regresión visual: se toleran diferencias de antialiasing entre
    // corridas, no cambios de diseño. Con 0 toda captura falla por el
    // subpíxel; con 0.05 pasa un cambio real de color de botón.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "audit/e2e/informe", open: "never" }],
    ["json", { outputFile: "audit/e2e/resultados.json" }],
  ],
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-NI",
    timezoneId: "America/Managua",
  },
  /*
   * Dos temas, dos proyectos.
   *
   * La suite corría solo en claro, y eso dejó a `--color-texto-3` meses en
   * 3.97:1 sobre fondo oscuro sin que nadie lo midiera: la mitad oscura del
   * Design System era un punto ciego con forma de prueba en verde.
   *
   * `escritorio` declara el claro explícitamente —era el predeterminado de
   * Playwright, pero un predeterminado no es una decisión— y corre todo.
   * `oscuro` corre lo que de verdad depende del tema: accesibilidad y
   * regresión visual. Duplicar el flujo de compra entero no mediría nada
   * nuevo y pagaría el doble de minutos por ello.
   */
  projects: [
    {
      name: "escritorio",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "oscuro",
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
      grep: /axe|regresión visual/,
    },
  ],
});
