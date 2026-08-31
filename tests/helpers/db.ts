import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export function crearPrismaTest() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/turno_test/.test(connectionString)) {
    throw new Error(
      "Las pruebas de integración exigen DATABASE_URL apuntando a turno_test. " +
        "Corré `npm test` (carga .env.test), no `vitest` directo.",
    );
  }
  // Pool amplio: las pruebas de concurrencia necesitan conexiones simultáneas
  // reales, no un pool que las serialice y esconda la condición de carrera.
  const adapter = new PrismaPg({ connectionString, max: 30 });
  return new PrismaClient({ adapter });
}

export async function limpiar(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE evento_pedido, item_pedido, notificacion, pedido, franja,
                   producto, sesion, token_acceso, auditoria_admin,
                   contador_limite, suscripcion_push, usuario, comercio
                   RESTART IDENTITY CASCADE
  `);
}

export interface EscenarioOpciones {
  capacidadMinutos?: number;
  factorSeguridad?: number;
  tiempoPreparacionMin?: number;
  cantidadFranjas?: number;
  cantidadUsuarios?: number;
  condicion?: "A" | "B";
  maxPedidosActivos?: number;
  minutosNoShow?: number;
  margenCutoffMin?: number;
}

/** Monta un comercio con franjas, un producto anticipable y N usuarios. */
export async function montarEscenario(
  prisma: PrismaClient,
  opts: EscenarioOpciones = {},
) {
  const {
    capacidadMinutos = 100,
    factorSeguridad = 0.85,
    tiempoPreparacionMin = 10,
    cantidadFranjas = 3,
    cantidadUsuarios = 20,
    condicion = "A",
    maxPedidosActivos = 20,
    minutosNoShow = 20,
    margenCutoffMin = 2,
  } = opts;

  const comercio = await prisma.comercio.create({
    data: {
      nombre: "Cafetería Central",
      slug: "cafeteria-central-" + Math.floor(Math.random() * 1e9).toString(36),
      personalCocina: 2,
      anchoFranjaMin: 10,
      factorSeguridad,
      tiempoMinAnticipable: 3,
      maxPedidosActivos,
      minutosNoShow,
      margenCutoffMin,
    },
  });

  const producto = await prisma.producto.create({
    data: {
      comercioId: comercio.id,
      nombre: "Pizza personal",
      precio: "120.00",
      tiempoPreparacionMin,
      anticipable: true,
    },
  });

  const base = new Date("2026-09-01T12:00:00.000Z");
  const franjas = [];
  for (let i = 0; i < cantidadFranjas; i++) {
    franjas.push(
      await prisma.franja.create({
        data: {
          comercioId: comercio.id,
          inicio: new Date(base.getTime() + i * 10 * 60_000),
          fin: new Date(base.getTime() + (i + 1) * 10 * 60_000),
          capacidadMinutos,
        },
      }),
    );
  }

  const usuarios = [];
  for (let i = 0; i < cantidadUsuarios; i++) {
    usuarios.push(
      await prisma.usuario.create({
        data: {
          correo: `est${i}.${Date.now()}@uam.edu.ni`,
          condicionExperimental: condicion,
          consentimiento: true,
          canalCaptacion: "qr_mostrador",
        },
      }),
    );
  }

  return { comercio, producto, franjas, usuarios };
}
