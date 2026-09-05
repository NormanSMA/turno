/**
 * Los comercios reales del campus, su catálogo y sus cuentas de operación.
 *
 *   npx tsx prisma/seed-campus.ts            → crea y actualiza
 *   npx tsx prisma/seed-campus.ts --limpiar  → antes borra los comercios que
 *                                              no estén en esta lista
 *
 * ## Qué toca y qué no
 *
 * `--limpiar` borra **solo comercios y sus cuentas de operación**. El admin y
 * las cuentas de estudiante no se tocan nunca, ni siquiera con la bandera: son
 * las que dan acceso al sistema y las que llevan el historial del piloto, y una
 * carga de catálogo no tiene por qué poder dejar a nadie fuera.
 *
 * Sin la bandera es puramente aditivo e idempotente: identifica los comercios
 * por `slug` y los productos por (comercio, nombre). Volver a correrlo actualiza
 * precios y tiempos, y no duplica. Tampoco borra productos que un comercio haya
 * agregado por su cuenta desde el panel — un script que limpia lo que no
 * conoce es una forma cara de perder el trabajo de otro.
 *
 * ## Los precios son ESTIMADOS
 *
 * No venían con el encargo. Están a precio de mercado de Managua para que el
 * sistema tenga con qué trabajar, y **hay que revisarlos antes del piloto**.
 *
 * ## Los tiempos NO son estimados: son la decisión de producto
 *
 * `tiempoPreparacionMin` gobierna la admisión, así que respeta la distinción
 * que Norman describió local por local:
 *
 *   - Lo que **ya está hecho y solo se sirve o se calienta** —el almuerzo de
 *     Bonanza al mediodía, las enchiladas del Jaguarcito— lleva tiempos cortos.
 *   - Lo que **se hace al momento** —las pupusas, un hot dog, una hamburguesa—
 *     lleva su tiempo real.
 *
 * Esa diferencia es la que decide si anticipar vale la pena.
 *
 * ## Qué se reserva y qué se compra en el mostrador
 *
 * La línea no la marca el precio ni el tipo de producto: la marca **si hay algo
 * que preparar**.
 *
 *   - **Se reserva** lo que lleva trabajo, aunque sea poco: un chocobanano hay
 *     que bañarlo y congelarlo, un helado hay que servirlo, un fresco hay que
 *     hacerlo. Ahí anticipar ahorra espera de verdad.
 *   - **Se compra en el mostrador** lo que solo se toma de una vitrina o un
 *     refrigerador: el agua, las gaseosas, una galleta empacada. Reservarlo no
 *     ahorra un segundo y ocupa franja, que es capacidad que se le quita a un
 *     plato que sí hay que cocinar.
 *
 * `tiempoMinAnticipable` queda en 2 como piso técnico —por debajo no hay nada
 * que anticipar— y la decisión real la lleva `anticipable`, producto por
 * producto, que además el comercio puede cambiar desde el panel.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword, passwordSugerida } from "../src/core/credenciales";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Clave de la foto de archivo que le toca a cada producto.
 *
 * No es la foto del plato real: son imágenes de stock de licencia libre,
 * agrupadas por tipo, para que el catálogo no se vea vacío mientras cada
 * comercio sube las suyas desde el panel. Las asigna `scripts/fotos-campus.ts`.
 */
type Foto =
  | "sandwich" | "hamburguesa" | "quesadilla" | "pollo-asado" | "pollo-frito"
  | "carne" | "almuerzo" | "papas" | "enchilada" | "taco" | "pupusa"
  | "sopa" | "hotdog" | "ensalada" | "arroz"
  | "espresso" | "cappuccino" | "frappe" | "limonada" | "matcha"
  | "batido" | "helado" | "frutas" | "galleta" | "pastel"
  | "gaseosa" | "agua" | "isotonica" | "te" | "jugo";

interface ProductoSemilla {
  nombre: string;
  descripcion?: string;
  /** Córdobas. ESTIMADO — revisar antes del piloto. */
  precio: number;
  /** Minutos de cocina, por tipo de preparación. */
  min: number;
  anticipable: boolean;
  foto?: Foto;
}

/**
 * Las bebidas embotelladas, iguales en todos los locales.
 *
 * Están en una constante porque son el mismo producto en diez sitios: escritas
 * diez veces, el día que cambie el precio de la Coca-Cola habría que acordarse
 * de los diez.
 *
 * **Todas de mostrador.** No se preparan: se sacan del refrigerador al
 * entregar. Reservarlas no le ahorra un segundo a nadie y en cambio ocuparía
 * franja, que es capacidad que se le quita a un plato que sí hay que cocinar.
 * Se recogen junto con el pedido, en el mismo mostrador y en el mismo viaje.
 */
const BEBIDAS: ProductoSemilla[] = [
  { nombre: "Coca-Cola 500 ml", precio: 35, min: 0, anticipable: false, foto: "gaseosa" },
  { nombre: "Coca-Cola Zero 500 ml", precio: 35, min: 0, anticipable: false, foto: "gaseosa" },
  { nombre: "Pepsi 500 ml", precio: 32, min: 0, anticipable: false, foto: "gaseosa" },
  { nombre: "Agua purificada 600 ml", precio: 20, min: 0, anticipable: false, foto: "agua" },
  { nombre: "Gatorade", descripcion: "Sabor según disponibilidad.", precio: 55, min: 0, anticipable: false, foto: "isotonica" },
  { nombre: "Electrolit", descripcion: "Suero rehidratante.", precio: 85, min: 0, anticipable: false, foto: "isotonica" },
  { nombre: "Hi-C", descripcion: "Jugo de naranja.", precio: 30, min: 0, anticipable: false, foto: "jugo" },
  { nombre: "Té Lipton", descripcion: "Frío, en botella.", precio: 38, min: 0, anticipable: false, foto: "te" },
];

interface ComercioSemilla {
  slug: string;
  nombre: string;
  ubicacion: string;
  /** Correo de la cuenta de operación. */
  correo: string;
  personalCocina: number;
  /** Δ — ancho de franja. */
  anchoFranjaMin: number;
  /** Horario de servicio, para generar franjas. */
  abre: string;
  cierra: string;
  /** El nombre real no se sabía: hay que confirmarlo. */
  nombreProvisional?: boolean;
  /** Si no vende bebidas embotelladas. */
  sinBebidas?: boolean;
  productos: ProductoSemilla[];
}

/** t_mín para todos: ver el encabezado. */
const T_MIN = 2;

/*
 * La ubicación se escribe "LUGAR · detalle", y ese formato NO es estético.
 *
 * `zonaDe()` parte por el "·" y se queda con lo de la izquierda para saber qué
 * comercios están juntos y marcar "acá cerca". Sin el separador, la zona pasa a
 * ser la frase entera y cada local queda solo en una zona propia: la agrupación
 * deja de existir y nada falla, que es lo que la hace fácil de romper.
 *
 * Los nombres son los que usa la gente, no una descripción. El puesto de pollo
 * y el de pupusas están en el **Chilamate** —donde se reúnen los estudiantes—,
 * y llamarlo "costado derecho del edificio J" obliga a traducir algo que ya
 * tiene nombre.
 *
 * No hay metros ni minutos a propósito. El campus es chico, el GPS bajo techo
 * falla, y "a 800 m" es un número que habría que calcular mal para decir algo
 * que el nombre del lugar ya dice bien.
 */
const CAMPUS: ComercioSemilla[] = [
  /* ------------------------------------------------ Food court · planta baja */
  {
    slug: "subway",
    nombre: "Subway",
    ubicacion: "Food court · planta baja, a la entrada",
    correo: "subway@uamv.edu.ni",
    personalCocina: 2,
    anchoFranjaMin: 10,
    abre: "10:00",
    cierra: "19:00",
    productos: [
      { nombre: "Sub de pollo teriyaki 15 cm", descripcion: "Pan a elección, vegetales y salsa.", precio: 185, min: 6, anticipable: true, foto: "sandwich" },
      { nombre: "Sub italiano B.M.T. 15 cm", descripcion: "Pepperoni, salami y jamón.", precio: 195, min: 6, anticipable: true, foto: "sandwich" },
      { nombre: "Sub de jamón 15 cm", precio: 165, min: 5, anticipable: true, foto: "sandwich" },
      { nombre: "Sub de atún 15 cm", precio: 175, min: 5, anticipable: true, foto: "sandwich" },
      { nombre: "Sub de pavo y queso 15 cm", precio: 180, min: 5, anticipable: true, foto: "sandwich" },
      { nombre: "Sub vegetariano 15 cm", descripcion: "Solo vegetales y queso.", precio: 150, min: 5, anticipable: true, foto: "sandwich" },
      { nombre: "Sub de pollo teriyaki 30 cm", precio: 320, min: 8, anticipable: true, foto: "sandwich" },
      { nombre: "Sub italiano B.M.T. 30 cm", precio: 335, min: 8, anticipable: true, foto: "sandwich" },
      { nombre: "Ensalada de pollo", precio: 165, min: 5, anticipable: true, foto: "ensalada" },
      { nombre: "Papas fritas", precio: 65, min: 4, anticipable: true, foto: "papas" },
      { nombre: "Galleta de chocolate", precio: 35, min: 0, anticipable: false, foto: "galleta" },
    ],
  },
  {
    slug: "florencia",
    nombre: "Florencia Bistro Café",
    ubicacion: "Food court · planta baja",
    correo: "florencia@uamv.edu.ni",
    personalCocina: 2,
    anchoFranjaMin: 15,
    abre: "08:00",
    cierra: "18:00",
    productos: [
      { nombre: "Hamburguesa clásica", descripcion: "Carne de res, queso, lechuga y tomate.", precio: 175, min: 12, anticipable: true, foto: "hamburguesa" },
      { nombre: "Hamburguesa doble", descripcion: "Doble carne y doble queso.", precio: 245, min: 15, anticipable: true, foto: "hamburguesa" },
      { nombre: "Hamburguesa de pollo", precio: 165, min: 12, anticipable: true, foto: "hamburguesa" },
      { nombre: "Quesadilla de pollo", precio: 155, min: 10, anticipable: true, foto: "quesadilla" },
      { nombre: "Quesadilla de res", precio: 165, min: 10, anticipable: true, foto: "quesadilla" },
      { nombre: "Pollo a la plancha", descripcion: "Con arroz y ensalada.", precio: 195, min: 15, anticipable: true, foto: "pollo-asado" },
      { nombre: "Carne asada", descripcion: "Con gallo pinto, maduro y ensalada.", precio: 225, min: 15, anticipable: true, foto: "carne" },
      { nombre: "Alitas · 8 piezas", precio: 185, min: 14, anticipable: true, foto: "pollo-frito" },
      { nombre: "Papas fritas", precio: 75, min: 6, anticipable: true, foto: "papas" },
      { nombre: "Ensalada césar con pollo", precio: 165, min: 8, anticipable: true, foto: "ensalada" },
      { nombre: "Café americano", precio: 55, min: 3, anticipable: true, foto: "espresso" },
    ],
  },
  {
    slug: "campestre-bonanza",
    nombre: "Campestre Bonanza",
    ubicacion: "Food court · planta baja, al fondo",
    correo: "bonanza@uamv.edu.ni",
    personalCocina: 2,
    anchoFranjaMin: 10,
    abre: "11:00",
    cierra: "15:00",
    productos: [
      { nombre: "Almuerzo del día", descripcion: "Ya preparado al mediodía: solo se sirve.", precio: 145, min: 5, anticipable: true, foto: "almuerzo" },
      { nombre: "Almuerzo con pollo", descripcion: "Arroz, ensalada, maduro y pollo.", precio: 155, min: 5, anticipable: true, foto: "almuerzo" },
      { nombre: "Almuerzo con carne", precio: 165, min: 5, anticipable: true, foto: "carne" },
      { nombre: "Enchilada", precio: 35, min: 4, anticipable: true, foto: "enchilada" },
      { nombre: "Taco", precio: 45, min: 4, anticipable: true, foto: "taco" },
      { nombre: "Repocheta", precio: 35, min: 4, anticipable: true, foto: "enchilada" },
      { nombre: "Tajadas con queso", precio: 60, min: 5, anticipable: true, foto: "papas" },
      { nombre: "Fresco natural", descripcion: "Del día, según fruta.", precio: 30, min: 2, anticipable: true, foto: "limonada" },
    ],
  },
  {
    slug: "heladeria-food-court",
    nombre: "Heladería del Food Court",
    nombreProvisional: true,
    ubicacion: "Food court · planta baja, junto a las gradas",
    correo: "heladeria@uamv.edu.ni",
    personalCocina: 1,
    anchoFranjaMin: 10,
    abre: "10:00",
    cierra: "18:00",
    productos: [
      { nombre: "Helado de vaso · dos bolas", precio: 70, min: 2, anticipable: true, foto: "helado" },
      { nombre: "Cono simple", precio: 50, min: 2, anticipable: true, foto: "helado" },
      { nombre: "Sundae", descripcion: "Con salsa y topping a elección.", precio: 95, min: 3, anticipable: true, foto: "helado" },
      { nombre: "Banana split", precio: 135, min: 5, anticipable: true, foto: "helado" },
      { nombre: "Malteada de vainilla", precio: 110, min: 4, anticipable: true, foto: "batido" },
      { nombre: "Malteada de chocolate", precio: 110, min: 4, anticipable: true, foto: "batido" },
      { nombre: "Paleta de agua", precio: 30, min: 0, anticipable: false, foto: "helado" },
    ],
  },

  /* --------------------------------------------- Food court · segunda planta */
  {
    slug: "espresso-americano",
    nombre: "Espresso Americano",
    ubicacion: "Food court · segunda planta, subiendo a la derecha",
    correo: "espresso@uamv.edu.ni",
    personalCocina: 2,
    anchoFranjaMin: 10,
    abre: "06:30",
    cierra: "18:00",
    productos: [
      { nombre: "Espresso", precio: 55, min: 3, anticipable: true, foto: "espresso" },
      { nombre: "Americano", precio: 60, min: 3, anticipable: true, foto: "espresso" },
      { nombre: "Cappuccino", precio: 85, min: 4, anticipable: true, foto: "cappuccino" },
      { nombre: "Latte", precio: 90, min: 4, anticipable: true, foto: "cappuccino" },
      { nombre: "Latte saborizado", descripcion: "Vainilla, caramelo o avellana.", precio: 100, min: 4, anticipable: true, foto: "cappuccino" },
      { nombre: "Mochaccino", precio: 105, min: 5, anticipable: true, foto: "cappuccino" },
      { nombre: "Mocha blanco", precio: 110, min: 5, anticipable: true, foto: "cappuccino" },
      { nombre: "Granita de café", descripcion: "Frappé de café, frío.", precio: 115, min: 5, anticipable: true, foto: "frappe" },
      { nombre: "Granita de mango", precio: 105, min: 5, anticipable: true, foto: "frappe" },
      { nombre: "Limonada de lavanda", precio: 85, min: 4, anticipable: true, foto: "limonada" },
      { nombre: "Limonada de jamaica", precio: 85, min: 4, anticipable: true, foto: "limonada" },
      { nombre: "Matcha helado", precio: 110, min: 5, anticipable: true, foto: "matcha" },
      { nombre: "Smoothie de frutas", precio: 105, min: 5, anticipable: true, foto: "batido" },
      { nombre: "Sándwich de pollo pesto", precio: 155, min: 6, anticipable: true, foto: "sandwich" },
      { nombre: "Sándwich de jamón y pavo", precio: 145, min: 6, anticipable: true, foto: "sandwich" },
      { nombre: "Wrap de pollo", precio: 160, min: 7, anticipable: true, foto: "sandwich" },
      { nombre: "Pan con frijoles", precio: 65, min: 4, anticipable: true, foto: "sandwich" },
      { nombre: "Galleta de avena", precio: 45, min: 0, anticipable: false, foto: "galleta" },
      { nombre: "Alfajor", precio: 50, min: 0, anticipable: false, foto: "galleta" },
      { nombre: "Pastel Selva Negra · porción", precio: 95, min: 0, anticipable: false, foto: "pastel" },
      { nombre: "Tartaleta de frutas", precio: 85, min: 0, anticipable: false, foto: "pastel" },
    ],
  },
  {
    slug: "batidos-naturales",
    nombre: "Batidos Naturales",
    nombreProvisional: true,
    ubicacion: "Food court · segunda planta",
    correo: "batidos@uamv.edu.ni",
    personalCocina: 1,
    anchoFranjaMin: 10,
    abre: "08:00",
    cierra: "17:00",
    productos: [
      { nombre: "Batido de fresa", precio: 85, min: 5, anticipable: true, foto: "batido" },
      { nombre: "Batido de banano", precio: 75, min: 5, anticipable: true, foto: "batido" },
      { nombre: "Batido de papaya", precio: 75, min: 5, anticipable: true, foto: "batido" },
      { nombre: "Batido mixto", descripcion: "Fresa, banano y papaya.", precio: 95, min: 6, anticipable: true, foto: "batido" },
      { nombre: "Batido en leche", descripcion: "Cualquier fruta, con leche.", precio: 95, min: 6, anticipable: true, foto: "batido" },
      { nombre: "Jugo de naranja natural", precio: 70, min: 4, anticipable: true, foto: "limonada" },
      { nombre: "Ensalada de frutas", precio: 90, min: 5, anticipable: true, foto: "frutas" },
      { nombre: "Ensalada de frutas con yogur", precio: 110, min: 6, anticipable: true, foto: "frutas" },
      { nombre: "Chocobanano", descripcion: "Banano bañado en chocolate, congelado.", precio: 35, min: 4, anticipable: true, foto: "helado" },
    ],
  },

  /* ------------------------------------------------------ Fuera del ranchito */
  {
    slug: "el-ranchito",
    nombre: "El Ranchito",
    ubicacion: "El Ranchito · frente a la FIA",
    correo: "ranchito@uamv.edu.ni",
    personalCocina: 2,
    anchoFranjaMin: 10,
    abre: "10:00",
    cierra: "16:00",
    productos: [
      { nombre: "Almuerzo del día", precio: 140, min: 5, anticipable: true, foto: "almuerzo" },
      { nombre: "Almuerzo con pollo", precio: 150, min: 5, anticipable: true, foto: "almuerzo" },
      { nombre: "Enchilada", precio: 35, min: 4, anticipable: true, foto: "enchilada" },
      { nombre: "Taco", precio: 45, min: 4, anticipable: true, foto: "taco" },
      { nombre: "Repocheta", precio: 35, min: 4, anticipable: true, foto: "enchilada" },
      { nombre: "Maruchan", descripcion: "Sopa instantánea, lista en minutos.", precio: 55, min: 5, anticipable: true, foto: "sopa" },
      { nombre: "Maruchan con huevo", precio: 70, min: 6, anticipable: true, foto: "sopa" },
      { nombre: "Tajadas con carne", precio: 95, min: 7, anticipable: true, foto: "carne" },
      { nombre: "Fresco natural", precio: 30, min: 2, anticipable: true, foto: "limonada" },
    ],
  },
  {
    slug: "kiosko-jaguarcito",
    nombre: "Kiosko Jaguarcito",
    ubicacion: "Canchas · junto al campo de béisbol",
    correo: "jaguarcito@uamv.edu.ni",
    personalCocina: 1,
    anchoFranjaMin: 10,
    abre: "09:00",
    cierra: "17:00",
    productos: [
      { nombre: "Almuerzo del día", descripcion: "Preparado antes; solo se calienta.", precio: 135, min: 4, anticipable: true, foto: "almuerzo" },
      { nombre: "Enchilada", descripcion: "Se calienta, no se hace al momento.", precio: 30, min: 3, anticipable: true, foto: "enchilada" },
      { nombre: "Taco", descripcion: "Se calienta, no se hace al momento.", precio: 40, min: 3, anticipable: true, foto: "taco" },
      { nombre: "Repocheta", descripcion: "Se calienta.", precio: 30, min: 3, anticipable: true, foto: "enchilada" },
      { nombre: "Maruchan", precio: 55, min: 5, anticipable: true, foto: "sopa" },
      { nombre: "Hot dog", descripcion: "Este sí se arma al momento.", precio: 65, min: 6, anticipable: true, foto: "hotdog" },
      { nombre: "Hot dog doble", precio: 95, min: 7, anticipable: true, foto: "hotdog" },
      { nombre: "Nachos con queso", precio: 75, min: 4, anticipable: true, foto: "papas" },
    ],
  },

  /* -------------------------------------------------- Costado del edificio J */
  {
    slug: "pollo-edificio-j",
    nombre: "Pollo Edificio J",
    nombreProvisional: true,
    ubicacion: "Chilamate · costado del edificio J",
    correo: "polloj@uamv.edu.ni",
    personalCocina: 2,
    anchoFranjaMin: 15,
    abre: "10:30",
    cierra: "16:00",
    productos: [
      { nombre: "Cuarto de pollo asado", descripcion: "Del asador, ya listo.", precio: 165, min: 4, anticipable: true, foto: "pollo-asado" },
      { nombre: "Medio pollo asado", precio: 290, min: 5, anticipable: true, foto: "pollo-asado" },
      { nombre: "Pollo frito · porción", descripcion: "Se fríe al momento.", precio: 175, min: 12, anticipable: true, foto: "pollo-frito" },
      { nombre: "Alitas fritas · 6 piezas", precio: 155, min: 12, anticipable: true, foto: "pollo-frito" },
      { nombre: "Arroz con pollo", precio: 145, min: 5, anticipable: true, foto: "arroz" },
      { nombre: "Ensalada de repollo", precio: 40, min: 3, anticipable: true, foto: "ensalada" },
      { nombre: "Tajadas", precio: 45, min: 4, anticipable: true, foto: "papas" },
    ],
  },
  {
    slug: "pupuseria-edificio-j",
    nombre: "Pupusería Edificio J",
    nombreProvisional: true,
    ubicacion: "Chilamate · costado del edificio J, junto al pollo",
    correo: "pupusas@uamv.edu.ni",
    personalCocina: 1,
    anchoFranjaMin: 15,
    abre: "11:00",
    cierra: "18:00",
    productos: [
      { nombre: "Pupusa de queso", descripcion: "Hecha al momento en la plancha.", precio: 45, min: 8, anticipable: true, foto: "pupusa" },
      { nombre: "Pupusa revuelta", descripcion: "Chicharrón, queso y frijol.", precio: 55, min: 9, anticipable: true, foto: "pupusa" },
      { nombre: "Pupusa de frijol con queso", precio: 45, min: 8, anticipable: true, foto: "pupusa" },
      { nombre: "Pupusa de loroco", precio: 55, min: 9, anticipable: true, foto: "pupusa" },
      { nombre: "Orden de tres pupusas", descripcion: "A elección, con curtido.", precio: 130, min: 14, anticipable: true, foto: "pupusa" },
      { nombre: "Curtido extra", descripcion: "Repollo curtido, se sirve con las pupusas.", precio: 20, min: 2, anticipable: true, foto: "ensalada" },
      { nombre: "Fresco natural", precio: 30, min: 2, anticipable: true, foto: "limonada" },
    ],
  },
];

/** Los slugs que este script gobierna. */
const SLUGS = new Set(CAMPUS.map((c) => c.slug));

/**
 * Borra los comercios que no están en la lista, con sus cuentas de operación.
 *
 * Solo cuentas de rol COMERCIO, y solo las de esos comercios. El admin y los
 * estudiantes quedan intactos: son el acceso al sistema y el historial del
 * piloto, y una carga de catálogo no puede dejar a nadie fuera.
 */
async function limpiar() {
  const sobrantes = await prisma.comercio.findMany({
    where: { slug: { notIn: [...SLUGS] } },
    select: { id: true, slug: true, nombre: true },
  });

  if (sobrantes.length === 0) {
    console.log("Limpieza: no hay comercios sobrantes.\n");
    return;
  }

  const ids = sobrantes.map((c) => c.id);

  const cuentas = await prisma.usuario.deleteMany({
    where: { rol: "COMERCIO", comercioId: { in: ids } },
  });

  /*
   * Los pedidos se borran a mano, ANTES que el comercio.
   *
   * `Producto` y `Franja` sí caen en cascada al borrar el comercio, pero
   * `ItemPedido → Producto` y `Pedido → Franja` no la declaran: Postgres las
   * restringe y el borrado falla entero con una violación de clave foránea.
   *
   * No es un descuido del esquema, es una protección: un pedido es el registro
   * de algo que pasó de verdad —alguien pagó y retiró— y no puede evaporarse
   * porque se borre el catálogo. Acá se borra explícitamente porque son datos
   * de prueba y así se ha pedido; los items, eventos y notificaciones sí caen
   * en cascada desde el pedido.
   */
  const pedidos = await prisma.pedido.deleteMany({
    where: { franja: { comercioId: { in: ids } } },
  });

  const borrados = await prisma.comercio.deleteMany({ where: { id: { in: ids } } });

  if (pedidos.count > 0) console.log(`Limpieza: ${pedidos.count} pedidos de prueba borrados.`);

  console.log(
    `Limpieza: ${borrados.count} comercios y ${cuentas.count} cuentas de operación borrados ` +
      `(${sobrantes.map((c) => c.nombre).join(", ")}).\n`,
  );
}

async function main() {
  if (process.argv.includes("--limpiar")) await limpiar();

  const credenciales: { comercio: string; correo: string; password: string }[] = [];
  let productos = 0;

  for (const c of CAMPUS) {
    const existia = await prisma.comercio.findUnique({ where: { slug: c.slug } });

    const comercio = await prisma.comercio.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        nombre: c.nombre,
        ubicacion: c.ubicacion,
        personalCocina: c.personalCocina,
        anchoFranjaMin: c.anchoFranjaMin,
        tiempoMinAnticipable: T_MIN,
        estadoOperacion: "ABIERTO",
      },
      /*
       * Al actualizar NO se toca `estadoOperacion`: si el comercio se pausó
       * porque la cocina se cayó, correr este script no puede reabrirlo a sus
       * espaldas y dejar entrar pedidos que nadie va a preparar.
       */
      update: {
        nombre: c.nombre,
        ubicacion: c.ubicacion,
        personalCocina: c.personalCocina,
        anchoFranjaMin: c.anchoFranjaMin,
        tiempoMinAnticipable: T_MIN,
      },
    });

    const lista = c.sinBebidas ? c.productos : [...c.productos, ...BEBIDAS];

    for (const p of lista) {
      const previo = await prisma.producto.findFirst({
        where: { comercioId: comercio.id, nombre: p.nombre },
      });

      const datos = {
        descripcion: p.descripcion ?? null,
        precio: p.precio.toFixed(2),
        tiempoPreparacionMin: p.min,
        anticipable: p.anticipable,
      };

      if (previo) {
        await prisma.producto.update({ where: { id: previo.id }, data: datos });
      } else {
        await prisma.producto.create({
          data: { comercioId: comercio.id, nombre: p.nombre, disponible: true, ...datos },
        });
      }
      productos++;
    }

    /*
     * La cuenta se crea solo si no existe. Regenerar la contraseña en cada
     * corrida dejaría fuera al comercio que ya la tenía guardada, y sin aviso:
     * la carga de un catálogo no puede cambiar credenciales.
     */
    const cuenta = await prisma.usuario.findUnique({ where: { correo: c.correo } });
    if (!cuenta) {
      const password = passwordSugerida();
      await prisma.usuario.create({
        data: {
          correo: c.correo,
          rol: "COMERCIO",
          comercioId: comercio.id,
          // Obligatorio en el esquema y sin valor por defecto. Para una cuenta
          // de operación da igual cuál sea: la variable experimental es del
          // estudiante, no de quien despacha.
          condicionExperimental: "A",
          passwordHash: await hashPassword(password),
        },
      });
      credenciales.push({ comercio: c.nombre, correo: c.correo, password });
    }

    console.log(
      `${existia ? "actualizado" : "creado     "} ${c.nombre.padEnd(26)} ` +
        `${String(lista.length).padStart(2)} productos · ${c.abre}–${c.cierra}`,
    );
  }

  console.log(`\n${CAMPUS.length} comercios · ${productos} productos.`);

  if (credenciales.length > 0) {
    console.log("\nCuentas nuevas — se muestran UNA sola vez:\n");
    for (const c of credenciales) {
      console.log(`  ${c.comercio.padEnd(26)} ${c.correo.padEnd(28)} ${c.password}`);
    }
  }

  const provisionales = CAMPUS.filter((c) => c.nombreProvisional);
  if (provisionales.length > 0) {
    console.log(
      `\nNombres provisionales, a confirmar: ${provisionales.map((c) => c.nombre).join(", ")}.`,
    );
  }
  console.log("Precios estimados: revisar antes de abrir el piloto.");
}

/*
 * Solo se ejecuta si ESTE archivo es el que se invocó.
 *
 * `scripts/franjas-campus.ts` importa `CAMPUS` para saber el horario de cada
 * local, y sin esta guarda esa importación relanzaba la carga entera del
 * catálogo: pedir un dato escribía en la base. Un módulo que se importa no
 * puede tener efectos.
 */
if (process.argv[1]?.replace(/\\/g, "/").includes("seed-campus")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { CAMPUS, BEBIDAS, type Foto };
