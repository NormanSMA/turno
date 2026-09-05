/**
 * Genera las franjas de los comercios del campus, con el horario de cada uno.
 *
 *   npx tsx scripts/franjas-campus.ts          → los próximos 7 días
 *   npx tsx scripts/franjas-campus.ts --dias=14
 *
 * Va aparte del catálogo a propósito. Cargar productos es una decisión de
 * negocio que se hace una vez; generar franjas es una tarea de operación que se
 * repite cada semana, y mezclarlas obligaría a rehacer el catálogo entero solo
 * para abrir la semana siguiente.
 *
 * Los horarios salen de `seed-campus.ts`, donde están junto al resto de datos
 * del local: un local que abre a las 6:30 porque vende café no tiene su horario
 * en un archivo distinto del que dice que vende café.
 *
 * Es idempotente: la clave única (comercio, inicio) hace que volver a correrlo
 * no duplique, y las franjas existentes conservan su carga. Regenerar NUNCA
 * borra pedidos.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generarFranjasComercio } from "../src/lib/comercio";
import { sumarDias } from "../src/core/hora-local";
import { CAMPUS } from "../prisma/seed-campus";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function arg(n: string) {
  return process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
}

/** Hoy en el campus, como AAAA-MM-DD. */
function hoyEnCampus(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Managua" });
}

async function main() {
  const dias = Number(arg("dias") ?? 7);
  if (!Number.isInteger(dias) || dias < 1 || dias > 60) {
    throw new Error("--dias tiene que ser un entero entre 1 y 60");
  }

  /*
   * Hace falta un actor para la auditoría: cada generación queda registrada con
   * quién la pidió. Se usa el admin porque esto es una tarea de plataforma, no
   * de un comercio concreto.
   */
  const admin = await prisma.usuario.findFirst({ where: { rol: "ADMIN" } });
  if (!admin) throw new Error("No hay ninguna cuenta ADMIN para atribuir la generación");

  const desde = hoyEnCampus();
  const hasta = sumarDias(desde, dias - 1);
  console.log(`Generando del ${desde} al ${hasta}.\n`);

  let total = 0;
  for (const c of CAMPUS) {
    const comercio = await prisma.comercio.findUnique({ where: { slug: c.slug } });
    if (!comercio) {
      console.log(`  ${c.nombre.padEnd(26)} — no existe, lo salto`);
      continue;
    }

    const r = await generarFranjasComercio(comercio.id, admin.id, {
      desde,
      hasta,
      horaInicio: c.abre,
      horaFin: c.cierra,
    });

    total += r.creadas;
    console.log(
      `  ${c.nombre.padEnd(26)} ${c.abre}–${c.cierra}  ${String(r.creadas).padStart(4)} franjas nuevas`,
    );
  }

  console.log(`\n${total} franjas creadas en ${dias} días.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
