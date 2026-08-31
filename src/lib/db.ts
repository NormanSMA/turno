import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Tamaño del pool (ADR-18).
 *
 * En serverless cada instancia atiende UNA petición a la vez, así que una
 * conexión por instancia es lo correcto. El `Pool` de `pg` toma 10 por defecto,
 * y multiplicado por las instancias que el proveedor levanta en hora pico eso
 * agota el límite de conexiones de la base — el fallo aparece justo cuando hay
 * carga, que es cuando menos se puede diagnosticar.
 *
 * Fuera de serverless el proceso es persistente y sí conviene un pool real.
 * `DB_POOL_MAX` permite ajustarlo sin tocar el código.
 */
function tamanoPool(): number {
  const declarado = Number(process.env.DB_POOL_MAX);
  if (Number.isInteger(declarado) && declarado > 0) return declarado;
  return process.env.VERCEL ? 1 : 10;
}

function crear() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: tamanoPool(),
    }),
  });
}

export const prisma = globalForPrisma.prisma ?? crear();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
