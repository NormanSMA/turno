/** GET /api/admin/sistema: la clave `bandeja` exige ADMIN. */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/cookies"));

import { prisma } from "@/lib/db";
import { limpiar, montarEscenario } from "./helpers/db";
import { crearOperador, entrarComo, peticion, salir } from "./helpers/sesion";
import type { PrismaClient } from "@/generated/prisma/client";
import * as RAdminSistema from "@/app/api/admin/sistema/route";

const db = prisma as unknown as PrismaClient;
let adminId: string;
let duenoId: string;

beforeAll(async () => {
  if (!/turno_test/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Estas pruebas exigen DATABASE_URL apuntando a turno_test.");
  }
  await limpiar(db);
  const esc = await montarEscenario(db, { cantidadUsuarios: 0 });
  adminId = (await crearOperador(db, "ADMIN", null)).id;
  duenoId = (await crearOperador(db, "COMERCIO", esc.comercio.id)).id;
  await db.notificacion.create({
    data: {
      destinatario: "x@uamv.edu.ni",
      tipo: "ENLACE_ACCESO",
      canal: "CORREO",
      estado: "FALLIDA",
      intentos: 4,
      ultimoError: "SMTP caído",
    },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => salir());

describe("GET /api/admin/sistema (bandeja)", () => {
  it("rechaza a anónimos y a no-ADMIN", async () => {
    expect((await RAdminSistema.GET(peticion("/api/admin/sistema"))).status).toBe(401);
    await entrarComo(db, duenoId);
    expect((await RAdminSistema.GET(peticion("/api/admin/sistema"))).status).toBe(403);
  });

  it("entrega la bandeja agregada al ADMIN, sin destinatarios", async () => {
    await entrarComo(db, adminId);
    const res = await RAdminSistema.GET(peticion("/api/admin/sistema"));
    expect(res.status).toBe(200);
    const texto = await res.text();
    const cuerpo = JSON.parse(texto);
    const b = (cuerpo.data ?? cuerpo).bandeja;
    expect(b.CORREO.fallidas).toBe(1);
    expect(b.CORREO.ultimoError).toBe("SMTP caído");
    expect(b.CORREO.intentosMax).toBe(4);
    expect(b.PUSH.pendientes).toBe(0);
    expect(texto).not.toContain("x@uamv.edu.ni");
  });
});
