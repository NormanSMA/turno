/**
 * Emite una sesión para un correo, sin pasar por el buzón.
 *
 *   npm run sesion -- --correo=estudiante001@uam.edu.ni
 *
 * Solo para desarrollo y pruebas manuales. No es un agujero: quien puede correr
 * este script ya tiene la cadena de conexión a la base, y con eso puede hacer
 * cualquier cosa. Lo que evita es tener que degradar la seguridad del código de
 * producción —devolver el token en la respuesta— para poder probar.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  asignarCondicion,
  expiracionSesion,
  generarToken,
  hashToken,
  normalizarCorreo,
} from "../src/core/identidad";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function arg(n: string) {
  return process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Este script no corre en producción.");
    process.exit(1);
  }
  const correo = normalizarCorreo(arg("correo") ?? "");
  if (!correo) {
    console.error("Falta --correo=alguien@uam.edu.ni");
    process.exit(1);
  }

  const usuario =
    (await prisma.usuario.findUnique({ where: { correo } })) ??
    (await prisma.usuario.create({
      data: { correo, condicionExperimental: asignarCondicion(), consentimiento: true },
    }));

  const token = generarToken();
  await prisma.sesion.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: hashToken(token),
      expiraEn: expiracionSesion(),
      userAgent: "script sesion-dev",
    },
  });

  console.log("");
  console.log(`Sesión para ${usuario.correo} (rol ${usuario.rol}, condición ${usuario.condicionExperimental})`);
  console.log("");
  console.log("Pegá esto en la consola del navegador:");
  console.log(`  document.cookie = "turno_sesion=${token}; path=/; max-age=6480000"`);
  console.log("");

  /*
   * Enlace de un toque, para probar en un teléfono.
   *
   * En un teléfono no hay consola donde pegar una cookie, y el enlace mágico
   * real va por correo — que con las direcciones de demostración no llega a
   * ningún buzón que exista. Esto emite un TokenAcceso de verdad y arma la
   * misma URL que armaría el correo, así que el flujo que se prueba es el
   * REAL: `/entrar?token=…` lo canjea, lo marca usado y crea la sesión.
   *
   * `--url` permite apuntar al túnel en vez de a localhost.
   */
  const enlaceToken = generarToken();
  await prisma.tokenAcceso.create({
    data: {
      usuarioId: usuario.id,
      tokenHash: hashToken(enlaceToken),
      // Más holgado que los 15 minutos de producción: acá el token viaja a
      // mano hasta un teléfono, y que venza mientras lo copiás no aporta nada.
      expiraEn: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  const base = arg("url") ?? process.env.APP_URL ?? "http://localhost:3000";
  console.log("O abrí este enlace en el teléfono (sirve una sola vez, vence en 2 h):");
  console.log(`  ${base.replace(/\/$/, "")}/entrar?token=${enlaceToken}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
