/**
 * A dónde aterriza quien acaba de entrar.
 *
 * Estas pruebas nacen de un caso real: el operador de Subway entraba con su
 * cuenta y aparecía en la cocina de otro comercio. Dos causas encadenadas.
 *
 * La primera era un slug escrito a mano en el código como destino de cualquier
 * operador. La segunda, más silenciosa: el navegador recuerda la dirección de
 * acceso con su `?volver=`, así que basta haber abierto una vez la cocina de
 * otro local para que todos los accesos siguientes vuelvan ahí.
 *
 * La regla que se protege es la que dijo Norman en una línea: **si entrás con
 * las credenciales de un local, entrás a ese local**.
 */

import { describe, expect, it } from "vitest";
import { destinoTrasEntrar } from "@/core/rutas";

const SUBWAY = { rol: "COMERCIO", comercioSlug: "subway" };

describe("un operador entra a su comercio", () => {
  it("sin destino previo, va a su cocina", () => {
    expect(destinoTrasEntrar({ volver: null, ...SUBWAY })).toBe("/cocina/subway");
  });

  it("el caso que lo motivó: un volver guardado de otro local se descarta", () => {
    /*
     * Es exactamente lo que pasaba: la dirección guardada apuntaba a un
     * comercio que además ya no existe, así que el operador entraba y se
     * encontraba un error en vez de su cocina.
     */
    expect(
      destinoTrasEntrar({ volver: "/cocina/cafeteria-central", ...SUBWAY }),
    ).toBe("/cocina/subway");
  });

  it("tampoco lo lleva al panel de otro comercio", () => {
    expect(
      destinoTrasEntrar({ volver: "/comercio/florencia", ...SUBWAY }),
    ).toBe("/cocina/subway");
  });

  it("pero sí respeta su propia cocina y su propio panel", () => {
    expect(destinoTrasEntrar({ volver: "/cocina/subway", ...SUBWAY })).toBe(
      "/cocina/subway",
    );
    expect(destinoTrasEntrar({ volver: "/comercio/subway", ...SUBWAY })).toBe(
      "/comercio/subway",
    );
  });

  it("respeta rutas que no son de ningún comercio", () => {
    // El perfil o los avisos son de la persona, no de un local: filtrarlos
    // sería quitarle un destino legítimo sin ganar nada.
    expect(destinoTrasEntrar({ volver: "/avisos", ...SUBWAY })).toBe("/avisos");
    expect(destinoTrasEntrar({ volver: "/perfil", ...SUBWAY })).toBe("/perfil");
  });

  it("no se deja engañar por un prefijo parecido", () => {
    // "/cocina/subway-2" empieza igual que "/cocina/subway" pero es otro local.
    expect(
      destinoTrasEntrar({ volver: "/cocina/subway-2", ...SUBWAY }),
    ).toBe("/cocina/subway");
  });

  it("y sigue rechazando destinos que se van del sitio", () => {
    // La protección de siempre: `volver` viene de la dirección, o sea del
    // exterior. Un destino externo convierte el acceso en un redirector.
    for (const malo of [
      "//evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "/\\evil.example",
    ]) {
      expect(destinoTrasEntrar({ volver: malo, ...SUBWAY }), malo).toBe(
        "/cocina/subway",
      );
    }
  });
});

describe("el administrador", () => {
  const ADMIN = { rol: "ADMIN", comercioSlug: null };

  it("sin destino previo va al panel, no a una cocina", () => {
    expect(destinoTrasEntrar({ volver: null, ...ADMIN })).toBe("/panel");
  });

  it("sí puede entrar a la cocina de cualquier comercio", () => {
    // No tiene comercio propio y su trabajo es mirar todos: filtrarle por
    // comercio lo dejaría sin poder abrir ninguno.
    expect(
      destinoTrasEntrar({ volver: "/cocina/florencia", ...ADMIN }),
    ).toBe("/cocina/florencia");
  });
});

describe("casos raros que no pueden reventar", () => {
  it("un operador sin comercio asignado va a la portada", () => {
    // No hay cocina que abrirle. Mandarlo a `/cocina/null` sería un error
    // fabricado por nosotros.
    expect(
      destinoTrasEntrar({ volver: null, rol: "COMERCIO", comercioSlug: null }),
    ).toBe("/");
  });

  it("un estudiante con un volver normal lo conserva", () => {
    expect(
      destinoTrasEntrar({
        volver: "/mis-pedidos",
        rol: "ESTUDIANTE",
        comercioSlug: null,
      }),
    ).toBe("/mis-pedidos");
  });
});
