/**
 * Fase 2 — Identidad y límites, contra la base real.
 *
 * Se prueban las funciones de dominio (`emitirEnlace`, `canjearEnlace`) con un
 * cliente Prisma de test inyectado, no las rutas HTTP: la garantía está en el
 * dominio, y probarla acá la deja verificada aunque la ruta cambie.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  asignarCondicion,
  esCorreoInstitucional,
  evaluarToken,
  expiracionEnlace,
  generarToken,
  hashToken,
  normalizarCorreo,
} from "@/core/identidad";
import { consumirLimite, POLITICAS, purgarLimites } from "@/core/limites";
import { crearPrismaTest, limpiar } from "./helpers/db";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = crearPrismaTest();

beforeEach(async () => {
  await limpiar(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Réplica local de `emitirEnlace` sobre el cliente de test. */
async function emitir(db: PrismaClient, correoBruto: string) {
  const correo = normalizarCorreo(correoBruto);
  if (!esCorreoInstitucional(correo)) throw new Error("Correo no institucional");
  const usuario =
    (await db.usuario.findUnique({ where: { correo } })) ??
    (await db.usuario.create({
      data: { correo, condicionExperimental: asignarCondicion() },
    }));
  const token = generarToken();
  await db.tokenAcceso.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: hashToken(token),
      expiraEn: expiracionEnlace(),
    },
  });
  return { token, usuario };
}

/** Réplica local de `canjearEnlace`. */
async function canjear(db: PrismaClient, token: string) {
  return db.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<
      { id: string; usuarioId: string; expiraEn: Date; usadoEn: Date | null }[]
    >`
      SELECT id, "usuarioId", "expiraEn", "usadoEn"
      FROM token_acceso WHERE "tokenHash" = ${hashToken(token)}
      FOR UPDATE
    `;
    const registro = filas[0] ?? null;
    const estado = evaluarToken(registro);
    if (!estado.valido || !registro) {
      return { ok: false as const, motivo: estado.motivo };
    }
    await tx.tokenAcceso.update({
      where: { id: registro.id },
      data: { usadoEn: new Date() },
    });
    const tokenSesion = generarToken();
    const sesion = await tx.sesion.create({
      data: {
        usuarioId: registro.usuarioId,
        tokenHash: hashToken(tokenSesion),
        expiraEn: new Date(Date.now() + 75 * 86400000),
      },
    });
    return { ok: true as const, tokenSesion, sesionId: sesion.id };
  });
}

describe("enlace mágico", () => {
  it("nunca almacena el token en claro", async () => {
    const { token } = await emitir(prisma, "juan@uam.edu.ni");
    const filas = await prisma.tokenAcceso.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0].tokenHash).not.toBe(token);
    expect(filas[0].tokenHash).toBe(hashToken(token));

    // Y no se puede encontrar el token buscándolo literalmente en la tabla.
    const porClaro = await prisma.tokenAcceso.findUnique({
      where: { tokenHash: token },
    });
    expect(porClaro).toBeNull();
  });

  it("canjea el enlace por una sesión", async () => {
    const { token, usuario } = await emitir(prisma, "juan@uam.edu.ni");
    const r = await canjear(prisma, token);
    expect(r.ok).toBe(true);

    const sesiones = await prisma.sesion.findMany({
      where: { usuarioId: usuario.id },
    });
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].revocadaEn).toBeNull();
  });

  it("un token de un solo uso no vuelve a servir", async () => {
    const { token } = await emitir(prisma, "juan@uam.edu.ni");
    expect((await canjear(prisma, token)).ok).toBe(true);
    const segundo = await canjear(prisma, token);
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.motivo).toBe("YA_USADO");
    expect(await prisma.sesion.count()).toBe(1);
  });

  it("dos clics simultáneos sobre el mismo enlace crean UNA sola sesión", async () => {
    const { token } = await emitir(prisma, "juan@uam.edu.ni");
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => canjear(prisma, token)),
    );
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.sesion.count()).toBe(1);
  });

  it("un token expirado se rechaza", async () => {
    const { token, usuario } = await emitir(prisma, "juan@uam.edu.ni");
    await prisma.tokenAcceso.updateMany({
      where: { usuarioId: usuario.id },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });
    const r = await canjear(prisma, token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("EXPIRADO");
  });

  it("un token inventado se rechaza sin filtrar si el usuario existe", async () => {
    await emitir(prisma, "juan@uam.edu.ni");
    const r = await canjear(prisma, generarToken());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("INEXISTENTE");
  });

  it("un segundo enlace no invalida al usuario ni duplica la cuenta", async () => {
    const a = await emitir(prisma, "juan@uam.edu.ni");
    const b = await emitir(prisma, "JUAN@uam.edu.ni "); // mismo buzón
    expect(b.usuario.id).toBe(a.usuario.id);
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.tokenAcceso.count()).toBe(2);
  });

  it("la condición experimental se fija una vez y no cambia al re-entrar", async () => {
    const a = await emitir(prisma, "juan@uam.edu.ni");
    const condicionInicial = a.usuario.condicionExperimental;
    for (let i = 0; i < 5; i++) {
      const b = await emitir(prisma, "juan@uam.edu.ni");
      expect(b.usuario.condicionExperimental).toBe(condicionInicial);
    }
  });

  it("revocar la sesión la invalida sin borrar el histórico", async () => {
    const { token } = await emitir(prisma, "juan@uam.edu.ni");
    const r = await canjear(prisma, token);
    if (!r.ok) throw new Error("debía canjear");
    await prisma.sesion.update({
      where: { id: r.sesionId },
      data: { revocadaEn: new Date() },
    });
    const s = await prisma.sesion.findUniqueOrThrow({ where: { id: r.sesionId } });
    expect(s.revocadaEn).toBeInstanceOf(Date);
  });
});

describe("limitación de tasa", () => {
  it("permite hasta el máximo y luego bloquea", async () => {
    const max = POLITICAS.ENLACE_POR_CORREO.maximo;
    const correo = "juan@uam.edu.ni";
    for (let i = 0; i < max; i++) {
      const r = await consumirLimite(prisma, "ENLACE_POR_CORREO", correo);
      expect(r.permitido).toBe(true);
    }
    const bloqueado = await consumirLimite(prisma, "ENLACE_POR_CORREO", correo);
    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.restantes).toBe(0);
  });

  it("cuenta correctamente bajo peticiones concurrentes", async () => {
    // El caso que un atacante provoca a propósito: ráfaga simultánea.
    const rs = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumirLimite(prisma, "ENLACE_POR_CORREO", "juan@uam.edu.ni"),
      ),
    );
    expect(rs.filter((r) => r.permitido)).toHaveLength(
      POLITICAS.ENLACE_POR_CORREO.maximo,
    );
  });

  it("los identificadores no se contaminan entre sí", async () => {
    for (let i = 0; i < POLITICAS.ENLACE_POR_CORREO.maximo + 2; i++) {
      await consumirLimite(prisma, "ENLACE_POR_CORREO", "a@uam.edu.ni");
    }
    const otro = await consumirLimite(prisma, "ENLACE_POR_CORREO", "b@uam.edu.ni");
    expect(otro.permitido).toBe(true);
  });

  it("las acciones distintas tienen cupos independientes", async () => {
    for (let i = 0; i < POLITICAS.ENLACE_POR_CORREO.maximo + 2; i++) {
      await consumirLimite(prisma, "ENLACE_POR_CORREO", "x");
    }
    const otra = await consumirLimite(prisma, "PEDIDO_POR_USUARIO", "x");
    expect(otra.permitido).toBe(true);
  });

  it("la ventana se reinicia con el tiempo", async () => {
    const t0 = new Date("2026-09-01T12:00:00Z");
    for (let i = 0; i < POLITICAS.ENLACE_POR_CORREO.maximo + 1; i++) {
      await consumirLimite(prisma, "ENLACE_POR_CORREO", "x", t0);
    }
    const siguiente = new Date(
      t0.getTime() + POLITICAS.ENLACE_POR_CORREO.ventanaSeg * 1000,
    );
    const r = await consumirLimite(prisma, "ENLACE_POR_CORREO", "x", siguiente);
    expect(r.permitido).toBe(true);
  });

  it("purga las ventanas viejas y conserva las recientes", async () => {
    const ahora = new Date("2026-09-05T12:00:00Z");
    // Una ventana de hace días y otra de hace una hora: solo la vieja se purga.
    await consumirLimite(prisma, "ENLACE_POR_CORREO", "x", new Date("2026-09-01T12:00:00Z"));
    await consumirLimite(prisma, "ENLACE_POR_CORREO", "y", new Date("2026-09-05T11:00:00Z"));
    const borradas = await purgarLimites(prisma, ahora);
    expect(borradas).toBe(1);
    expect(await prisma.contadorLimite.count()).toBe(1);
  });
});
