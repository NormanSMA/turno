/**
 * Semilla de PRODUCCIÓN. Deja el sistema listo para operar, y vacío.
 *
 * Se diferencia de `seed.ts` en lo que **no** crea: ni productos, ni franjas,
 * ni pedidos, ni estudiantes. Solo los tres comercios del campus, una cuenta de
 * operación por cada uno y la cuenta de administración.
 *
 * No es una limitación, es el flujo real. El catálogo y los horarios los carga
 * cada comercio desde su panel, que es como va a funcionar el día que esto se
 * use — y cargarlos así de entrada prueba esas pantallas antes de que haya un
 * estudiante esperando.
 *
 * **Las cuentas nacen sin contraseña.** Los roles COMERCIO y ADMIN entran por
 * `/acceso` con credenciales (ADR-08), y una contraseña escrita en un archivo
 * versionado es una contraseña filtrada. Se asignan después, una por una, con:
 *
 *     npm run cuenta -- --correo=… --password="…"
 *
 * Es idempotente: se puede volver a correr sin duplicar nada.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Los tres comercios del campus.
 *
 * Los parámetros de capacidad son los mismos que venían de la calibración de
 * desarrollo y **son provisionales**: `personalCocina` y `factorSeguridad`
 * deciden cuántos pedidos admite cada franja, así que hay que medirlos con
 * cronómetro antes del piloto real (§14.1). Se dejan puestos para que el
 * sistema arranque, no porque sean los correctos.
 */
const COMERCIOS = [
  {
    nombre: "Cafetería Central",
    slug: "cafeteria-central",
    ubicacion: "Edificio A · planta baja",
    personalCocina: 2,
    anchoFranjaMin: 10,
    factorSeguridad: 0.85,
    tiempoMinAnticipable: 3,
    operador: "cafeteria@turno.app",
  },
  {
    nombre: "Comedor El Jaguar",
    slug: "comedor-el-jaguar",
    ubicacion: "Edificio C · frente a la cancha",
    personalCocina: 3,
    anchoFranjaMin: 15,
    factorSeguridad: 0.8,
    tiempoMinAnticipable: 5,
    operador: "jaguar@turno.app",
  },
  {
    nombre: "Café de la Biblioteca",
    slug: "cafe-biblioteca",
    ubicacion: "Biblioteca · primer piso",
    personalCocina: 1,
    anchoFranjaMin: 10,
    factorSeguridad: 0.9,
    tiempoMinAnticipable: 2,
    operador: "biblioteca@turno.app",
  },
] as const;

const ADMIN = "admin@turno.app";

async function main() {
  for (const c of COMERCIOS) {
    const { operador, ...datos } = c;

    const comercio = await prisma.comercio.upsert({
      where: { slug: c.slug },
      // No se pisan los parámetros si el comercio ya existe: puede que alguien
      // los haya ajustado desde el panel, y esta semilla no tiene por qué saber
      // más que quien opera la cocina.
      update: {},
      create: datos,
    });

    // Sin `comercioId` la autorización por comercio rechazaría a este operador,
    // que es exactamente lo que debe hacer.
    await prisma.usuario.upsert({
      where: { correo: operador },
      update: { rol: "COMERCIO", comercioId: comercio.id },
      create: {
        correo: operador,
        rol: "COMERCIO",
        comercioId: comercio.id,
        condicionExperimental: "A",
        consentimiento: true,
      },
    });

    console.log(`comercio  ${comercio.slug.padEnd(20)} operador ${operador}`);
  }

  await prisma.usuario.upsert({
    where: { correo: ADMIN },
    update: { rol: "ADMIN" },
    create: {
      correo: ADMIN,
      rol: "ADMIN",
      condicionExperimental: "A",
      consentimiento: true,
    },
  });
  console.log(`admin     ${ADMIN}`);

  const pedidos = await prisma.pedido.count();
  const estudiantes = await prisma.usuario.count({ where: { rol: "ESTUDIANTE" } });
  console.log(
    `\nListo. Pedidos: ${pedidos} · estudiantes: ${estudiantes} · productos: ${await prisma.producto.count()}`,
  );
  console.log(
    "Falta asignar contraseñas: npm run cuenta -- --correo=… --password=…",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
