/**
 * Asigna una foto de archivo a cada producto del campus.
 *
 *   npx tsx scripts/fotos-campus.ts            → asigna
 *   npx tsx scripts/fotos-campus.ts --verificar → solo comprueba las URLs
 *
 * ## Por qué URL y no bytes subidos
 *
 * El sistema guarda las fotos que sube un comercio como bytes en `FotoProducto`,
 * y eso está bien para una foto tomada con el teléfono. Para estas no: son
 * imágenes de archivo, iguales para muchos productos, y guardarlas duplicaría
 * el mismo archivo ciento setenta y ocho veces dentro de una base con 512 MB de
 * cuota.
 *
 * `imagenUrl` apunta a Unsplash, que el proyecto ya tiene permitido tanto en el
 * CSP (`img-src`) como en `remotePatterns` de `next/image`. Si un comercio sube
 * su propia foto desde el panel, esa gana: son campos distintos.
 *
 * ## Son fotos de archivo, no de los platos
 *
 * Ninguna es del local. Están para que el catálogo no se vea vacío mientras
 * cada comercio sube las suyas, que es lo que de verdad hay que hacer antes del
 * piloto: la foto real del plato vende, y una de archivo no engaña a nadie que
 * haya comido ahí.
 *
 * Se usan imágenes genéricas por tipo de comida. Para los productos de marca
 * —Coca-Cola, Gatorade— la foto es de una bebida cualquiera, no material de la
 * marca: distribuir sus imágenes oficiales no es algo que se pueda hacer sin
 * permiso.
 *
 * ## Las URLs se verifican antes de escribir
 *
 * Una URL rota no da error: deja un hueco gris en la tarjeta, y eso se descubre
 * mirando la aplicación producto por producto. Acá se comprueban todas primero
 * y la que no responda 200 se queda sin asignar, que es un fallo visible en la
 * consola en vez de silencioso en la pantalla.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CAMPUS, BEBIDAS, type Foto } from "../prisma/seed-campus";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Parámetros de recorte: 800×600 basta para la tarjeta y para la hoja. */
const RECORTE = "?w=800&h=600&fit=crop&q=75";

/**
 * Varias fotos por tipo, no una.
 *
 * Con una sola, los seis batidos de un local salían con la misma imagen y la
 * cuadrícula parecía un error de carga. Se reparten por orden de producto, así
 * que el reparto es estable: el mismo producto recibe siempre la misma foto y
 * la pantalla no cambia entre visitas.
 *
 * Las que llevan una sola entrada son las que no se repiten lo suficiente como
 * para que se note.
 */
const FOTOS: Record<Foto, string[]> = {
  /* Ocho: Subway tiene ocho subs y con menos salían repetidos en la misma
     cuadrícula, que es donde la repetición se ve de golpe. */
  sandwich: [
    "photo-1553909489-cd47e0907980",
    "photo-1528735602780-2552fd46c7af",
    "photo-1509722747041-616f39b57569",
    "photo-1539252554453-80ab65ce3586",
    "photo-1550507992-eb63ffee0847",
    "photo-1592415486689-125cbbfcbee2",
    "photo-1554433607-66b5efe9d304",
    "photo-1626700051175-6818013e1d4f",
  ],
  hamburguesa: [
    "photo-1568901346375-23c9450c58cd",
    "photo-1550547660-d9450f859349",
    "photo-1571091718767-18b5b1457add",
  ],
  quesadilla: ["photo-1618040996337-56904b7850b9", "photo-1615870216519-2f9fa575fa5c"],
  "pollo-asado": ["photo-1598103442097-8b74394b95c6", "photo-1610057099443-fde8c4d50f91"],
  "pollo-frito": ["photo-1626645738196-c2a7c87a8f58", "photo-1562967914-608f82629710"],
  carne: ["photo-1546964124-0cce460f38ef"],
  almuerzo: ["photo-1512058564366-18510be2db19", "photo-1547592180-85f173990554"],
  papas: ["photo-1573080496219-bb080dd4f877"],
  enchilada: ["photo-1613514785940-daed07799d9b", "photo-1615870216519-2f9fa575fa5c"],
  taco: ["photo-1552332386-f8dd00dc2f85"],
  /*
   * No hay fotos de pupusas en el banco: es un plato centroamericano y el
   * catálogo de archivo no lo cubre. Se usan las de masa rellena a la plancha,
   * que es lo más cercano que existe. Este es el local donde más falta hacen
   * las fotos reales, y donde antes van a notarse.
   */
  pupusa: [
    "photo-1618040996337-56904b7850b9",
    "photo-1615870216519-2f9fa575fa5c",
    "photo-1613514785940-daed07799d9b",
    "photo-1552332386-f8dd00dc2f85",
    "photo-1626700051175-6818013e1d4f",
  ],
  sopa: ["photo-1591814468924-caf88d1232e1", "photo-1569718212165-3a8278d5f624"],
  hotdog: ["photo-1619740455993-9e612b1af08a", "photo-1612392061787-2d078b3e573c"],
  ensalada: ["photo-1512621776951-a57141f2eefd"],
  arroz: ["photo-1603133872878-684f208fb84b"],
  espresso: ["photo-1509042239860-f550ce710b93", "photo-1447933601403-0c6688de566e"],
  cappuccino: [
    "photo-1572442388796-11668a67e53d",
    "photo-1541167760496-1628856ab772",
    "photo-1517701550927-30cf4ba1dba5",
    "photo-1534778101976-62847782c213",
    "photo-1495474472287-4d71bcdd2085",
  ],
  frappe: ["photo-1461023058943-07fcbe16d735", "photo-1572490122747-3968b75cc699"],
  // Sin el jugo de naranja: lo lleva Hi-C, y en Espresso Americano caían los
  // dos en la misma tarjeta.
  limonada: ["photo-1621263764928-df1444c5e859", "photo-1497534446932-c925b458314e"],
  matcha: ["photo-1515823064-d6e0c04616a7"],
  batido: [
    "photo-1505252585461-04db1eb84625",
    "photo-1553530666-ba11a7da3888",
    "photo-1502741224143-90386d7f8c82",
    "photo-1638176066666-ffb2f013c7dd",
    "photo-1577805947697-89e18249d767",
  ],
  helado: [
    "photo-1497034825429-c343d7c6a68f",
    "photo-1560008581-09826d1de69e",
    "photo-1567206563064-6f60f40a2b57",
    "photo-1516559828984-fb3b99548b21",
    "photo-1488900128323-21503983a07e",
  ],
  frutas: ["photo-1490474418585-ba9bad8fd0ea", "photo-1564093497595-593b96d80180"],
  galleta: ["photo-1499636136210-6f4ee915583e", "photo-1558961363-fa8fdf82db35"],
  pastel: ["photo-1578985545062-69928b1d9587", "photo-1599974579688-8dbdd335c77f"],
  /* Una foto por bebida y no una para todas: son cuatro productos distintos en
     la misma cuadrícula, y con una sola imagen la fila de bebidas parecía un
     error de carga. Es donde más se notaba la repetición. */
  gaseosa: [
    "photo-1622483767028-3f66f32aef97",
    "photo-1581636625402-29b2a704ef13",
    "photo-1629203851122-3726ecdf080e",
  ],
  jugo: ["photo-1600271886742-f049cd451bba"],
  agua: ["photo-1548839140-29a749e1cf4d"],
  /* La segunda era una botella de agua transparente y le tocaba al Gatorade:
     la tarjeta decía "Gatorade" sobre una foto de agua. */
  isotonica: ["photo-1622543925917-763c34d1a86e", "photo-1595981267035-7b04ca84a82d"],
  te: ["photo-1556679343-c7306c1976bc"],
};

function url(clave: Foto, variante = 0): string {
  const lista = FOTOS[clave];
  return `https://images.unsplash.com/${lista[variante % lista.length]}${RECORTE}`;
}

/** Comprueba que la imagen exista de verdad antes de guardarla en la base. */
async function verificar(): Promise<Set<Foto>> {
  const claves = Object.keys(FOTOS) as Foto[];
  /* Se comprueban TODAS las variantes, no una por tipo: si solo se mirara la
     primera, una segunda foto rota pasaría el control y dejaría el hueco gris
     justo en los productos que se repiten, que son los más visibles. */
  const pares = claves.flatMap((k) => FOTOS[k].map((_, i) => ({ k, i })));

  const resultados = await Promise.all(
    pares.map(async ({ k, i }) => {
      try {
        const r = await fetch(url(k, i), { method: "HEAD" });
        return { k, i, ok: r.ok, estado: r.status };
      } catch {
        return { k, i, ok: false, estado: 0 };
      }
    }),
  );

  const rotas = new Set<Foto>();
  for (const r of resultados) {
    if (!r.ok) {
      rotas.add(r.k);
      console.log(`  ROTA  ${r.k}[${r.i}]  HTTP ${r.estado}`);
    }
  }

  const buenas = new Set(claves.filter((k) => !rotas.has(k)));
  console.log(
    `Fotos verificadas: ${resultados.filter((r) => r.ok).length}/${pares.length} responden ` +
      `en ${buenas.size}/${claves.length} tipos.\n`,
  );
  return buenas;
}

async function main() {
  const buenas = await verificar();
  if (process.argv.includes("--verificar")) return;

  // Un solo índice nombre→foto: las bebidas se repiten en todos los comercios,
  // y buscarlas por comercio obligaría a recorrer la lista dos veces.
  const porNombre = new Map<string, Foto>();
  for (const c of CAMPUS) {
    for (const p of c.productos) if (p.foto) porNombre.set(p.nombre, p.foto);
  }
  for (const b of BEBIDAS) if (b.foto) porNombre.set(b.nombre, b.foto);

  const productos = await prisma.producto.findMany({
    // Ordenado para que el reparto de variantes sea el mismo en cada corrida:
    // sin esto, Postgres puede devolver otro orden y las fotos bailarían de
    // producto entre una ejecución y la siguiente.
    orderBy: [{ comercioId: "asc" }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      comercioId: true,
      imagenUrl: true,
      foto: { select: { id: true } },
    },
  });

  let asignadas = 0;
  let sinClave = 0;
  let respetadas = 0;
  /* Cuántos productos van ya de cada tipo DENTRO del comercio en curso.
     El contador se reinicia al cambiar de local: lo que importa es que no se
     repitan en la misma pantalla, y cada comercio es una pantalla. Con un
     contador global, el segundo local arrancaba por donde quedó el primero y
     dos de sus productos podían caer en la misma variante. */
  let comercioActual: string | null = null;
  let vistos = new Map<Foto, number>();

  for (const p of productos) {
    if (p.comercioId !== comercioActual) {
      comercioActual = p.comercioId;
      vistos = new Map();
    }

    // Una foto subida por el comercio manda sobre la de archivo: es la real.
    if (p.foto) {
      respetadas++;
      continue;
    }

    const clave = porNombre.get(p.nombre);
    if (!clave || !buenas.has(clave)) {
      sinClave++;
      continue;
    }

    const n = vistos.get(clave) ?? 0;
    vistos.set(clave, n + 1);

    await prisma.producto.update({
      where: { id: p.id },
      data: { imagenUrl: url(clave, n) },
    });
    asignadas++;
  }

  console.log(`${asignadas} productos con foto.`);
  if (respetadas > 0) console.log(`${respetadas} conservan la foto que subió el comercio.`);
  if (sinClave > 0) console.log(`${sinClave} quedan con su mosaico (sin foto de archivo).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
