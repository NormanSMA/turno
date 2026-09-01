/**
 * Registro estructurado.
 *
 * Lo que estas pruebas protegen es que el registro siga siendo **máquina‑
 * legible** y que **no filtre datos personales**. Las dos cosas se rompen sin
 * hacer ruido: una línea con un correo dentro se ve igual de bien que una sin
 * él, y un JSON mal formado solo se descubre el día que hace falta buscar algo.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { aviso, error, info, peticionIdDe, rutaDe } from "@/lib/registro";

/** Captura lo que se emitió, ya parseado. */
function capturar(fn: () => void, canal: "log" | "error" = "log") {
  const lineas: string[] = [];
  const espia = vi
    .spyOn(console, canal)
    .mockImplementation((l: unknown) => void lineas.push(String(l)));
  fn();
  espia.mockRestore();
  return lineas.map((l) => JSON.parse(l));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cada línea es un JSON válido", () => {
  it("lleva marca de tiempo, nivel y evento", () => {
    const [l] = capturar(() => info("pedido_creado", { ruta: "/api/pedidos" }));
    expect(l.nivel).toBe("info");
    expect(l.evento).toBe("pedido_creado");
    expect(l.ruta).toBe("/api/pedidos");
    expect(() => new Date(l.ts).toISOString()).not.toThrow();
  });

  it("los avisos y los errores van por canales distintos", () => {
    // Muchas plataformas solo alertan sobre stderr; mezclarlos haría que un
    // error real se pierda entre trazas informativas.
    expect(capturar(() => aviso("algo", {}))[0].nivel).toBe("aviso");
    expect(
      capturar(() => error("roto", new Error("x")), "error")[0].nivel,
    ).toBe("error");
  });

  it("el contexto arbitrario se conserva", () => {
    const [l] = capturar(() => info("x", { peticionId: "abc", ms: 42 }));
    expect(l.peticionId).toBe("abc");
    expect(l.ms).toBe(42);
  });
});

describe("los errores se describen sin arrastrar el objeto entero", () => {
  it("guarda tipo, mensaje y una pila recortada", () => {
    const [l] = capturar(
      () => error("falló", new TypeError("no es una función")),
      "error",
    );
    expect(l.error.tipo).toBe("TypeError");
    expect(l.error.mensaje).toBe("no es una función");
    expect(l.error.pila.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("no revienta con algo que no es un Error", () => {
    const [l] = capturar(() => error("raro", "solo un texto"), "error");
    expect(l.error.tipo).toBe("desconocido");
    expect(l.error.mensaje).toBe("solo un texto");
  });

  it("no arrastra propiedades del error más allá de las tres previstas", () => {
    /*
     * El caso que motiva la regla: los errores de Prisma traen la consulta con
     * sus parámetros, y ahí van correos y códigos de retiro. Registrar el
     * objeto entero mete datos personales en un sitio donde se quedan meses y
     * se copian a terceros. Este proyecto ya tuvo un hallazgo por imprimir un
     * enlace mágico completo (T‑24).
     */
    const e = new Error("falló la consulta") as Error & { query?: string };
    e.query = "SELECT * FROM usuario WHERE correo = 'quien@uam.edu.ni'";

    const [l] = capturar(() => error("db", e), "error");
    expect(JSON.stringify(l)).not.toContain("quien@uam.edu.ni");
    expect(Object.keys(l.error).sort()).toEqual(["mensaje", "pila", "tipo"]);
  });
});

describe("la ruta se agrupa por forma, no por identificador", () => {
  const con = (url: string) => rutaDe(new Request(url));

  it("reemplaza los uuid", () => {
    expect(
      con("http://x/api/pedidos/9f3a1c2e-1111-4b5c-8d7e-abcdefabcdef"),
    ).toBe("/api/pedidos/:id");
  });

  it("reemplaza los numéricos", () => {
    expect(con("http://x/api/cosas/12345")).toBe("/api/cosas/:id");
  });

  it("deja en paz lo que no es un identificador", () => {
    // Sin esto, agrupar por ruta en el registro no sirve para nada: cada
    // pedido produciría su propia "ruta" y no habría dos líneas comparables.
    expect(con("http://x/api/comercios/comedor-el-jaguar/menu")).toBe(
      "/api/comercios/comedor-el-jaguar/menu",
    );
  });
});

describe("el identificador de petición", () => {
  it("se lee de la cabecera que pone el middleware", () => {
    const req = new Request("http://x/", { headers: { "x-request-id": "abc" } });
    expect(peticionIdDe(req)).toBe("abc");
  });

  it("sin cabecera devuelve undefined y no inventa uno", () => {
    // Un identificador fabricado acá no coincidiría con el que recibió el
    // cliente, y uno que no se puede cruzar es peor que ninguno: parece servir.
    expect(peticionIdDe(new Request("http://x/"))).toBeUndefined();
  });
});
