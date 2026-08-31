import { describe, expect, it } from "vitest";
import {
  asignarCondicion,
  esCorreoInstitucional,
  evaluarSesion,
  evaluarToken,
  expiracionEnlace,
  expiracionSesion,
  generarToken,
  hashToken,
  normalizarCorreo,
  tokenCoincide,
} from "@/core/identidad";
import {
  puedeOperarPedido,
  puedeVerCocina,
  puedeVerPedido,
  type SesionActiva,
} from "@/core/autorizacion";

describe("correo institucional — la muestra ES la población declarada", () => {
  it("acepta los dominios de la UAM", () => {
    expect(esCorreoInstitucional("juan.perez@uam.edu.ni")).toBe(true);
    expect(esCorreoInstitucional("ana@uamv.edu.ni")).toBe(true);
  });

  it("normaliza mayúsculas y espacios antes de comparar", () => {
    expect(normalizarCorreo("  Juan@UAM.edu.NI ")).toBe("juan@uam.edu.ni");
    expect(esCorreoInstitucional("  Juan@UAM.edu.NI ")).toBe(true);
  });

  it("rechaza dominios externos", () => {
    expect(esCorreoInstitucional("juan@gmail.com")).toBe(false);
    expect(esCorreoInstitucional("juan@uam.edu.ni.attacker.com")).toBe(false);
  });

  it("rechaza el sufijo colado dentro del nombre de usuario", () => {
    expect(esCorreoInstitucional("uam.edu.ni@gmail.com")).toBe(false);
  });

  it("rechaza cadenas que no son correos", () => {
    expect(esCorreoInstitucional("juan")).toBe(false);
    expect(esCorreoInstitucional("")).toBe(false);
    expect(esCorreoInstitucional("a@b")).toBe(false);
  });
});

describe("tokens", () => {
  it("genera tokens distintos y de alta entropía", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generarToken()));
    expect(tokens.size).toBe(500);
    expect(generarToken().length).toBeGreaterThanOrEqual(43); // 32 bytes b64url
  });

  it("el hash no permite recuperar el token", () => {
    const t = generarToken();
    const h = hashToken(t);
    expect(h).not.toContain(t);
    expect(h).toHaveLength(64);
  });

  it("el mismo token produce el mismo hash y otro token no", () => {
    const t = generarToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(tokenCoincide(t, hashToken(t))).toBe(true);
    expect(tokenCoincide(generarToken(), hashToken(t))).toBe(false);
  });

  it("la comparación tolera un hash malformado sin lanzar", () => {
    expect(tokenCoincide(generarToken(), "corto")).toBe(false);
  });
});

describe("vigencia", () => {
  const base = new Date("2026-09-01T12:00:00Z");

  it("el enlace vive 15 minutos", () => {
    expect(expiracionEnlace(base).toISOString()).toBe("2026-09-01T12:15:00.000Z");
  });

  it("la sesión vive dentro del rango 60–90 días (§11.3)", () => {
    const dias =
      (expiracionSesion(base).getTime() - base.getTime()) / 86_400_000;
    expect(dias).toBeGreaterThanOrEqual(60);
    expect(dias).toBeLessThanOrEqual(90);
  });

  it("un token válido pasa", () => {
    expect(
      evaluarToken({ expiraEn: expiracionEnlace(base), usadoEn: null }, base),
    ).toEqual({ valido: true });
  });

  it("un token expirado no sirve", () => {
    expect(
      evaluarToken(
        { expiraEn: base, usadoEn: null },
        new Date(base.getTime() + 1000),
      ),
    ).toMatchObject({ valido: false, motivo: "EXPIRADO" });
  });

  it("un token ya usado no vuelve a servir", () => {
    expect(
      evaluarToken({ expiraEn: expiracionEnlace(base), usadoEn: base }, base),
    ).toMatchObject({ valido: false, motivo: "YA_USADO" });
  });

  it("un token inexistente se trata igual que uno inválido", () => {
    expect(evaluarToken(null, base)).toMatchObject({ motivo: "INEXISTENTE" });
  });

  it("una sesión revocada deja de valer aunque no haya expirado", () => {
    expect(
      evaluarSesion(
        { expiraEn: expiracionSesion(base), revocadaEn: base },
        base,
      ),
    ).toMatchObject({ valido: false });
  });
});

describe("asignación experimental", () => {
  it("reparte A y B de forma aproximadamente equilibrada", () => {
    const n = 4000;
    let a = 0;
    for (let i = 0; i < n; i++) if (asignarCondicion() === "A") a++;
    // Margen amplio: se comprueba que no está sesgado, no la aleatoriedad fina.
    expect(a / n).toBeGreaterThan(0.44);
    expect(a / n).toBeLessThan(0.56);
  });
});

describe("autorización de lectura de pedido (IDOR)", () => {
  const estudiante: SesionActiva = {
    sesionId: "s1",
    usuarioId: "u1",
    correo: "a@uam.edu.ni",
    nombre: null,
    rol: "ESTUDIANTE",
    comercioId: null,
    condicionExperimental: "A",
  };
  const operador: SesionActiva = { ...estudiante, usuarioId: "u9", rol: "COMERCIO", comercioId: "c1" };
  const admin: SesionActiva = { ...estudiante, usuarioId: "u0", rol: "ADMIN" };
  const pedido = { usuarioId: "u1", comercioId: "c1" };

  it("el dueño ve su pedido", () => {
    expect(puedeVerPedido(estudiante, pedido)).toBe(true);
  });

  it("otro estudiante NO ve el pedido ajeno", () => {
    expect(puedeVerPedido({ ...estudiante, usuarioId: "u2" }, pedido)).toBe(false);
  });

  it("el comercio que lo prepara sí lo ve", () => {
    expect(puedeVerPedido(operador, pedido)).toBe(true);
  });

  it("otro comercio NO lo ve", () => {
    expect(puedeVerPedido({ ...operador, comercioId: "c2" }, pedido)).toBe(false);
  });

  it("un operador sin comercio asignado no ve nada", () => {
    expect(puedeVerPedido({ ...operador, comercioId: null }, pedido)).toBe(false);
  });

  it("el administrador ve todo", () => {
    expect(puedeVerPedido(admin, pedido)).toBe(true);
  });
});

describe("separación de funciones: quién OPERA la cocina", () => {
  const estudiante: SesionActiva = {
    sesionId: "s1",
    usuarioId: "u1",
    correo: "a@uam.edu.ni",
    nombre: null,
    rol: "ESTUDIANTE",
    comercioId: null,
    condicionExperimental: "A",
  };
  const operador: SesionActiva = { ...estudiante, usuarioId: "u9", rol: "COMERCIO", comercioId: "c1" };
  const admin: SesionActiva = { ...estudiante, usuarioId: "u0", rol: "ADMIN" };
  const pedido = { usuarioId: "u1", comercioId: "c1" };

  it("el comercio que lo prepara opera su pedido", () => {
    expect(puedeOperarPedido(operador, pedido)).toBe(true);
    expect(puedeVerCocina(operador, "c1")).toBe(true);
  });

  it("otro comercio no opera el pedido ajeno", () => {
    expect(puedeOperarPedido({ ...operador, comercioId: "c2" }, pedido)).toBe(false);
    expect(puedeVerCocina(operador, "c2")).toBe(false);
  });

  it("el ADMINISTRADOR no opera la cocina aunque lo vea todo", () => {
    // Quien mide el piloto no puede producir el dato que mide: un admin
    // marcando pedidos listos ensuciaría el indicador 2, que es el resultado
    // central del trabajo. Ve, pero no toca.
    expect(puedeVerPedido(admin, pedido)).toBe(true);
    expect(puedeOperarPedido(admin, pedido)).toBe(false);
    expect(puedeVerCocina(admin, "c1")).toBe(false);
  });

  it("el estudiante nunca opera la cocina", () => {
    expect(puedeOperarPedido(estudiante, pedido)).toBe(false);
    expect(puedeVerCocina(estudiante, "c1")).toBe(false);
  });
});
