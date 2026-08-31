/**
 * Semilla de desarrollo. Los valores de t(p) y C(f) son PLACEHOLDERS hasta la
 * fase 1 de calibración (§14.1): se reemplazan por los medidos con cronómetro.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generarFranjas } from "../src/core/franjas";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const comercio = await prisma.comercio.upsert({
    where: { slug: "cafeteria-central" },
    update: {},
    create: {
      nombre: "Cafetería Central",
      slug: "cafeteria-central",
      ubicacion: "Edificio A · planta baja",
      personalCocina: 2,
      anchoFranjaMin: 10,
      factorSeguridad: 0.85,
      tiempoMinAnticipable: 3,
    },
  });

  // Las fotos son de referencia para el entorno de desarrollo. En el piloto las
  // sube el comercio; si falta una, la interfaz dibuja un mosaico en vez de
  // dejar un hueco (ver `ImagenProducto`).
  const foto = (id: string) =>
    `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=70`;

  const productos = [
    {
      nombre: "Pizza personal",
      descripcion: "Masa fina, queso y salsa de la casa.",
      precio: "120.00",
      t: 10,
      anticipable: true,
      imagenUrl: foto("photo-1513104890138-7c749659a591"),
    },
    {
      nombre: "Almuerzo del día",
      descripcion: "Carne, arroz, ensalada y maduro.",
      precio: "150.00",
      t: 12,
      anticipable: true,
      imagenUrl: foto("photo-1546069901-ba9599a7e63c"),
    },
    {
      nombre: "Quesillo",
      descripcion: "Tortilla, queso, cebolla y crema.",
      precio: "60.00",
      t: 5,
      anticipable: true,
      imagenUrl: foto("photo-1565299624946-b28f40a0ae38"),
    },
    {
      nombre: "Café con leche",
      descripcion: "Café de Matagalpa, servido caliente.",
      precio: "45.00",
      t: 3,
      anticipable: true,
      imagenUrl: foto("photo-1509042239860-f550ce710b93"),
    },
    // Sin foto a propósito: verifica el mosaico de respaldo.
    {
      nombre: "Baho",
      descripcion: "Plato del viernes, por encargo.",
      precio: "180.00",
      t: 15,
      anticipable: true,
      imagenUrl: null,
    },
    {
      nombre: "Gaseosa",
      descripcion: null,
      precio: "35.00",
      t: 0,
      anticipable: false,
      imagenUrl: foto("photo-1622483767028-3f66f32aef97"),
    },
    {
      nombre: "Chicle",
      descripcion: null,
      precio: "5.00",
      t: 0,
      anticipable: false,
      imagenUrl: null,
    },
  ];

  for (const p of productos) {
    const existente = await prisma.producto.findFirst({
      where: { comercioId: comercio.id, nombre: p.nombre },
    });
    const datos = {
      comercioId: comercio.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      imagenUrl: p.imagenUrl,
      precio: p.precio,
      tiempoPreparacionMin: p.t,
      anticipable: p.anticipable,
    };
    if (existente) {
      await prisma.producto.update({ where: { id: existente.id }, data: datos });
      continue;
    }
    await prisma.producto.create({ data: datos });
  }

  // Receso de mediodía: 11:30–13:00 hora local, en franjas de Δ minutos.
  // Se generan cinco días de servicio: al correr la semilla por la tarde, las
  // franjas de hoy ya vencieron y sin los días siguientes no habría nada que
  // reservar — que es exactamente lo que pasa en la operación real.
  const franjas = [];
  for (let dia = 0; dia < 5; dia++) {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() + dia);
    inicio.setHours(11, 30, 0, 0);
    const fin = new Date(inicio);
    fin.setHours(13, 0, 0, 0);
    franjas.push(
      ...generarFranjas({
        inicio,
        fin,
        anchoMin: comercio.anchoFranjaMin,
        personalCocina: comercio.personalCocina,
      }),
    );
  }

  for (const f of franjas) {
    await prisma.franja.upsert({
      where: { comercioId_inicio: { comercioId: comercio.id, inicio: f.inicio } },
      update: { capacidadMinutos: f.capacidadMinutos, fin: f.fin },
      create: { comercioId: comercio.id, ...f },
    });
  }

  const admin = await prisma.usuario.upsert({
    where: { correo: "admin@uam.edu.ni" },
    update: { rol: "ADMIN" },
    create: {
      correo: "admin@uam.edu.ni",
      rol: "ADMIN",
      condicionExperimental: "A",
      consentimiento: true,
    },
  });

  // Operador de cocina, ligado al comercio: sin `comercioId` la autorización
  // por comercio lo rechazaría, que es justamente lo que debe hacer.
  await prisma.usuario.upsert({
    where: { correo: "cocina@uam.edu.ni" },
    update: { rol: "COMERCIO", comercioId: comercio.id },
    create: {
      correo: "cocina@uam.edu.ni",
      rol: "COMERCIO",
      comercioId: comercio.id,
      condicionExperimental: "A",
      consentimiento: true,
    },
  });

  console.log(
    `Semilla lista: comercio ${comercio.slug}, ${franjas.length} franjas, admin ${admin.correo}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
