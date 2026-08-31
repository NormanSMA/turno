/**
 * TURNO — Módulo de admisión (núcleo de ingeniería, §6 del documento maestro).
 *
 * Regla de admisión:
 *     admitir el pedido i en la franja f  ⟺  carga_actual(f) + w(i) ≤ α · C(f)
 *
 * La capacidad se mide en MINUTOS-COCINA, no en cantidad de pedidos: diez cafés
 * no son diez almuerzos (ADR-02). Este archivo es puro — sin base de datos, sin
 * fechas implícitas, sin I/O — para que la regla sea verificable con tests
 * unitarios y reutilizable por el simulador de eventos discretos (§15).
 */

export type CondicionExperimental = "A" | "B";

export interface ProductoCarga {
  id: string;
  tiempoPreparacionMin: number;
  anticipable: boolean;
  disponible: boolean;
}

export interface LineaPedido {
  producto: ProductoCarga;
  cantidad: number;
}

export interface FranjaCapacidad {
  id: string;
  inicio: Date;
  fin: Date;
  capacidadMinutos: number;
  cargaAsignada: number;
  abierta: boolean;
}

export interface ParametrosComercio {
  /** α — factor de seguridad; se calibra empíricamente (§6.2) */
  factorSeguridad: number;
  /** t_mín — umbral de elegibilidad para pedido anticipado (§6.3) */
  tiempoMinAnticipable: number;
}

/** Capacidad efectivamente comprometible de la franja: α · C(f). */
export function capacidadEfectiva(
  franja: Pick<FranjaCapacidad, "capacidadMinutos">,
  alfa: number,
): number {
  return franja.capacidadMinutos * alfa;
}

/** Minutos-cocina libres bajo la regla de admisión. Nunca negativo. */
export function holgura(franja: FranjaCapacidad, alfa: number): number {
  return Math.max(0, capacidadEfectiva(franja, alfa) - franja.cargaAsignada);
}

/**
 * w(i) — costo del pedido en minutos-cocina.
 * Suma lineal: el modelo asume una cocina que no paraleliza dentro de la franja.
 * Es una simplificación declarada; el simulador (§15) permite relajarla.
 */
export function cargaPedido(lineas: LineaPedido[]): number {
  return lineas.reduce(
    (acc, l) => acc + l.producto.tiempoPreparacionMin * l.cantidad,
    0,
  );
}

/**
 * Criterio de elegibilidad (§6.3): t(p) ≥ t_mín.
 * Un producto de preparación casi nula consume espacio de franja y genera una
 * promesa que cumplir sin ahorrarle tiempo al usuario: capacidad sin valor.
 */
export function esElegible(
  producto: ProductoCarga,
  params: ParametrosComercio,
): boolean {
  return (
    producto.anticipable &&
    producto.disponible &&
    producto.tiempoPreparacionMin >= params.tiempoMinAnticipable
  );
}

export type MotivoRechazo =
  | "PEDIDO_VACIO"
  | "CANTIDAD_INVALIDA"
  | "PRODUCTO_NO_ELEGIBLE"
  | "CARGA_EXCEDE_CAPACIDAD_TOTAL";

export interface ValidacionPedido {
  valido: boolean;
  motivo?: MotivoRechazo;
  detalle?: string;
  carga: number;
}

/** Valida el pedido contra el criterio de elegibilidad, antes de mirar franjas. */
export function validarPedido(
  lineas: LineaPedido[],
  params: ParametrosComercio,
): ValidacionPedido {
  if (lineas.length === 0) {
    return { valido: false, motivo: "PEDIDO_VACIO", carga: 0 };
  }
  for (const l of lineas) {
    if (!Number.isInteger(l.cantidad) || l.cantidad < 1) {
      return {
        valido: false,
        motivo: "CANTIDAD_INVALIDA",
        detalle: l.producto.id,
        carga: 0,
      };
    }
    if (!esElegible(l.producto, params)) {
      return {
        valido: false,
        motivo: "PRODUCTO_NO_ELEGIBLE",
        detalle: l.producto.id,
        carga: 0,
      };
    }
  }
  return { valido: true, carga: cargaPedido(lineas) };
}

/** Regla de admisión pura: ¿cabe w en f bajo α? */
export function cabeEnFranja(
  franja: FranjaCapacidad,
  carga: number,
  alfa: number,
): boolean {
  if (!franja.abierta) return false;
  return franja.cargaAsignada + carga <= capacidadEfectiva(franja, alfa);
}

/** Ocupación relativa [0,1+] respecto de la capacidad efectiva, tras admitir `carga`. */
export function ocupacionProyectada(
  franja: FranjaCapacidad,
  carga: number,
  alfa: number,
): number {
  const efectiva = capacidadEfectiva(franja, alfa);
  if (efectiva <= 0) return Number.POSITIVE_INFINITY;
  return (franja.cargaAsignada + carga) / efectiva;
}

export interface OpcionFranja {
  franjaId: string;
  inicio: Date;
  fin: Date;
  holguraMin: number;
  ocupacionProyectada: number;
  sugerida: boolean;
}

export interface OpcionesAdmision {
  /** Franjas con espacio, en orden cronológico. */
  opciones: OpcionFranja[];
  /** Franja destacada. En A es la solicitada (si cabe); en B, la que aplana la carga. */
  sugeridaId: string | null;
  /** true si la franja que pidió el usuario admite el pedido. */
  solicitadaDisponible: boolean;
}

/**
 * Calcula las franjas ofrecidas y cuál se destaca — la variable experimental (§6.4).
 *
 *  - Condición A (elección libre): se destaca la franja solicitada si cabe; si no,
 *    la primera cronológicamente con espacio. El sistema no orienta la elección.
 *  - Condición B (sugerencia activa): se destaca la franja con MENOR ocupación
 *    proyectada, es decir la que mejor aplana el pico. Las demás siguen
 *    disponibles: B sugiere, no obliga.
 *
 * Hipótesis: B reduce la relación pico/promedio de carga por franja sin degradar
 * la satisfacción del usuario.
 */
export function calcularOpciones(
  franjas: FranjaCapacidad[],
  carga: number,
  alfa: number,
  condicion: CondicionExperimental,
  franjaSolicitadaId?: string | null,
  maxOpciones = 6,
): OpcionesAdmision {
  const candidatas = franjas
    .filter((f) => cabeEnFranja(f, carga, alfa))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const solicitadaDisponible =
    !!franjaSolicitadaId && candidatas.some((f) => f.id === franjaSolicitadaId);

  let sugeridaId: string | null = null;
  if (candidatas.length > 0) {
    if (condicion === "B") {
      // Menor ocupación proyectada; empate → la más temprana (ya viene ordenado).
      sugeridaId = candidatas.reduce((mejor, f) =>
        ocupacionProyectada(f, carga, alfa) <
        ocupacionProyectada(mejor, carga, alfa)
          ? f
          : mejor,
      ).id;
    } else {
      sugeridaId = solicitadaDisponible
        ? franjaSolicitadaId!
        : candidatas[0].id;
    }
  }

  const opciones = candidatas.slice(0, maxOpciones).map((f) => ({
    franjaId: f.id,
    inicio: f.inicio,
    fin: f.fin,
    holguraMin: holgura(f, alfa),
    ocupacionProyectada: ocupacionProyectada(f, carga, alfa),
    sugerida: f.id === sugeridaId,
  }));

  // La sugerida siempre debe ser visible aunque quede fuera del corte.
  if (sugeridaId && !opciones.some((o) => o.franjaId === sugeridaId)) {
    const f = candidatas.find((c) => c.id === sugeridaId)!;
    opciones.push({
      franjaId: f.id,
      inicio: f.inicio,
      fin: f.fin,
      holguraMin: holgura(f, alfa),
      ocupacionProyectada: ocupacionProyectada(f, carga, alfa),
      sugerida: true,
    });
  }

  return { opciones, sugeridaId, solicitadaDisponible };
}

/**
 * Relación pico/promedio de carga por franja — indicador 3 (§14.5).
 * Es la métrica que compara la condición A contra la B.
 */
export function relacionPicoPromedio(cargas: number[]): number {
  if (cargas.length === 0) return 0;
  const suma = cargas.reduce((a, b) => a + b, 0);
  if (suma === 0) return 0;
  const promedio = suma / cargas.length;
  return Math.max(...cargas) / promedio;
}

/**
 * Regla de cierre de pedidos (cut-off).
 *
 * Un pedido cuyo producto más lento tarda 10 minutos, hecho a las 11:59 para la
 * franja 12:00–12:10, es una promesa imposible: la cocina no puede empezar antes
 * de recibirlo. El cut-off deriva del modelo, no es una función agregada:
 *
 *     ahora + t_max(pedido) + margen ≤ fin de la franja
 *
 * Se compara contra el FIN de la franja, no contra el inicio: la promesa de
 * TURNO es "listo al terminar tu franja". Usar el inicio rechazaría pedidos
 * perfectamente cumplibles y desperdiciaría capacidad.
 */
export function tiempoPreparacionMaximo(lineas: LineaPedido[]): number {
  return lineas.reduce(
    (max, l) => Math.max(max, l.producto.tiempoPreparacionMin),
    0,
  );
}

export function pasoCutoff(args: {
  ahora: Date;
  franja: Pick<FranjaCapacidad, "fin">;
  tiempoPreparacionMaxMin: number;
  margenMin: number;
}): boolean {
  const { ahora, franja, tiempoPreparacionMaxMin, margenMin } = args;
  const listoProyectado =
    ahora.getTime() + (tiempoPreparacionMaxMin + margenMin) * 60_000;
  return listoProyectado > franja.fin.getTime();
}

/**
 * Versión de `calcularOpciones` consciente del reloj: descarta además las
 * franjas que ya no son alcanzables. Es la que usa la reserva real; la variante
 * sin reloj se conserva para el simulador (§15), donde el tiempo es sintético.
 */
export function calcularOpcionesConCutoff(
  franjas: FranjaCapacidad[],
  lineas: LineaPedido[],
  carga: number,
  alfa: number,
  condicion: CondicionExperimental,
  ahora: Date,
  margenMin: number,
  franjaSolicitadaId?: string | null,
  maxOpciones = 6,
): OpcionesAdmision {
  const tMax = tiempoPreparacionMaximo(lineas);
  const alcanzables = franjas.filter(
    (f) =>
      !pasoCutoff({
        ahora,
        franja: f,
        tiempoPreparacionMaxMin: tMax,
        margenMin,
      }),
  );
  return calcularOpciones(
    alcanzables,
    carga,
    alfa,
    condicion,
    franjaSolicitadaId,
    maxOpciones,
  );
}
