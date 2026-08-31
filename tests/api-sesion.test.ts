/**
 * Auditoría de sesión sobre el camino real: cookie → hash → fila → vigencia.
 *
 * Punto 8 de la auditoría técnica, y el arreglo del hallazgo T-02.
 *
 * `core/autorizacion.ts` decide con una sesión ya resuelta y estaba al 100 %.
 * Lo que no tenía una sola prueba era `lib/auth.ts`, que es quien la resuelve: de
 * sus 79 sentencias se ejecutaba UNA. La distinción importa porque los tres
 * fallos que un auditor busca acá —una sesión expirada que se sigue aceptando,
 * una revocada que no muere, un rol que se quedó congelado— viven todos en la
 * resolución, no en la decisión.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar } from "./helpers/db";
import { crearOperador, entrarComo, peticion, salir } from "./helpers/sesion";
import { limpiarCookies, ponerCookie } from "./helpers/cookies";
import {
  COOKIE_SESION,
  cambiarPassword,
  cerrarSesion,
  opcionesCookie,
  sesionActual,
} from "@/lib/auth";
import { hashToken } from "@/core/identidad";
import { hashPassword } from "@/core/credenciales";
import type { PrismaClient } from "@/generated/prisma/client";

import * as RSesion from "@/app/api/auth/sesion/route";
import * as RAdminSistema from "@/app/api/admin/sistema/route";
import * as RPerfil from "@/app/api/perfil/route";

const db = prisma as unknown as PrismaClient;

let estudianteId: string;

beforeAll(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
  await limpiar(db);
  const u = await db.usuario.create({
    data: {
      correo: `sesion.${crypto.randomUUID()}@uam.edu.ni`,
      condicionExperimental: "A",
    },
  });
  estudianteId = u.id;
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => salir());

describe("una sesión que ya no vale no vale", () => {
  it("sin cookie no hay sesión", async () => {
    salir();
    expect(await sesionActual()).toBeNull();
  });

  it("una cookie con un token que no existe no crea sesión", async () => {
    limpiarCookies();
    ponerCookie(COOKIE_SESION, "token-inventado-que-no-esta-en-la-base");
    expect(await sesionActual()).toBeNull();
    expect((await RPerfil.GET()).status).toBe(401);
  });

  it("una sesión expirada se rechaza aunque la fila siga ahí", async () => {
    await entrarComo(db, estudianteId, {
      expiraEn: new Date(Date.now() - 1000),
    });
    expect(await sesionActual()).toBeNull();
    expect((await RPerfil.GET()).status).toBe(401);
  });

  it("una sesión revocada se rechaza aunque no haya expirado", async () => {
    await entrarComo(db, estudianteId, {
      expiraEn: new Date(Date.now() + 86_400_000),
      revocadaEn: new Date(),
    });
    expect(await sesionActual()).toBeNull();
    expect((await RPerfil.GET()).status).toBe(401);
  });

  it("presentar el HASH en vez del token no sirve", async () => {
    // Si la base se filtrara, lo que hay ahí dentro no puede ser una llave.
    const token = await entrarComo(db, estudianteId);
    limpiarCookies();
    ponerCookie(COOKIE_SESION, hashToken(token));
    expect(await sesionActual()).toBeNull();
  });

  it("cerrar sesión la mata de inmediato", async () => {
    await entrarComo(db, estudianteId);
    const s = await sesionActual();
    expect(s).not.toBeNull();

    await cerrarSesion(s!.sesionId);
    expect(await sesionActual()).toBeNull();
    expect((await RPerfil.GET()).status).toBe(401);
  });

  it("DELETE /api/auth/sesion revoca la sesión en curso", async () => {
    await entrarComo(db, estudianteId);
    const antes = await sesionActual();

    const r = await RSesion.DELETE();
    expect(r.status).toBe(200);

    const fila = await db.sesion.findUnique({ where: { id: antes!.sesionId } });
    expect(fila!.revocadaEn).not.toBeNull();
  });
});

describe("el rol se lee en cada petición, no se congela en la sesión", () => {
  it("degradar a un ADMIN con la sesión abierta le cierra el panel", async () => {
    const admin = await crearOperador(db, "ADMIN", null);
    await entrarComo(db, admin.id);

    // Con el rol puesto, entra.
    expect((await RAdminSistema.GET(peticion("/api/admin/sistema"))).status).not.toBe(403);

    // Se lo degrada SIN tocar la sesión: la fila de sesión sigue vigente.
    await db.usuario.update({
      where: { id: admin.id },
      data: { rol: "ESTUDIANTE", comercioId: null },
    });

    // Si el rol viviera dentro de la sesión, seguiría entrando hasta que
    // expirara. Es el fallo que esta prueba existe para impedir.
    const r = await RAdminSistema.GET(peticion("/api/admin/sistema"));
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe("NO_AUTORIZADO");
  });

  it("mover a un operador de comercio le quita el comercio viejo al instante", async () => {
    const uno = await db.comercio.create({
      data: { nombre: "Uno", slug: `uno-${crypto.randomUUID()}` },
    });
    const dos = await db.comercio.create({
      data: { nombre: "Dos", slug: `dos-${crypto.randomUUID()}` },
    });
    const op = await crearOperador(db, "COMERCIO", uno.id);
    await entrarComo(db, op.id);

    expect((await sesionActual())!.comercioId).toBe(uno.id);

    await db.usuario.update({ where: { id: op.id }, data: { comercioId: dos.id } });

    expect((await sesionActual())!.comercioId).toBe(dos.id);
  });
});

describe("cambiar la contraseña expulsa a los demás y conserva al que la cambió", () => {
  it("revoca las otras sesiones y mantiene la actual", async () => {
    const op = await crearOperador(db, "COMERCIO", null);
    await db.usuario.update({
      where: { id: op.id },
      data: { passwordHash: await hashPassword("Turno-Vieja-2026") },
    });

    // Tres sesiones del mismo operador: dos viejas y la que hace el cambio.
    await entrarComo(db, op.id);
    await entrarComo(db, op.id);
    await entrarComo(db, op.id);
    const actual = (await sesionActual())!;

    const r = await cambiarPassword(
      op.id,
      "Turno-Vieja-2026",
      "Turno-Nueva-2026",
      actual.sesionId,
    );
    expect(r.ok).toBe(true);

    const vivas = await db.sesion.findMany({
      where: { usuarioId: op.id, revocadaEn: null },
    });
    expect(vivas).toHaveLength(1);
    expect(vivas[0]!.id).toBe(actual.sesionId);

    // Y la que hizo el cambio sigue sirviendo: si expulsara también a quien
    // acaba de demostrar que sabe la contraseña, el cambio obligatorio del
    // primer acceso rebotaría a la pantalla de login.
    expect(await sesionActual()).not.toBeNull();
  });

  it("con la contraseña actual equivocada no cambia nada", async () => {
    const op = await crearOperador(db, "COMERCIO", null);
    await db.usuario.update({
      where: { id: op.id },
      data: { passwordHash: await hashPassword("Turno-Vieja-2026") },
    });
    await entrarComo(db, op.id);

    const r = await cambiarPassword(op.id, "no-es-esa", "Turno-Nueva-2026");
    expect(r.ok).toBe(false);

    const vivas = await db.sesion.count({
      where: { usuarioId: op.id, revocadaEn: null },
    });
    expect(vivas).toBe(1);
  });

  it("una cuenta sin contraseña no puede cambiarla", async () => {
    const r = await cambiarPassword(estudianteId, "x", "Turno-Nueva-2026");
    expect(r.ok).toBe(false);
  });
});

describe("la cookie sale con los atributos que la protegen", () => {
  it("httpOnly, sameSite lax y path raíz", () => {
    const o = opcionesCookie(new Date("2026-09-01T00:00:00Z"));
    // httpOnly: un XSS no puede leerla. sameSite lax: no viaja en una escritura
    // desde otro sitio. Las dos son la diferencia entre "hay sesión" y "hay
    // sesión robable".
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
  });

  it("secure queda atado a producción y no a otra cosa", () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      expect(opcionesCookie(new Date()).secure).toBe(true);
      vi.stubEnv("NODE_ENV", "development");
      expect(opcionesCookie(new Date()).secure).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("GET /api/auth/sesion", () => {
  it("responde sin sesión sin romperse", async () => {
    salir();
    const r = await RSesion.GET();
    expect(r.status).toBe(200);
    expect((await r.json()).autenticado).toBe(false);
  });

  it("con sesión devuelve el correo y el rol, y ningún token", async () => {
    await entrarComo(db, estudianteId);
    const r = await RSesion.GET();
    const cuerpo = await r.json();
    expect(cuerpo.autenticado).toBe(true);
    expect(cuerpo.usuario.rol).toBe("ESTUDIANTE");
    // Que la respuesta no lleve nada con lo que reconstruir la sesión.
    expect(JSON.stringify(cuerpo)).not.toMatch(/tokenHash|token"/i);
  });
});
