import { describe, expect, it } from "vitest";
import {
  hashPassword,
  LARGO_MINIMO,
  passwordSugerida,
  usaPassword,
  validarPassword,
  verificarPassword,
} from "@/core/credenciales";

describe("política de contraseñas", () => {
  it("exige el largo mínimo", () => {
    expect(validarPassword("a".repeat(LARGO_MINIMO - 1)).valida).toBe(false);
    expect(validarPassword("a".repeat(LARGO_MINIMO)).valida).toBe(true);
  });

  it("rechaza una cadena enorme", () => {
    // Sin cota superior, una contraseña gigante convierte el login en un ataque
    // de denegación por consumo de memoria contra el propio servidor.
    expect(validarPassword("a".repeat(5000)).valida).toBe(false);
  });

  it("rechaza espacios al principio o al final", () => {
    expect(validarPassword(" contraseña larga").valida).toBe(false);
    expect(validarPassword("contraseña larga ").valida).toBe(false);
    // Pero adentro sí: una frase de paso es una buena contraseña.
    expect(validarPassword("mi frase de paso larga").valida).toBe(true);
  });
});

describe("derivación y verificación", () => {
  it("verifica la contraseña correcta", async () => {
    const h = await hashPassword("contraseña de prueba");
    expect(await verificarPassword("contraseña de prueba", h)).toBe(true);
  });

  it("rechaza la incorrecta", async () => {
    const h = await hashPassword("contraseña de prueba");
    expect(await verificarPassword("contraseña de pruebA", h)).toBe(false);
    expect(await verificarPassword("", h)).toBe(false);
  });

  it("nunca guarda la contraseña en claro", async () => {
    const h = await hashPassword("contraseña de prueba");
    expect(h).not.toContain("contraseña");
    expect(h.startsWith("scrypt$")).toBe(true);
  });

  it("dos hashes de la misma contraseña son distintos (sal por usuario)", async () => {
    // Sin sal por usuario, dos cuentas con la misma contraseña se delatarían
    // entre sí en un volcado de la base.
    const a = await hashPassword("contraseña de prueba");
    const b = await hashPassword("contraseña de prueba");
    expect(a).not.toBe(b);
    expect(await verificarPassword("contraseña de prueba", a)).toBe(true);
    expect(await verificarPassword("contraseña de prueba", b)).toBe(true);
  });

  it("el hash lleva sus propios parámetros de coste", async () => {
    const h = await hashPassword("contraseña de prueba");
    const [algoritmo, N, r, p] = h.split("$");
    expect(algoritmo).toBe("scrypt");
    // Versionar el coste permite subirlo después sin invalidar lo existente.
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it("no lanza ante un hash ausente o corrupto: devuelve false", async () => {
    // Un registro corrupto no debe distinguirse de una contraseña equivocada.
    expect(await verificarPassword("x", null)).toBe(false);
    expect(await verificarPassword("x", undefined)).toBe(false);
    expect(await verificarPassword("x", "")).toBe(false);
    expect(await verificarPassword("x", "basura")).toBe(false);
    expect(await verificarPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
    expect(await verificarPassword("x", "bcrypt$1$1$1$aaaa$bbbb")).toBe(false);
  });

  it("normaliza unicode: la misma contraseña tecleada distinto entra igual", async () => {
    // "é" compuesta vs descompuesta son cadenas distintas con el mismo aspecto.
    const compuesta = "contraseñaé larga";
    const descompuesta = compuesta.normalize("NFD");
    expect(compuesta).not.toBe(descompuesta);
    const h = await hashPassword(compuesta);
    expect(await verificarPassword(descompuesta, h)).toBe(true);
  });
});

describe("contraseña sugerida", () => {
  it("cumple la política", () => {
    for (let i = 0; i < 20; i++) {
      expect(validarPassword(passwordSugerida()).valida).toBe(true);
    }
  });

  it("no repite valores", () => {
    const s = new Set(Array.from({ length: 200 }, () => passwordSugerida()));
    expect(s.size).toBe(200);
  });

  it("no usa caracteres ambiguos: se dicta en un mostrador ruidoso", () => {
    const generadas = Array.from({ length: 50 }, () => passwordSugerida()).join("");
    for (const c of ["l", "I", "O", "o", "0", "1"]) {
      expect(generadas).not.toContain(c);
    }
  });
});

describe("qué rol usa contraseña", () => {
  it("solo las cuentas de operación", () => {
    expect(usaPassword("ADMIN")).toBe(true);
    expect(usaPassword("COMERCIO")).toBe(true);
    // El estudiante no tiene contraseña: no hay nada que robarle ni recuperar.
    expect(usaPassword("ESTUDIANTE")).toBe(false);
  });
});
