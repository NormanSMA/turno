/**
 * Guarda contra el envío accidental a direcciones ficticias.
 *
 * Motivada por un accidente real durante el desarrollo: correr el barrido sobre
 * datos de demostración envió veinte correos a estudiantes inventados del
 * dominio de la universidad. Rebotaron, y los rebotes contra un dominio real
 * castigan la reputación de la misma cuenta que el piloto necesita para que los
 * enlaces mágicos lleguen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { puedeEscribirA } from "@/lib/correo";

beforeEach(() => {
  // `vi.stubEnv` en vez de tocar `process.env` a mano: NODE_ENV es de solo
  // lectura en el tipado de Node, y las variables se restauran solas.
  vi.stubEnv("CORREO_PERMITIDOS", "");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fuera de producción", () => {
  it("sin nada configurado no filtra: el controlador es consola y nada sale", () => {
    expect(puedeEscribirA("cualquiera@uam.edu.ni")).toBe(true);
  });

  it("con cuenta SMTP configurada, solo se escribe a ella misma", () => {
    vi.stubEnv("SMTP_USER", "nsmartinez@uamv.edu.ni");
    expect(puedeEscribirA("nsmartinez@uamv.edu.ni")).toBe(true);
    // Este es exactamente el caso que causó el accidente.
    expect(puedeEscribirA("estudiante042@uam.edu.ni")).toBe(false);
  });

  it("la lista de permitidos amplía sin reemplazar a la cuenta propia", () => {
    vi.stubEnv("SMTP_USER", "nsmartinez@uamv.edu.ni");
    vi.stubEnv("CORREO_PERMITIDOS", "companero@uamv.edu.ni, asesor@uam.edu.ni");
    expect(puedeEscribirA("companero@uamv.edu.ni")).toBe(true);
    expect(puedeEscribirA("asesor@uam.edu.ni")).toBe(true);
    expect(puedeEscribirA("nsmartinez@uamv.edu.ni")).toBe(true);
    expect(puedeEscribirA("estudiante042@uam.edu.ni")).toBe(false);
  });

  it("no distingue mayúsculas ni espacios sobrantes", () => {
    vi.stubEnv("SMTP_USER", "  NSMartinez@UAMV.edu.ni ");
    expect(puedeEscribirA("nsmartinez@uamv.edu.ni")).toBe(true);
    expect(puedeEscribirA(" nsmartinez@uamv.edu.ni ")).toBe(true);
  });
});

describe("en producción", () => {
  it("no filtra: hay que poder escribirle a toda la cohorte", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_USER", "turno@uamv.edu.ni");
    expect(puedeEscribirA("estudiante042@uam.edu.ni")).toBe(true);
  });
});
