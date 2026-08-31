/**
 * Creación de cuentas de operación (COMERCIO / ADMIN).
 *
 * No hay auto-registro para estas cuentas a propósito: son poquísimas, las crea
 * el equipo a mano, y cada una tiene poder sobre datos del piloto. Un endpoint
 * público de alta de administradores sería un agujero sin ninguna ventaja.
 *
 *   npm run cuenta -- --correo=admin@uamv.edu.ni --rol=ADMIN
 *   npm run cuenta -- --correo=cocina@uamv.edu.ni --rol=COMERCIO --comercio=cafeteria-central
 *   npm run cuenta -- --correo=admin@uamv.edu.ni --password="mi contraseña larga"
 *
 * Sin `--password` se genera una y se imprime UNA sola vez. La cuenta queda
 * marcada para cambiarla en el primer acceso.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  hashPassword,
  passwordSugerida,
  validarPassword,
} from "../src/core/credenciales";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function arg(nombre: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return p?.slice(nombre.length + 3);
}

async function main() {
  const correo = arg("correo")?.trim().toLowerCase();
  const rol = (arg("rol") ?? "ADMIN").toUpperCase();
  const slug = arg("comercio");
  const passwordDada = arg("password");

  if (!correo) {
    console.error(
      "Falta --correo. Ejemplo:\n" +
        '  npm run cuenta -- --correo=admin@uamv.edu.ni --rol=ADMIN',
    );
    process.exit(1);
  }
  if (rol !== "ADMIN" && rol !== "COMERCIO") {
    console.error("--rol debe ser ADMIN o COMERCIO");
    process.exit(1);
  }
  if (rol === "COMERCIO" && !slug) {
    console.error(
      "Una cuenta COMERCIO necesita --comercio=<slug>: sin comercio asignado,\n" +
        "la autorización la rechaza en toda ruta de cocina (y hace bien).",
    );
    process.exit(1);
  }

  let comercioId: string | null = null;
  if (slug) {
    const comercio = await prisma.comercio.findUnique({ where: { slug } });
    if (!comercio) {
      console.error(`No existe el comercio "${slug}".`);
      process.exit(1);
    }
    comercioId = comercio.id;
  }

  const password = passwordDada ?? passwordSugerida();
  const v = validarPassword(password);
  if (!v.valida) {
    console.error(v.motivo);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const generada = !passwordDada;

  const usuario = await prisma.usuario.upsert({
    where: { correo },
    update: {
      rol,
      comercioId,
      passwordHash,
      debeCambiarPassword: generada,
    },
    create: {
      correo,
      rol,
      comercioId,
      passwordHash,
      debeCambiarPassword: generada,
      // Las cuentas de operación también llevan condición asignada por
      // consistencia del modelo, pero no participan del experimento: sus
      // pedidos no existen, y si existieran se filtran por rol en el análisis.
      condicionExperimental: "A",
      consentimiento: true,
    },
  });

  console.log("");
  console.log(`Cuenta ${rol} lista: ${usuario.correo}`);
  if (slug) console.log(`Comercio:   ${slug}`);
  if (generada) {
    console.log(`Contraseña: ${password}`);
    console.log("");
    console.log("Se muestra una sola vez. Guardala y cambiala al entrar.");
  } else {
    console.log("Contraseña: la que pasaste por --password");
  }
  console.log(`Entrá en:   ${process.env.APP_URL ?? "http://localhost:3000"}/acceso`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
