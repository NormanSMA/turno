/**
 * TURNO — Reglas de administración del comercio.
 *
 * Puras y sin base de datos, por la misma razón que el resto de `core`: son las
 * que impiden que el operador rompa desde el panel el invariante que la reserva
 * defiende con una transacción.
 *
 * El caso que motiva este módulo: bajar la capacidad de una franja que ya tiene
 * pedidos admitidos. Nada en la reserva lo impide —la reserva mira hacia
 * adelante— y sin embargo deja el sistema en un estado que la reserva declara
 * imposible: `cargaAsignada > α · C(f)`. Los pedidos ya prometidos no caben en
 * la cocina que el comercio acaba de declarar. El sistema tiene que decir que no.
 */

export interface ParametrosComercioEditables {
  personalCocina: number;
  anchoFranjaMin: number;
  factorSeguridad: number;
  tiempoMinAnticipable: number;
  margenCutoffMin: number;
  minutosNoShow: number;
  maxPedidosActivos: number;
  estadoOperacion: "ABIERTO" | "PAUSADO" | "CERRADO";
}

export interface Violacion {
  campo: string;
  motivo: string;
}

export interface Resultado {
  valido: boolean;
  violaciones: Violacion[];
}

function ok(): Resultado {
  return { valido: true, violaciones: [] };
}

function no(...violaciones: Violacion[]): Resultado {
  return { valido: false, violaciones };
}

/** Rangos de los parámetros del comercio. Cotas de cordura, no de gusto. */
export function validarParametros(
  p: Partial<ParametrosComercioEditables>,
): Resultado {
  const v: Violacion[] = [];

  if (p.personalCocina !== undefined && (p.personalCocina < 1 || p.personalCocina > 20)) {
    v.push({ campo: "personalCocina", motivo: "Entre 1 y 20 personas" });
  }
  if (p.anchoFranjaMin !== undefined && (p.anchoFranjaMin < 5 || p.anchoFranjaMin > 60)) {
    // Δ menor a 5 min haría promesas que ni un reloj bien puesto puede cumplir;
    // mayor a 60 deja de ser una franja y pasa a ser "en algún momento".
    v.push({ campo: "anchoFranjaMin", motivo: "Δ debe estar entre 5 y 60 minutos" });
  }
  if (
    p.factorSeguridad !== undefined &&
    (p.factorSeguridad < 0.3 || p.factorSeguridad > 1)
  ) {
    // α > 1 prometería más capacidad de la que la cocina tiene. α < 0.3
    // desperdicia tanto que el comercio pierde ventas sin ganar cumplimiento.
    v.push({ campo: "factorSeguridad", motivo: "α debe estar entre 0,30 y 1,00" });
  }
  if (
    p.tiempoMinAnticipable !== undefined &&
    (p.tiempoMinAnticipable < 0 || p.tiempoMinAnticipable > 30)
  ) {
    v.push({ campo: "tiempoMinAnticipable", motivo: "t_mín entre 0 y 30 minutos" });
  }
  if (p.margenCutoffMin !== undefined && (p.margenCutoffMin < 0 || p.margenCutoffMin > 30)) {
    v.push({ campo: "margenCutoffMin", motivo: "El margen va de 0 a 30 minutos" });
  }
  if (p.minutosNoShow !== undefined && (p.minutosNoShow < 5 || p.minutosNoShow > 120)) {
    v.push({ campo: "minutosNoShow", motivo: "Entre 5 y 120 minutos" });
  }
  if (
    p.maxPedidosActivos !== undefined &&
    (p.maxPedidosActivos < 1 || p.maxPedidosActivos > 20)
  ) {
    v.push({ campo: "maxPedidosActivos", motivo: "Entre 1 y 20 pedidos activos" });
  }

  return v.length === 0 ? ok() : { valido: false, violaciones: v };
}

export interface FranjaConCarga {
  id: string;
  inicio: Date;
  capacidadMinutos: number;
  cargaAsignada: number;
}

/**
 * ¿Se puede bajar α sin dejar franjas sobrevendidas?
 *
 * Bajar α reduce la capacidad comprometible de TODAS las franjas abiertas de
 * golpe. Si alguna ya tiene más carga que la nueva capacidad efectiva, esos
 * pedidos quedan prometidos sobre una cocina que ya no los admite. Se devuelven
 * las franjas afectadas para que el operador vea exactamente cuáles y decida:
 * esperar a que pasen, o cancelar pedidos a mano.
 *
 * Las franjas ya vencidas no cuentan: su carga es historia, no una promesa viva.
 */
export function franjasQueRomperia(
  franjas: FranjaConCarga[],
  nuevoAlfa: number,
  ahora: Date,
): FranjaConCarga[] {
  return franjas.filter(
    (f) => f.inicio > ahora && f.cargaAsignada > f.capacidadMinutos * nuevoAlfa,
  );
}

/**
 * ¿Se puede cambiar la capacidad de una franja concreta?
 *
 * Subirla siempre se puede. Bajarla, solo hasta la carga ya comprometida: por
 * debajo de eso el sistema estaría prometiendo lo que no puede cumplir.
 */
export function validarCapacidadFranja(
  franja: FranjaConCarga,
  nuevaCapacidad: number,
  alfa: number,
): Resultado {
  if (nuevaCapacidad < 0) {
    return no({ campo: "capacidadMinutos", motivo: "No puede ser negativa" });
  }
  if (nuevaCapacidad > 600) {
    return no({ campo: "capacidadMinutos", motivo: "Máximo 600 minutos-cocina" });
  }
  const efectiva = nuevaCapacidad * alfa;
  if (franja.cargaAsignada > efectiva) {
    return no({
      campo: "capacidadMinutos",
      motivo:
        `Esta franja ya tiene ${franja.cargaAsignada} minutos comprometidos. ` +
        `Con esa capacidad solo entrarían ${Math.floor(efectiva)}.`,
    });
  }
  return ok();
}

/**
 * ¿Se puede cerrar una franja?
 *
 * Cerrar solo impide pedidos NUEVOS: los ya admitidos siguen en pie y hay que
 * prepararlos. Cerrar una franja con pedidos vivos es una decisión legítima —el
 * comercio se quedó sin gas— pero el operador tiene que saber a cuántas personas
 * afecta antes de hacerlo, no después.
 */
export function avisoAlCerrarFranja(pedidosVivos: number): string | null {
  if (pedidosVivos === 0) return null;
  return (
    `Esta franja tiene ${pedidosVivos} pedido${pedidosVivos === 1 ? "" : "s"} ya ` +
    `comprometido${pedidosVivos === 1 ? "" : "s"}. Cerrarla impide pedidos nuevos, ` +
    `pero esos hay que prepararlos igual.`
  );
}

export interface DatosProducto {
  nombre: string;
  precio: number;
  tiempoPreparacionMin: number;
}

export function validarProducto(p: Partial<DatosProducto>): Resultado {
  const v: Violacion[] = [];

  if (p.nombre !== undefined) {
    const n = p.nombre.trim();
    if (n.length < 2) v.push({ campo: "nombre", motivo: "Al menos 2 caracteres" });
    if (n.length > 80) v.push({ campo: "nombre", motivo: "Máximo 80 caracteres" });
  }
  if (p.precio !== undefined && (p.precio < 0 || p.precio > 100000)) {
    v.push({ campo: "precio", motivo: "El precio debe ser positivo y razonable" });
  }
  if (
    p.tiempoPreparacionMin !== undefined &&
    (p.tiempoPreparacionMin < 0 || p.tiempoPreparacionMin > 120)
  ) {
    v.push({
      campo: "tiempoPreparacionMin",
      motivo: "t(p) debe estar entre 0 y 120 minutos",
    });
  }

  return v.length === 0 ? ok() : { valido: false, violaciones: v };
}

/**
 * Aviso al marcar un producto como anticipable por debajo de t_mín.
 *
 * No se bloquea: el comercio manda sobre su catálogo, y la reserva lo va a
 * rechazar igual por el criterio de elegibilidad (§6.3). Pero decirlo acá evita
 * que el operador crea que lo activó y después no entienda por qué nadie lo
 * puede pedir.
 */
export function avisoElegibilidad(
  tiempoPreparacionMin: number,
  anticipable: boolean,
  tiempoMinAnticipable: number,
): string | null {
  if (!anticipable) return null;
  if (tiempoPreparacionMin >= tiempoMinAnticipable) return null;
  return (
    `Se prepara en ${tiempoPreparacionMin} min y el mínimo para pedido ` +
    `anticipado es ${tiempoMinAnticipable}. Nadie va a poder anticiparlo: ` +
    `ocuparía una hora de retiro sin ahorrarle tiempo a nadie.`
  );
}

/** Capacidad teórica de una franja según el personal declarado. */
export function capacidadSugerida(
  personalCocina: number,
  anchoFranjaMin: number,
): number {
  return personalCocina * anchoFranjaMin;
}
