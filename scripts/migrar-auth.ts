/**
 * Corte al motor de sesiones de Better Auth (ADR-24, T3).
 *
 *   pnpm exec tsx scripts/migrar-auth.ts            # simulacro: solo cuenta
 *   pnpm exec tsx scripts/migrar-auth.ts --aplicar  # aplica
 *
 * Idempotente: correrlo dos veces deja el mismo resultado. No borra nada. Las
 * tablas `sesion` y `token_acceso` quedan 14 días como ventana de reversión.
 *
 * Qué hace, y qué NO hace:
 *   - Las contraseñas de operación no se copian: siguen en `usuario.passwordHash`
 *     y la fachada las verifica igual. No hay reinicio de contraseñas.
 *   - Las sesiones vivas del motor anterior no se trasladan: se revocan. Cada
 *     persona vuelve a entrar una vez (el estudiante, con un enlace nuevo).
 *   - Los enlaces sin usar del motor anterior se invalidan: se emitieron con la
 *     expectativa de una sesión que ya no existe.
 *   - Quien alguna vez abrió un enlace tiene el correo verificado.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const aplicar = process.argv.includes("--aplicar");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  if (process.env.NODE_ENV === "production" && !aplicar) {
    console.log("Simulacro en producción: no se escribe nada.");
  }
  const ahora = new Date();

  const sesionesVivas = await prisma.sesion.count({
    where: { revocadaEn: null, expiraEn: { gt: ahora } },
  });
  const enlacesSinUsar = await prisma.tokenAcceso.count({
    where: { usadoEn: null, expiraEn: { gt: ahora } },
  });
  const porVerificar = await prisma.usuario.count({
    where: { emailVerified: false, tokens: { some: { usadoEn: { not: null } } } },
  });
  const operadores = await prisma.usuario.count({
    where: { rol: { in: ["COMERCIO", "ADMIN"] }, passwordHash: { not: null } },
  });

  console.log(`Sesiones vivas a revocar ......... ${sesionesVivas}`);
  console.log(`Enlaces sin usar a invalidar ..... ${enlacesSinUsar}`);
  console.log(`Correos a marcar verificados ..... ${porVerificar}`);
  console.log(`Operadores con contraseña (intactos) ${operadores}`);

  if (!aplicar) {
    console.log("\nSimulacro. Agregá --aplicar para ejecutar.");
    return;
  }

  await prisma.$transaction([
    prisma.sesion.updateMany({
      where: { revocadaEn: null },
      data: { revocadaEn: ahora },
    }),
    prisma.tokenAcceso.updateMany({
      where: { usadoEn: null },
      data: { usadoEn: ahora },
    }),
    prisma.usuario.updateMany({
      where: { emailVerified: false, tokens: { some: { usadoEn: { not: null } } } },
      data: { emailVerified: true },
    }),
  ]);

  const quedan = await prisma.sesion.count({
    where: { revocadaEn: null, expiraEn: { gt: new Date() } },
  });
  const operadoresDespues = await prisma.usuario.count({
    where: { rol: { in: ["COMERCIO", "ADMIN"] }, passwordHash: { not: null } },
  });
  console.log(`\nAplicado. Sesiones vivas del motor anterior: ${quedan}.`);
  if (quedan !== 0 || operadoresDespues !== operadores) {
    console.error("Verificación fallida: revisar antes de seguir.");
    process.exit(1);
  }
  console.log("Verificación correcta: contraseñas de operación intactas.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
