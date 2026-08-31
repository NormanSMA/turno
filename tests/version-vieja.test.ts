/**
 * Detección de "la aplicación quedó vieja".
 *
 * Distinguirlo de un corte de red decide qué se le ofrece al usuario. Ofrecer
 * "probar de nuevo" ante un fragmento que ya no existe lo deja en un callejón:
 * el mapa de fragmentos en memoria sigue siendo el viejo y la pantalla vuelve a
 * pedir el mismo archivo inexistente para siempre.
 */

import { describe, expect, it } from "vitest";
import { esVersionVieja } from "@/core/version-vieja";

describe("errores que SÍ son versión vieja", () => {
  it("ChunkLoadError por nombre", () => {
    expect(esVersionVieja({ name: "ChunkLoadError", message: "" })).toBe(true);
  });

  it("el mensaje de webpack", () => {
    expect(
      esVersionVieja({ name: "Error", message: "Loading chunk 42 failed." }),
    ).toBe(true);
  });

  it("el mensaje de Next con turbopack", () => {
    expect(
      esVersionVieja({
        name: "Error",
        message: "Failed to load chunk /_next/static/chunks/2t26h58agdjoz.js",
      }),
    ).toBe(true);
  });

  it("el de un módulo dinámico en Safari y Firefox", () => {
    // Cada navegador redacta este fallo distinto; el usuario ve el mismo
    // problema en los tres.
    expect(
      esVersionVieja({ name: "TypeError", message: "Importing a module script failed." }),
    ).toBe(true);
    expect(
      esVersionVieja({
        name: "TypeError",
        message: "error loading dynamically imported module",
      }),
    ).toBe(true);
  });
});

describe("errores que NO", () => {
  it("un fallo de red común", () => {
    // Acá "probar de nuevo" SÍ sirve, así que no hay que recargar entera la
    // aplicación ni tirar el caché que la hace funcionar sin conexión.
    expect(
      esVersionVieja({ name: "TypeError", message: "Failed to fetch" }),
    ).toBe(false);
  });

  it("un error del dominio", () => {
    expect(
      esVersionVieja({ name: "Error", message: "No hay capacidad en esa franja" }),
    ).toBe(false);
  });

  it("un error sin datos no se asume vencido", () => {
    // Ante la duda, no se recarga: una recarga equivocada pierde lo que el
    // usuario estuviera haciendo.
    expect(esVersionVieja({})).toBe(false);
  });
});
