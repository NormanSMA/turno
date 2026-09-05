/**
 * Las cabeceras de seguridad.
 *
 * Existen por un fallo real: `Permissions-Policy` declaraba `camera=()` con el
 * comentario "el piloto no usa cámara". Cuando la cocina ganó el lector de QR,
 * esa cabecera siguió ahí, y **gana sobre el permiso que dé la persona**: el
 * navegador ni pregunta, devuelve `NotAllowedError`, y el mostrador ve "cámara
 * bloqueada" justo después de haberla permitido. Nada falla al compilar y nada
 * falla al desplegar; se descubre en el mostrador.
 *
 * Por eso esta prueba mira las dos direcciones. Que la cámara siga abierta —o
 * el escáner muere en silencio— y que lo que nadie usa siga cerrado, para que
 * abrirla no se convierta en la costumbre de abrirlo todo.
 */

import { describe, expect, it } from "vitest";
import config from "../next.config";

async function cabecerasDe(ruta: string): Promise<Map<string, string>> {
  const grupos = await config.headers!();
  const mapa = new Map<string, string>();
  for (const g of grupos) {
    // Las reglas del proyecto son `/:path*`, que cubre todo. Si algún día se
    // acotan, este filtro deja de ser trivial y la prueba sigue valiendo.
    if (g.source === "/:path*" || g.source === ruta) {
      for (const h of g.headers) mapa.set(h.key.toLowerCase(), h.value);
    }
  }
  return mapa;
}

describe("Permissions-Policy", () => {
  it("deja la cámara abierta para el propio origen", async () => {
    // Sin esto, el lector de QR de la cocina no arranca ni preguntando.
    const politica = (await cabecerasDe("/cocina")).get("permissions-policy");
    expect(politica).toContain("camera=(self)");
  });

  it("no se la concede a terceros incrustados", async () => {
    // `camera=*` abriría la cámara a cualquier iframe de la página.
    const politica = (await cabecerasDe("/cocina")).get("permissions-policy")!;
    expect(politica).not.toContain("camera=*");
  });

  it("mantiene cerrado lo que nada usa", async () => {
    const politica = (await cabecerasDe("/")).get("permissions-policy")!;
    for (const cerrado of ["microphone=()", "geolocation=()", "payment=()"]) {
      expect(politica, cerrado).toContain(cerrado);
    }
  });
});

describe("las demás cabeceras de seguridad siguen puestas", () => {
  it("no se puede incrustar la aplicación en un marco ajeno", async () => {
    expect((await cabecerasDe("/")).get("x-frame-options")).toBe("DENY");
  });

  it("el navegador no adivina el tipo de contenido", async () => {
    expect((await cabecerasDe("/")).get("x-content-type-options")).toBe(
      "nosniff",
    );
  });

  it("HTTPS estricto, con subdominios", async () => {
    const hsts = (await cabecerasDe("/")).get("strict-transport-security")!;
    expect(hsts).toContain("includeSubDomains");
    // Un max-age corto no protege: el navegador olvida antes de que sirva.
    const edad = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(edad).toBeGreaterThanOrEqual(31536000);
  });
});
