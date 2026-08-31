/**
 * Informe de ventas del comercio. El panel del administrador mide el
 * EXPERIMENTO; esto mide el NEGOCIO: cuánto vendió, a qué hora se llena la
 * cocina y qué le piden.
 *
 * Puro: entra una lista de pedidos, sale el informe.
 *
 * **Solo cuenta como venta un pedido RETIRADO.** Uno listo que nadie buscó es
 * comida perdida, no plata en la caja; si el número no coincide con lo que hay
 * al cerrar, el comercio deja de creerle al informe entero.
 */

export interface PedidoInforme {
  estado: string;
  cumplimiento: string;
  /** Total del pedido, en la moneda del comercio. */
  total: number;
  /** Minutos-cocina que este pedido comprometió. */
  cargaMin: number;
  /** Inicio de la franja de retiro, ya en zona local del comercio. */
  hora: string;
  items: { nombre: string; cantidad: number; subtotal: number }[];
}

export interface FranjaInforme {
  /** Etiqueta de la hora, ya en zona local. */
  hora: string;
  capacidadMinutos: number;
  cargaAsignada: number;
}

const RETIRADO = "RETIRADO";
const NO_SHOW = "NO_SHOW";
const CANCELADO = "CANCELADO";

export interface Cifras {
  /** Pedidos que llegaron a manos del cliente. */
  vendidos: number;
  /** Suma cobrada. Solo de los retirados. */
  ventas: number;
  /** Ventas / vendidos. `null` si no hubo ninguno: dividir por cero miente. */
  ticketPromedio: number | null;
  /** Pedidos que la cocina preparó y nadie retiró. */
  noShows: number;
  cancelados: number;
  /** Cumplidos / (cumplidos + incumplidos). `null` sin datos suficientes. */
  cumplimiento: number | null;
  /** Minutos-cocina efectivamente producidos. */
  minutosCocinados: number;
}

export function calcularCifras(pedidos: PedidoInforme[]): Cifras {
  const retirados = pedidos.filter((p) => p.estado === RETIRADO);
  const ventas = retirados.reduce((n, p) => n + p.total, 0);

  const cumplidos = pedidos.filter((p) => p.cumplimiento === "CUMPLIDO").length;
  const incumplidos = pedidos.filter(
    (p) => p.cumplimiento === "INCUMPLIDO",
  ).length;
  const juzgados = cumplidos + incumplidos;

  return {
    vendidos: retirados.length,
    ventas,
    ticketPromedio: retirados.length > 0 ? ventas / retirados.length : null,
    noShows: pedidos.filter((p) => p.estado === NO_SHOW).length,
    cancelados: pedidos.filter((p) => p.estado === CANCELADO).length,
    cumplimiento: juzgados > 0 ? cumplidos / juzgados : null,
    minutosCocinados: retirados.reduce((n, p) => n + p.cargaMin, 0),
  };
}

export interface PuntoHora {
  hora: string;
  pedidos: number;
  ventas: number;
}

/**
 * Ventas por hora del día.
 *
 * Es el dato más accionable del informe: dice a qué hora hay que tener gente en
 * la cocina. Se agrupa por la hora de RETIRO y no por la de creación, porque el
 * trabajo ocurre cuando hay que entregar, no cuando alguien pidió desde el
 * pasillo tres horas antes.
 */
export function ventasPorHora(pedidos: PedidoInforme[]): PuntoHora[] {
  const mapa = new Map<string, PuntoHora>();

  for (const p of pedidos) {
    if (p.estado !== RETIRADO) continue;
    const punto = mapa.get(p.hora) ?? { hora: p.hora, pedidos: 0, ventas: 0 };
    punto.pedidos += 1;
    punto.ventas += p.total;
    mapa.set(p.hora, punto);
  }

  return [...mapa.values()].sort((a, b) => a.hora.localeCompare(b.hora));
}

export interface ProductoVendido {
  nombre: string;
  unidades: number;
  ventas: number;
}

/**
 * Qué se vende, por unidades y por plata.
 *
 * Las dos columnas porque no dicen lo mismo: el café puede ser lo más pedido y
 * el almuerzo lo que sostiene el mes. Ordenar solo por unidades escondería eso.
 */
export function productosVendidos(
  pedidos: PedidoInforme[],
  tope = 8,
): ProductoVendido[] {
  const mapa = new Map<string, ProductoVendido>();

  for (const p of pedidos) {
    if (p.estado !== RETIRADO) continue;
    for (const i of p.items) {
      const fila = mapa.get(i.nombre) ?? {
        nombre: i.nombre,
        unidades: 0,
        ventas: 0,
      };
      fila.unidades += i.cantidad;
      fila.ventas += i.subtotal;
      mapa.set(i.nombre, fila);
    }
  }

  return [...mapa.values()]
    .sort((a, b) => b.ventas - a.ventas || b.unidades - a.unidades)
    .slice(0, tope);
}

export interface Ocupacion {
  /** Promedio de carga/capacidad sobre las franjas que se usaron. */
  promedio: number | null;
  /** La franja más llena del período. */
  pico: { hora: string; ocupacion: number } | null;
  /** Franjas que quedaron completamente vacías. */
  vacias: number;
}

/**
 * Cuán llena corrió la cocina.
 *
 * Le dice al comercio dos cosas que no puede ver de otra forma: si está
 * dejando capacidad sin usar —y entonces puede abrir más franjas o promocionar
 * las horas flojas— o si vive al tope y le conviene sumar personal.
 *
 * Se mide contra la capacidad DECLARADA, no contra la efectiva (α · C). El
 * factor de seguridad es una decisión del modelo de admisión; al comercio le
 * sirve saber cuánto de su cocina real usó.
 */
export function calcularOcupacion(franjas: FranjaInforme[]): Ocupacion {
  const utiles = franjas.filter((f) => f.capacidadMinutos > 0);
  if (utiles.length === 0) return { promedio: null, pico: null, vacias: 0 };

  const usadas = utiles.filter((f) => f.cargaAsignada > 0);
  const razones = usadas.map((f) => ({
    hora: f.hora,
    ocupacion: f.cargaAsignada / f.capacidadMinutos,
  }));

  const pico = razones.reduce<{ hora: string; ocupacion: number } | null>(
    (mejor, r) => (!mejor || r.ocupacion > mejor.ocupacion ? r : mejor),
    null,
  );

  return {
    promedio:
      razones.length > 0
        ? razones.reduce((n, r) => n + r.ocupacion, 0) / razones.length
        : null,
    pico,
    vacias: utiles.length - usadas.length,
  };
}
