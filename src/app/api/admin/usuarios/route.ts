/**
 * GET / PATCH /api/admin/usuarios — gobernanza de accesos (§33). Antes las
 * cuentas se creaban por script y no había forma de ver quién las tenía.
 *
 * Tres barandas:
 *
 *   1. **Nadie se toca a sí mismo.** El error más común de estas pantallas es
 *      dejar el sistema sin nadie que pueda entrar.
 *   2. **Siempre queda un administrador.** Con la baranda 1 no llega a
 *      dispararse —está explicado abajo— y se conserva como red.
 *   3. **Todo queda en auditoría, con el antes y el después.**
 *
 * Desactivar NO borra: se corta el acceso revocando sesiones, porque borrar se
 * llevaría por delante el historial de pedidos.
 */
import { prisma } from "@/lib/db";
import { exigirRol, sesionActual } from "@/lib/auth";
import { cuerpo, fallo, manejarError, ok } from "@/lib/http";
import { z } from "zod";

export async function GET() {
  try {
    await exigirRol("ADMIN");
    const ahora = new Date();

    const usuarios = await prisma.usuario.findMany({
      where: { rol: { in: ["ADMIN", "COMERCIO"] } },
      orderBy: [{ rol: "asc" }, { correo: "asc" }],
      select: {
        id: true,
        correo: true,
        rol: true,
        debeCambiarPassword: true,
        ultimoAccesoEn: true,
        creadoEn: true,
        comercio: { select: { nombre: true, slug: true } },
        sesiones: {
          where: { expiraEn: { gt: ahora }, revocadaEn: null },
          select: { id: true },
        },
      },
    });

    return ok({
      usuarios: usuarios.map((u) => ({
        id: u.id,
        correo: u.correo,
        rol: u.rol,
        comercio: u.comercio?.nombre ?? null,
        comercioSlug: u.comercio?.slug ?? null,
        // Una cuenta con la contraseña inicial sin cambiar es una puerta
        // abierta: la contraseña la conoce quien la creó, no solo su dueño.
        passwordInicial: u.debeCambiarPassword,
        sesionesActivas: u.sesiones.length,
        ultimoAccesoEn: u.ultimoAccesoEn?.toISOString() ?? null,
        desde: u.creadoEn.toISOString(),
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}

const esquema = z.object({
  usuarioId: z.uuid(),
  accion: z.enum(["REVOCAR_SESIONES", "HACER_ADMIN", "QUITAR_ADMIN"]),
});

export async function PATCH(req: Request) {
  try {
    await exigirRol("ADMIN");
    const sesion = await sesionActual();
    const { usuarioId, accion } = await cuerpo(req, esquema);

    // Baranda 1: nadie se toca a sí mismo.
    if (usuarioId === sesion?.usuarioId) {
      return fallo(
        "SOBRE_SI_MISMO",
        "No podés cambiar tu propio acceso desde acá. Pedíselo a otro administrador.",
        422,
      );
    }

    const antes = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, correo: true, rol: true, comercioId: true },
    });
    if (!antes) return fallo("NO_ENCONTRADO", "Usuario inexistente", 404);

    if (accion === "REVOCAR_SESIONES") {
      const r = await prisma.sesion.updateMany({
        where: { usuarioId, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
      await registrar(sesion?.usuarioId, accion, antes, {
        sesionesRevocadas: r.count,
      });
      return ok({ sesionesRevocadas: r.count });
    }

    if (accion === "QUITAR_ADMIN") {
      /*
       * Baranda 2. Hoy NO se puede disparar, y conviene decirlo en vez de
       * dejar un `if` que aparenta proteger: quien llama ya es ADMIN y no
       * puede degradarse a sí mismo, así que si el objetivo es ADMIN hay al
       * menos dos. Se conserva por si la baranda 1 se relaja; cuesta una
       * consulta y solo corre al degradar.
       */
      const admins = await prisma.usuario.count({ where: { rol: "ADMIN" } });
      if (admins <= 1) {
        return fallo(
          "ULTIMO_ADMIN",
          "Es el único administrador. Nombrá otro antes de quitarle el rol, o nadie va a poder entrar al panel.",
          422,
        );
      }
      /*
       * Al dejar de ser ADMIN vuelve a COMERCIO solo si tiene un comercio
       * asignado; si no, a ESTUDIANTE. Dejarlo como COMERCIO sin comercio lo
       * mandaría a una cocina que no existe.
       */
      const rol = antes.comercioId ? "COMERCIO" : "ESTUDIANTE";
      const despues = await prisma.usuario.update({
        where: { id: usuarioId },
        data: { rol },
        select: { rol: true },
      });
      // Un cambio de rol tiene que cortar las sesiones vigentes: si no, el
      // permiso viejo sigue vivo hasta que la cookie expire.
      await prisma.sesion.updateMany({
        where: { usuarioId, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
      await registrar(sesion?.usuarioId, accion, antes, despues);
      return ok({ rol: despues.rol });
    }

    const despues = await prisma.usuario.update({
      where: { id: usuarioId },
      data: { rol: "ADMIN" },
      select: { rol: true },
    });
    await prisma.sesion.updateMany({
      where: { usuarioId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
    await registrar(sesion?.usuarioId, accion, antes, despues);
    return ok({ rol: despues.rol });
  } catch (e) {
    return manejarError(e, req);
  }
}

/** Baranda 3: el antes y el después, siempre. */
async function registrar(
  actorId: string | undefined,
  accion: string,
  antes: unknown,
  despues: unknown,
): Promise<void> {
  await prisma.auditoriaAdmin.create({
    data: {
      actorId: actorId ?? null,
      accion,
      entidad: "usuario",
      entidadId: (antes as { id?: string }).id ?? null,
      antes: antes as object,
      despues: despues as object,
    },
  });
}
