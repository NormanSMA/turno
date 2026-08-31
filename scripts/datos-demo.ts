/**
 * Generador de datos de demostración.
 *
 *   npm run db:demo
 *
 * Produce un piloto verosímil: tres comercios con parámetros distintos, catálogo
 * con fotos, ~140 usuarios repartidos entre las condiciones A y B, y ~500
 * pedidos con historia de varios días.
 *
 * Dos decisiones que importan para que los datos SIRVAN:
 *
 *  1. La demanda NO es uniforme. Se concentra alrededor de las 12:00 con una
 *     campana, porque el fenómeno que el sistema existe para administrar es
 *     justamente esa concentración. Un generador uniforme produciría un
 *     pico/promedio cercano a 1 y el panel mostraría que la hipótesis se cumple
 *     sin que el sistema haya hecho nada.
 *
 *  2. La condición B elige la franja con MENOS carga entre las disponibles, y
 *     la A elige según su preferencia (la campana). Esa es exactamente la
 *     diferencia que el piloto real va a medir, así que los datos sintéticos
 *     tienen que exhibirla o el panel no se puede leer.
 *
 * Los pedidos históricos se escriben directamente, con marcas de tiempo
 * explícitas: pasarlos por `reservar()` fallaría el cut-off, porque sus franjas
 * ya vencieron. Los de HOY sí pasan por el motor real.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { EstadoPedido } from "../src/generated/prisma/enums";
import { generarFranjas } from "../src/core/franjas";
import { reservar } from "../src/core/reserva";
import { cambiarEstado } from "../src/core/ciclo-vida";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Aleatoriedad reproducible: correr el generador dos veces tiene que dar el
// mismo piloto, o comparar dos ejecuciones del panel no significa nada.
let semilla = 20260824;
function aleatorio(): number {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
function entre(min: number, max: number): number {
  return min + Math.floor(aleatorio() * (max - min + 1));
}
function elegir<T>(xs: readonly T[]): T {
  return xs[Math.floor(aleatorio() * xs.length)];
}
function ocurre(p: number): boolean {
  return aleatorio() < p;
}

const foto = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=70`;

/**
 * Ventanas de servicio.
 *
 * El campus no tiene un solo pico. Hay demanda en el receso de la mañana
 * (9:00–10:00), en el almuerzo (11:30–13:00), a media tarde (14:30–15:15) y en
 * el turno de la noche (18:00–19:00), donde estudia buena parte de la carrera
 * por encuentros. Los sábados solo hay actividad en la mañana, y es alta.
 *
 * Modelarlo importa para la tesis: si el generador produjera un único pico
 * diario, el análisis del ancho de franja Δ y del factor α estaría calibrado
 * sobre un patrón de demanda que no es el del campus. Y el `peso` de cada
 * ventana permite que una hora concentre más carga que otra, que es justamente
 * el fenómeno que el control de admisión administra.
 */
interface Ventana {
  desde: [number, number];
  hasta: [number, number];
  /** Peso relativo de la demanda en esta ventana. */
  peso: number;
  /** Días de la semana en que abre (0 = domingo). */
  dias: number[];
}

/**
 * Un mes de historia.
 *
 * Treinta días es el mínimo para que el panel muestre algo parecido a un
 * piloto: con dos semanas, la comparación entre días de la semana se apoya en
 * dos muestras por día y cualquier ruido parece una tendencia.
 */
const DIAS_HISTORIA = 30;

/**
 * Cuánta demanda tiene cada día de la semana, relativo a un martes.
 *
 * El campus no es homogéneo: el lunes y el martes están llenos, el viernes cae
 * porque muchos no tienen clase por la tarde, y el sábado es una mañana corta e
 * intensa. Un generador con demanda plana produciría un análisis de α y Δ
 * calibrado sobre un patrón que no existe.
 */
const PESO_DIA: Record<number, number> = {
  0: 0, // domingo, cerrado
  1: 1.05,
  2: 1.0,
  3: 1.0,
  4: 0.95,
  5: 0.75,
  6: 0.6,
};

/**
 * Adopción creciente.
 *
 * Un piloto no arranca con toda la cohorte: la gente se va sumando. `0` es el
 * día más viejo y `1` es hoy. Sin esta rampa, el indicador de activación daría
 * una línea plana y no se podría distinguir "creció" de "siempre fue así".
 */
function adopcion(progreso: number): number {
  return 0.45 + 0.55 * progreso;
}

/**
 * Cuánto se aparta cada cocina de su t(p) declarado.
 *
 * No es adorno: es lo que hace que la consola de calibración muestre algo
 * verosímil. Una cocina que cumple exactamente el tiempo declarado no existe —
 * las hay un poco más lentas, un poco más rápidas, y esa desviación es
 * justamente lo que el operador de la plataforma tiene que poder detectar.
 *
 * Antes el generador ponía `EN_PREPARACION` unos minutos antes del inicio de la
 * franja, sin mirar el peso del pedido. Eso daba tiempos "reales" de ~15 min
 * para todo, así que un café de 3 minutos aparecía con un factor ×5 y el
 * diagnóstico entero era basura con aspecto de dato.
 */
const SESGO_COCINA: Record<string, number> = {
  "cafeteria-central": 1.08,
  "comedor-el-jaguar": 1.22,
  "cafe-biblioteca": 0.94,
};

const ENTRE_SEMANA = [1, 2, 3, 4, 5];
const SABADO = [6];

const VENTANAS_ESTANDAR: Ventana[] = [
  { desde: [9, 0], hasta: [10, 0], peso: 2, dias: ENTRE_SEMANA },
  { desde: [11, 30], hasta: [13, 0], peso: 5, dias: ENTRE_SEMANA },
  { desde: [14, 30], hasta: [15, 15], peso: 2, dias: ENTRE_SEMANA },
  { desde: [18, 0], hasta: [19, 0], peso: 3, dias: ENTRE_SEMANA },
  // El sábado por la mañana hay bastante presencia y una sola ventana.
  { desde: [9, 0], hasta: [10, 30], peso: 4, dias: SABADO },
];

const COMERCIOS = [
  {
    nombre: "Cafetería Central",
    slug: "cafeteria-central",
    ubicacion: "Edificio A · planta baja",
    personalCocina: 2,
    anchoFranjaMin: 10,
    factorSeguridad: "0.85",
    ventanas: VENTANAS_ESTANDAR,
    productos: [
      { nombre: "Almuerzo del día", desc: "Carne, arroz, ensalada y maduro.", precio: "150.00", t: 12, img: foto("photo-1546069901-ba9599a7e63c") },
      { nombre: "Pizza personal", desc: "Masa fina, queso y salsa de la casa.", precio: "120.00", t: 10, img: foto("photo-1513104890138-7c749659a591") },
      { nombre: "Baho", desc: "Plato del viernes, por encargo.", precio: "180.00", t: 15, img: null },
      { nombre: "Quesillo", desc: "Tortilla, queso, cebolla y crema.", precio: "60.00", t: 5, img: foto("photo-1565299624946-b28f40a0ae38") },
      { nombre: "Café con leche", desc: "Café de Matagalpa, servido caliente.", precio: "45.00", t: 3, img: foto("photo-1509042239860-f550ce710b93") },
      { nombre: "Gaseosa", desc: null, precio: "35.00", t: 0, img: foto("photo-1622483767028-3f66f32aef97") },
      { nombre: "Chicle", desc: null, precio: "5.00", t: 0, img: null },
    ],
  },
  {
    nombre: "Comedor El Jaguar",
    slug: "comedor-el-jaguar",
    ubicacion: "Edificio C · frente a la cancha",
    // Cocina más grande y franjas más anchas: sirve para comparar el efecto de Δ.
    personalCocina: 3,
    anchoFranjaMin: 15,
    factorSeguridad: "0.80",
    // Comedor: no abre de noche.
    ventanas: VENTANAS_ESTANDAR.filter((v) => v.desde[0] !== 18),
    productos: [
      { nombre: "Nacatamal", desc: "Solo jueves y viernes.", precio: "90.00", t: 8, img: foto("photo-1504674900247-0877df9cc836") },
      { nombre: "Gallo pinto con huevo", desc: "Con crema y tortilla.", precio: "80.00", t: 7, img: foto("photo-1525351484163-7529414344d8") },
      { nombre: "Pollo asado", desc: "Cuarto de pollo con ensalada.", precio: "165.00", t: 14, img: foto("photo-1598103442097-8b74394b95c6") },
      { nombre: "Sopa de res", desc: "Con verduras y tortilla.", precio: "140.00", t: 11, img: foto("photo-1547592166-23ac45744acd") },
      { nombre: "Refresco natural", desc: "Cacao, tamarindo o calala.", precio: "30.00", t: 2, img: foto("photo-1621263764928-df1444c5e859") },
    ],
  },
  {
    nombre: "Café de la Biblioteca",
    slug: "cafe-biblioteca",
    ubicacion: "Biblioteca · primer piso",
    // Una sola persona y franjas cortas: el caso apretado.
    personalCocina: 1,
    anchoFranjaMin: 10,
    factorSeguridad: "0.90",
    // La biblioteca sigue el horario de estudio: mañana, tarde y noche.
    ventanas: VENTANAS_ESTANDAR.filter((v) => v.desde[0] !== 11),
    productos: [
      { nombre: "Sándwich de pollo", desc: "Pan artesanal y vegetales.", precio: "110.00", t: 6, img: foto("photo-1528735602780-2552fd46c7af") },
      { nombre: "Baguette caprese", desc: "Tomate, albahaca y mozzarella.", precio: "125.00", t: 7, img: foto("photo-1509722747041-616f39b57569") },
      { nombre: "Brownie", desc: "Con nueces.", precio: "55.00", t: 4, img: foto("photo-1606313564200-e75d5e30476c") },
      { nombre: "Capuchino", desc: "Doble espresso.", precio: "60.00", t: 4, img: foto("photo-1572442388796-11668a67e53d") },
      { nombre: "Agua", desc: null, precio: "20.00", t: 0, img: null },
    ],
  },
] as const;

const FACULTADES = [
  { facultad: "Ingeniería y Arquitectura", carreras: ["Ingeniería en Sistemas", "Arquitectura", "Ingeniería Industrial"] },
  { facultad: "Ciencias Económicas", carreras: ["Administración de Empresas", "Mercadotecnia", "Banca y Finanzas"] },
  { facultad: "Ciencias Jurídicas", carreras: ["Derecho"] },
  { facultad: "Ciencias Médicas", carreras: ["Medicina", "Nutrición"] },
] as const;

const CANALES = ["qr_mostrador", "qr_pasillo", "whatsapp", "aula"] as const;
const FRECUENCIAS = ["diaria", "3-4 por semana", "1-2 por semana", "ocasional"] as const;

/**
 * Preferencia de hora: campana centrada en el pico del receso. Es el fenómeno
 * que el sistema administra, así que el generador tiene que reproducirlo.
 */
function franjaPreferida(total: number): number {
  const centro = total * 0.35;
  let suma = 0;
  for (let i = 0; i < 3; i++) suma += aleatorio();
  const desvio = (suma / 3 - 0.5) * total * 0.55;
  return Math.max(0, Math.min(total - 1, Math.round(centro + desvio)));
}

async function main() {
  console.log("Limpiando datos anteriores…");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE evento_pedido, item_pedido, notificacion, pedido, franja,
                   producto, sesion, token_acceso, auditoria_admin,
                   contador_limite, usuario, comercio RESTART IDENTITY CASCADE
  `);

  // --- Comercios, productos y franjas ------------------------------------
  const comercios = [];
  for (const c of COMERCIOS) {
    const comercio = await prisma.comercio.create({
      data: {
        nombre: c.nombre,
        slug: c.slug,
        ubicacion: c.ubicacion,
        personalCocina: c.personalCocina,
        anchoFranjaMin: c.anchoFranjaMin,
        factorSeguridad: c.factorSeguridad,
        tiempoMinAnticipable: 3,
        margenCutoffMin: 2,
        minutosNoShow: 20,
        maxPedidosActivos: 2,
      },
    });

    for (const p of c.productos) {
      await prisma.producto.create({
        data: {
          comercioId: comercio.id,
          nombre: p.nombre,
          descripcion: p.desc,
          imagenUrl: p.img,
          precio: p.precio,
          tiempoPreparacionMin: p.t,
          anticipable: p.t >= 3,
        },
      });
    }

    // Historia hacia atrás y disponibilidad hacia adelante, con TODAS las
    // ventanas de cada día. El domingo no abre nadie.
    const franjas = [];
    for (let dia = -DIAS_HISTORIA; dia <= 6; dia++) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() + dia);
      const diaSemana = fecha.getDay();

      for (const v of c.ventanas) {
        if (!v.dias.includes(diaSemana)) continue;
        const inicio = new Date(fecha);
        inicio.setHours(v.desde[0], v.desde[1], 0, 0);
        const fin = new Date(fecha);
        fin.setHours(v.hasta[0], v.hasta[1], 0, 0);
        franjas.push(
          ...generarFranjas({
            inicio,
            fin,
            anchoMin: comercio.anchoFranjaMin,
            personalCocina: comercio.personalCocina,
          }),
        );
      }
    }
    await prisma.franja.createMany({
      data: franjas.map((f) => ({ comercioId: comercio.id, ...f })),
    });

    comercios.push(comercio);
    console.log(`  ${c.nombre}: ${c.productos.length} productos, ${franjas.length} franjas`);
  }

  // --- Cuentas de operación ----------------------------------------------
  // Sin contraseña acá: las crea `npm run cuenta`, que es el único camino.
  console.log("Usuarios…");

  // --- Cohorte de estudiantes --------------------------------------------
  const usuarios = [];
  for (let i = 0; i < 140; i++) {
    const f = elegir(FACULTADES);
    /*
     * El registro se reparte por todo el mes, con más gente al principio.
     *
     * Antes todos se habían registrado en los últimos nueve días, así que el
     * indicador de activación —distancia entre registrarse y hacer el primer
     * pedido— salía comprimido y no mostraba la cola de quienes tardan.
     */
    const registro = new Date();
    registro.setDate(
      registro.getDate() -
        Math.round(DIAS_HISTORIA * Math.pow(aleatorio(), 0.6)),
    );
    registro.setHours(entre(8, 18), entre(0, 59), 0, 0);

    usuarios.push(
      await prisma.usuario.create({
        data: {
          correo: `estudiante${String(i + 1).padStart(3, "0")}@uam.edu.ni`,
          condicionExperimental: i % 2 === 0 ? "A" : "B",
          facultad: f.facultad,
          carrera: elegir(f.carreras),
          anio: entre(1, 5),
          frecuenciaCompraPrevia: elegir(FRECUENCIAS),
          consentimiento: true,
          canalCaptacion: elegir(CANALES),
          creadoEn: registro,
        },
      }),
    );
  }
  console.log(`  ${usuarios.length} estudiantes (70 en A, 70 en B)`);

  // --- Pedidos históricos -------------------------------------------------
  console.log("Pedidos históricos…");
  const ahora = new Date();
  let creados = 0;

  for (const comercio of comercios) {
    const productos = await prisma.producto.findMany({
      where: { comercioId: comercio.id, anticipable: true },
    });
    const alfa = Number(comercio.factorSeguridad);

    for (let dia = -DIAS_HISTORIA; dia <= -1; dia++) {
      const desde = new Date();
      desde.setDate(desde.getDate() + dia);
      desde.setHours(0, 0, 0, 0);
      const hasta = new Date(desde);
      hasta.setDate(hasta.getDate() + 1);

      const todas = await prisma.franja.findMany({
        where: { comercioId: comercio.id, inicio: { gte: desde, lt: hasta } },
        orderBy: { inicio: "asc" },
      });
      if (todas.length === 0) continue;

      // Las franjas del día se agrupan por ventana: la campana de preferencia
      // tiene que centrarse dentro de CADA ventana, no a lo largo del día
      // entero. Si no, el pico caería a media tarde por promediar mañana y
      // noche, que es un patrón que no existe.
      const ventanas: (typeof todas)[] = [];
      for (const f of todas) {
        const ultima = ventanas.at(-1);
        const anterior = ultima?.at(-1);
        // Un hueco mayor al ancho de franja marca el corte entre ventanas.
        if (
          !ultima ||
          !anterior ||
          f.inicio.getTime() - anterior.fin.getTime() > comercio.anchoFranjaMin * 60_000
        ) {
          ventanas.push([f]);
        } else {
          ultima.push(f);
        }
      }

      // La carga se acumula en memoria y se escribe una vez: así el generador
      // respeta el mismo invariante que el motor real.
      const carga = new Map<string, number>(todas.map((f) => [f.id, 0]));
      /*
       * Demanda del día: base × día de la semana × adopción × ruido.
       *
       * Las tres capas hacen falta. Sin el peso del día, el lunes y el viernes
       * se ven iguales; sin la rampa, el piloto parece haber nacido maduro; y
       * sin ruido, la serie queda tan prolija que se nota generada.
       */
      const progreso = (dia + DIAS_HISTORIA) / DIAS_HISTORIA;
      const factorDia = PESO_DIA[desde.getDay()] ?? 1;
      if (factorDia === 0) continue;
      const pedidosDia = Math.max(
        4,
        Math.round(34 * factorDia * adopcion(progreso) * (0.85 + aleatorio() * 0.3)),
      );

      for (let n = 0; n < pedidosDia; n++) {
        const usuario = elegir(usuarios);
        const lineas = [];
        const cuantos = ocurre(0.25) ? 2 : 1;
        for (let k = 0; k < cuantos; k++) {
          const p = elegir(productos);
          lineas.push({ producto: p, cantidad: ocurre(0.15) ? 2 : 1 });
        }
        const w = lineas.reduce(
          (a, l) => a + l.producto.tiempoPreparacionMin * l.cantidad,
          0,
        );

        // Se elige primero la VENTANA (mañana, almuerzo, tarde o noche) y
        // después la franja dentro de ella, con la campana centrada en su
        // propio pico.
        const ventana = elegir(ventanas);
        const franjas = ventana;
        const preferida = ventana[franjaPreferida(ventana.length)];

        // Franjas donde el pedido cabe, bajo el mismo criterio del motor.
        const cabe = (f: (typeof franjas)[number]) =>
          (carga.get(f.id) ?? 0) + w <= f.capacidadMinutos * alfa;
        const disponibles = franjas.filter(cabe);
        if (disponibles.length === 0) continue;

        // ACÁ está la diferencia entre condiciones: A insiste con su hora
        // preferida; B acepta la sugerencia del sistema, que es la franja con
        // más holgura. Es lo que el piloto real va a medir.
        let destino;
        if (usuario.condicionExperimental === "B") {
          const sugerida = disponibles.reduce((mejor, f) =>
            (carga.get(f.id) ?? 0) / f.capacidadMinutos <
            (carga.get(mejor.id) ?? 0) / mejor.capacidadMinutos
              ? f
              : mejor,
          );
          // No todos aceptan la sugerencia: el 25% igual elige lo que quería.
          destino = ocurre(0.75)
            ? sugerida
            : (cabe(preferida) ? preferida : sugerida);
        } else {
          destino = cabe(preferida)
            ? preferida
            : disponibles.find((f) => f.inicio > preferida.inicio) ??
              disponibles[0];
        }

        carga.set(destino.id, (carga.get(destino.id) ?? 0) + w);

        const creadoEn = new Date(
          destino.inicio.getTime() - entre(20, 240) * 60_000,
        );
        const total = lineas.reduce(
          (a, l) => a + Number(l.producto.precio) * l.cantidad,
          0,
        );

        // Desenlace. El 6% no se presenta y el 4% cancela: números plausibles
        // que el piloto real va a medir, no cero por comodidad.
        const noShow = ocurre(0.06);
        const cancelado = !noShow && ocurre(0.04);
        // El comercio incumple ~1 de cada 12: sin incumplimientos, el
        // indicador 2 daría 100% y no probaría nada.
        const incumple = !cancelado && ocurre(0.08);

        /*
         * Cuánto tardó la cocina DE VERDAD.
         *
         * Sale del peso del pedido, no de la franja: es lo que hace que el
         * `t(p)` declarado y el observado guarden una relación creíble, y que
         * la consola de calibración sirva para algo. El sesgo es del comercio;
         * el ruido, del día.
         */
        const realMin = Math.max(
          1,
          w * (SESGO_COCINA[comercio.slug] ?? 1) * (0.85 + aleatorio() * 0.35),
        );

        const listoEn = cancelado
          ? null
          : new Date(
              destino.fin.getTime() +
                (incumple ? entre(2, 9) : -entre(1, 6)) * 60_000,
            );

        // La cocina empezó `realMin` antes de terminar. Así el par
        // (EN_PREPARACION → LISTO) mide el trabajo real y no el ancho de la
        // franja, que es lo que medía antes.
        const inicioCocina = listoEn
          ? new Date(listoEn.getTime() - realMin * 60_000)
          : null;
        const retiradoEn =
          !cancelado && !noShow && listoEn
            ? new Date(listoEn.getTime() + entre(1, 12) * 60_000)
            : null;

        const estado = cancelado
          ? "CANCELADO"
          : noShow
            ? "NO_SHOW"
            : "RETIRADO";
        const cumplimiento = cancelado
          ? "NO_APLICA"
          : incumple
            ? "INCUMPLIDO"
            : "CUMPLIDO";

        const pedido = await prisma.pedido.create({
          data: {
            codigo: codigoDemo(creados),
            idempotencyKey: crypto.randomUUID(),
            usuarioId: usuario.id,
            franjaId: destino.id,
            condicionExperimental: usuario.condicionExperimental,
            franjaSolicitadaId: preferida.id,
            motivoAsignacion:
              destino.id === preferida.id
                ? "SOLICITADA_POR_USUARIO"
                : "SUGERIDA_ACEPTADA",
            cargaEstimadaMin: w,
            estado,
            cumplimiento,
            total: total.toFixed(2),
            creadoEn,
            listoEn,
            retiradoEn,
            canceladoEn: cancelado ? new Date(creadoEn.getTime() + 6e5) : null,
            capacidadLiberada: cancelado,
            canalCaptacion: usuario.canalCaptacion,
            items: {
              create: lineas.map((l) => ({
                productoId: l.producto.id,
                cantidad: l.cantidad,
                nombreProducto: l.producto.nombre,
                precioUnitario: Number(l.producto.precio).toFixed(2),
                tiempoPreparacionMin: l.producto.tiempoPreparacionMin,
                subtotal: (Number(l.producto.precio) * l.cantidad).toFixed(2),
              })),
            },
          },
        });

        // Línea de tiempo coherente con el desenlace.
        const eventos: { estado: EstadoPedido; timestamp: Date }[] = [
          { estado: "RECIBIDO", timestamp: creadoEn },
        ];
        if (!cancelado) {
          eventos.push({
            estado: "EN_PREPARACION",
            timestamp: inicioCocina ?? creadoEn,
          });
          if (listoEn) eventos.push({ estado: "LISTO", timestamp: listoEn });
          if (retiradoEn) eventos.push({ estado: "RETIRADO", timestamp: retiradoEn });
          if (noShow) {
            eventos.push({
              estado: "NO_SHOW",
              timestamp: new Date(listoEn!.getTime() + 21 * 60_000),
            });
          }
        } else {
          eventos.push({
            estado: "CANCELADO",
            timestamp: new Date(creadoEn.getTime() + 6e5),
          });
        }
        await prisma.eventoPedido.createMany({
          data: eventos.map((e) => ({ ...e, pedidoId: pedido.id })),
        });

        // La carga cancelada se devolvió: no debe quedar contada en la franja.
        if (cancelado) carga.set(destino.id, (carga.get(destino.id) ?? 0) - w);

        if (!usuario.primerPedidoEn) {
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: { primerPedidoEn: creadoEn },
          });
          usuario.primerPedidoEn = creadoEn;
        }
        creados++;
      }

      // Se escribe la carga final del día en cada franja.
      for (const [franjaId, valor] of carga) {
        if (valor > 0) {
          await prisma.franja.update({
            where: { id: franjaId },
            data: { cargaAsignada: valor },
          });
        }
      }
    }
  }
  console.log(`  ${creados} pedidos históricos`);

  // --- Pedidos vivos, por el motor real -----------------------------------
  console.log("Pedidos de hoy (por el motor de admisión real)…");
  let vivos = 0;
  for (const comercio of comercios) {
    const productos = await prisma.producto.findMany({
      where: { comercioId: comercio.id, anticipable: true },
    });
    const franjas = await prisma.franja.findMany({
      where: { comercioId: comercio.id, fin: { gt: ahora } },
      orderBy: { inicio: "asc" },
      take: 10,
    });
    if (franjas.length === 0) continue;

    for (let n = 0; n < 20; n++) {
      const usuario = elegir(usuarios);
      const producto = elegir(productos);
      const r = await reservar(prisma, {
        usuarioId: usuario.id,
        comercioId: comercio.id,
        franjaSolicitadaId:
          franjas[franjaPreferida(Math.min(8, franjas.length))].id,
        items: [{ productoId: producto.id, cantidad: 1 }],
        idempotencyKey: crypto.randomUUID(),
        canalCaptacion: usuario.canalCaptacion,
      });
      if (!r.admitido) continue;
      vivos++;

      // Algunos ya arrancaron en la cocina, para que el tablero tenga las tres
      // columnas pobladas y se pueda evaluar de un vistazo.
      if (ocurre(0.45)) {
        await cambiarEstado(prisma, {
          pedidoId: r.pedidoId,
          hacia: "EN_PREPARACION",
          actor: "COMERCIO",
        });
        if (ocurre(0.5)) {
          await cambiarEstado(prisma, {
            pedidoId: r.pedidoId,
            hacia: "LISTO",
            actor: "COMERCIO",
          });
        }
      }
    }
  }
  console.log(`  ${vivos} pedidos vivos`);

  // Las notificaciones que generaron los pedidos de hoy se marcan como
  // enviadas: son de estudiantes inventados y no hay que escribirles. Sin
  // esto, el primer barrido del cron dispara correos a direcciones que no
  // existen, y los rebotes castigan la reputación de la cuenta remitente.
  const omitidas = await prisma.notificacion.updateMany({
    where: { estado: "PENDIENTE" },
    data: { estado: "ENVIADA", enviadaEn: new Date(), ultimoError: "datos de demostración" },
  });
  console.log(`  ${omitidas.count} notificaciones marcadas como enviadas (datos ficticios)`);

  const totales = {
    comercios: await prisma.comercio.count(),
    usuarios: await prisma.usuario.count(),
    pedidos: await prisma.pedido.count(),
  };
  console.log("");
  console.log(
    `Listo: ${totales.comercios} comercios, ${totales.usuarios} usuarios, ${totales.pedidos} pedidos.`,
  );
  console.log("Creá tus cuentas de operación con:  npm run cuenta -- --correo=… --rol=…");
}

/** Código legible y DISTINGUIBLE: ver `codigoDistinguible` en el cliente. */
function codigoDemo(n: number): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const a = abc[n % abc.length];
  const b = abc[Math.floor(n / abc.length) % abc.length];
  return `${a}${b}-${String(100 + (n % 900)).padStart(3, "0")}`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
