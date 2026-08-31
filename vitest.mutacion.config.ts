import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Configuración para el mutation testing (punto 14 de la auditoría).
 *
 * Incluye solo las pruebas que NO tocan la base. Dos razones:
 *
 *  1. Stryker corre cada mutante contra la suite, cientos de veces. Con las
 *     pruebas de integración eso serían horas.
 *  2. Stryker paraleliza en varios procesos y todas las pruebas de integración
 *     comparten una sola base: se pisarían entre sí y los mutantes muertos
 *     serían ruido, no señal.
 *
 * Por eso `stryker.config.json` muta solo módulos puros. Los que dependen de la
 * base —`reserva.ts`, `ciclo-vida.ts`— quedan fuera del alcance a propósito, y
 * su red son las pruebas de API y de carreras.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: [
      "tests/admision.test.ts",
      "tests/identidad.test.ts",
      "tests/estados.test.ts",
      "tests/invariantes.test.ts",
      "tests/revalidar.test.ts",
      "tests/urgencia.test.ts",
      "tests/rutas.test.ts",
      "tests/capas-de-defensa.test.ts",
      "tests/credenciales.test.ts",
      "tests/cercania.test.ts",
      "tests/franjas.test.ts",
      "tests/habitual.test.ts",
      "tests/carrito-guardado.test.ts",
      "tests/version-vieja.test.ts",
      "tests/csv.test.ts",
    ],
    testTimeout: 30000,
  },
});
