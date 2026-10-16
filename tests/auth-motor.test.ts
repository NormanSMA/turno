/**
 * Riesgos del ADR-24, uno por prueba.
 *
 * La fachada (`lib/auth.ts`) conserva el contrato; Better Auth (`auth-motor.ts`)
 * guarda sesiones y vincula Google. Lo que cambió de motor es justo lo que
 * estas pruebas miran: la firma de la cookie, el alta por Google, el vínculo
 * con cuentas de operación y el canje concurrente del enlace.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar } from "./helpers/db";
import { crearOperador, entrarComo, salir } from "./helpers/sesion";
import { limpiarCookies, ponerCookie } from "./helpers/cookies";
import {
  COOKIE_SESION,
  canjearEnlace,
  emitirEnlace,
  sesionActual,
} from "@/lib/auth";
import { auth } from "@/lib/auth-motor";
import type { PrismaClient } from "@/generated/prisma/client";

const db = prisma as unknown as PrismaClient;

beforeAll(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
});

beforeEach(async () => {
  await limpiar(db);
  salir();
});

afterAll(async () => {
  await db.$disconnect();
});

async function estudiante() {
  return db.usuario.create({
    data: {
      correo: `est.${crypto.randomUUID()}@uam.edu.ni`,
      condicionExperimental: "A",
    },
  });
}

describe("la cookie de sesión", () => {
  it("una cookie con la firma alterada no abre sesión", async () => {
    const u = await estudiante();
    const token = await entrarComo(db, u.id);
    expect(await sesionActual()).not.toBeNull();

    limpiarCookies();
    ponerCookie(COOKIE_SESION, `${token.split(".")[0]}.firma-falsa`);
    expect(await sesionActual()).toBeNull();
  });

  it("el token sin firma, tal como está en la base, tampoco sirve", async () => {
    const u = await estudiante();
    await entrarComo(db, u.id);
    const fila = await db.session.findFirstOrThrow({ where: { userId: u.id } });

    limpiarCookies();
    ponerCookie(COOKIE_SESION, fila.token);
    expect(await sesionActual()).toBeNull();
  });

  it("riesgo 1 del ADR: la base guarda el token de sesión en claro, y no sirve solo", async () => {
    const u = await estudiante();
    const cookie = await entrarComo(db, u.id);
    const fila = await db.session.findFirstOrThrow({ where: { userId: u.id } });
    // Es el primer tramo de la cookie: quien lea la base lo ve, pero sin el
    // secreto de la aplicación no puede fabricar la firma (prueba anterior).
    expect(cookie.startsWith(fila.token)).toBe(true);
  });
});

describe("alta por Google (hook de creación de usuario)", () => {
  const crear = async (email: string, emailVerified: boolean) => {
    const ctx = await auth.$context;
    // El segundo argumento solo alimenta `validateUserInfo`, que no se usa.
    return ctx.internalAdapter.createUser(
      { email, emailVerified, name: "Prueba" },
      undefined as never,
    );
  };

  it("un correo fuera del dominio no crea cuenta", async () => {
    await expect(crear("alguien@gmail.com", true)).rejects.toThrow();
    expect(await db.usuario.count()).toBe(0);
  });

  it("un correo institucional sin verificar no crea cuenta", async () => {
    await expect(crear("alguien@uam.edu.ni", false)).rejects.toThrow();
    expect(await db.usuario.count()).toBe(0);
  });

  it("un correo institucional verificado crea un ESTUDIANTE con condición A o B", async () => {
    await crear("Alguien.Nuevo@UAM.edu.ni", true);
    const u = await db.usuario.findFirstOrThrow();
    expect(u.correo).toBe("alguien.nuevo@uam.edu.ni");
    expect(u.rol).toBe("ESTUDIANTE");
    expect(["A", "B"]).toContain(u.condicionExperimental);
  });

  it("riesgo 5: 40 altas reparten A y B y ninguna queda sin condición", async () => {
    for (let i = 0; i < 40; i++) {
      await crear(`alta${i}.${crypto.randomUUID()}@uam.edu.ni`, true);
    }
    const condiciones = (await db.usuario.findMany()).map((u) => u.condicionExperimental);
    expect(condiciones.every((c) => c === "A" || c === "B")).toBe(true);
    expect(new Set(condiciones).size).toBe(2);
  });
});

describe("Google nunca se vincula a una cuenta de operación", () => {
  it.each(["COMERCIO", "ADMIN"] as const)("rechaza vincular %s", async (rol) => {
    const op = await crearOperador(db, rol, null);
    const ctx = await auth.$context;
    await expect(
      ctx.internalAdapter.linkAccount({
        userId: op.id,
        providerId: "google",
        accountId: "google-123",
      }),
    ).rejects.toThrow();
    expect(await db.account.count()).toBe(0);
  });

  it("sí vincula a un estudiante", async () => {
    const u = await estudiante();
    const ctx = await auth.$context;
    await ctx.internalAdapter.linkAccount({
      userId: u.id,
      providerId: "google",
      accountId: "google-456",
    });
    expect(await db.account.count()).toBe(1);
  });
});

describe("enlace mágico con correo externo", () => {
  it("un correo fuera del dominio sin cuenta demo no recibe enlace", async () => {
    await expect(emitirEnlace("reclutador@empresa.com")).rejects.toThrow(/institucional/);
    expect(await db.usuario.count()).toBe(0);
  });

  it("una cuenta demo creada por el equipo sí lo recibe", async () => {
    await db.usuario.create({
      data: {
        correo: "reclutador@empresa.com",
        condicionExperimental: "B",
        esDemo: true,
      },
    });
    const r = await emitirEnlace("Reclutador@Empresa.com");
    expect(r.nuevo).toBe(false);
    const canje = await canjearEnlace(r.token);
    expect(canje.ok).toBe(true);
  });

  it("el enlace nunca entra a una cuenta de operación", async () => {
    const op = await crearOperador(db, "COMERCIO", null);
    await expect(emitirEnlace(op.correo)).rejects.toThrow(/operación/);
  });
});

describe("canje del enlace (riesgo 3)", () => {
  it("dos canjes simultáneos del mismo enlace abren UNA sola sesión", async () => {
    const u = await estudiante();
    const { token } = await emitirEnlace(u.correo);

    const resultados = await Promise.all([canjearEnlace(token), canjearEnlace(token)]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(1);
    const perdedor = resultados.find((r) => !r.ok);
    expect(perdedor && !perdedor.ok && perdedor.motivo).toBe("YA_USADO");
  });

  it("canjear el enlace verifica el correo del usuario", async () => {
    const u = await estudiante();
    expect(u.emailVerified).toBe(false);
    const { token } = await emitirEnlace(u.correo);
    await canjearEnlace(token);
    expect((await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).emailVerified).toBe(true);
  });

  it("riesgo 2: el token del enlace no queda en claro en la base ni en las notificaciones", async () => {
    const u = await estudiante();
    const { token } = await emitirEnlace(u.correo);
    const tokens = await db.tokenAcceso.findMany();
    const notificaciones = await db.notificacion.findMany();
    expect(JSON.stringify(tokens)).not.toContain(token);
    expect(JSON.stringify(notificaciones)).not.toContain(token);
  });
});
