/**
 * TURNO — Capacidad de cocina como flujo, no como casilla.
 *
 * ## El problema que corrige
 *
 * El modelo anterior le daba a cada franja `C(f) = personal × Δ` minutos-cocina
 * y exigía que el pedido cupiera ahí. Eso incrusta un supuesto que nadie
 * declaró: **que el trabajo de un pedido ocurre dentro de su ventana de
 * retiro**. Es falso justo en el caso que le da sentido al producto. Si alguien
 * pide a las 12:00 para retirar a las 12:45, la cocina tuvo cuarenta y cinco
 * minutos; el modelo viejo hacía como si tuviera los quince de la franja.
 *
 * El efecto práctico: una franja de 15 minutos con un cocinero admitía **una**
 * pizza. No porque la cocina no pudiera hacer más, sino porque el modelo miraba
 * la ventana equivocada.
 *
 * ## Las dos restricciones que sí son reales
 *
 * Hay dos cuellos de botella distintos, y el modelo viejo los cobraba con el
 * mismo número:
 *
 *   1. **La cocina** produce a lo largo del tiempo. Un almuerzo que ya está
 *      hecho se termina en 5 minutos; una pizza necesita 15. Lo que limita es
 *      cuánto trabajo cabe entre el momento del pedido y la hora de retiro.
 *
 *   2. **El mostrador** entrega dentro de la franja. Doce personas no se
 *      atienden en quince minutos por mucho que la comida esté lista. Esto sí
 *      es una restricción de la ventana de retiro, y es la única que lo es.
 *
 * Separarlas es lo que permite que un comercio venda doce almuerzos donde antes
 * vendía tres, sin prometer una sola vez algo que no pueda cumplir.
 *
 * ## Por qué la regla acumulada es exacta y no una heurística
 *
 * La restricción de cocina es un problema clásico de planificación: un conjunto
 * de trabajos, cada uno con su duración y su fecha límite, sobre una máquina
 * que rinde `personal` minutos de trabajo por minuto de reloj.
 *
 * Para ese problema existe una condición de factibilidad **exacta**: el
 * conjunto es realizable si y solo si, para cada fecha límite `d`, todo el
 * trabajo que vence en `d` o antes cabe en el tiempo disponible hasta `d`.
 *
 *     ∀ d:   Σ  trabajo(i)   ≤   personal · (d − ahora) · α
 *          i: límite(i) ≤ d
 *
 * No hace falta decidir en qué orden cocina nadie: si la desigualdad se cumple
 * para todos los límites, existe un orden que cumple todos los pedidos (basta
 * cocinar siempre lo que vence antes). Si falla para alguno, **ningún** orden
 * los cumple. Por eso comprobar la desigualdad es suficiente, y por eso este
 * módulo no planifica: decide.
 *
 * Verificar solo la franja del pedido nuevo NO alcanza, y ese es el error fácil
 * de cometer acá. Un pedido para las 13:00 puede caber mirando solo las 13:00 y
 * aun así robarle a la cocina el tiempo que ya le hacía falta a otro que vence
 * a las 12:30. Por eso se recorren todos los límites, no uno.
 *
 * ## Qué NO modela
 *
 * - **Frescura.** El modelo permite adelantar el trabajo tanto como haya
 *   tiempo. Que una pizza no se hornee dos horas antes es cierto, pero la
 *   cocina real no adelanta lo que se enfría: lo ordena. Si algún día hace
 *   falta forzarlo, es un límite inferior por producto, no un cambio de esta
 *   regla.
 * - **Recursos únicos.** Si hay una sola plancha, dos cocineros no son el doble
 *   de plancha. Es el mismo supuesto declarado del ADR-02 y sigue vigente.
 */

/** Trabajo ya comprometido con vencimiento en una franja. */
export interface CompromisoFranja {
  franjaId: string;
  /** Fin de la franja: la hora en que ese trabajo tiene que estar terminado. */
  fin: Date;
  /** Minutos de cocina comprometidos para esa franja. */
  minutosCocina: number;
  /** Minutos de mostrador comprometidos para esa franja. */
  minutosDespacho: number;
}

export interface ParametrosCapacidad {
  /** Cocineros en paralelo: minutos de cocina que rinde cada minuto de reloj. */
  personalCocina: number;
  /** Personas atendiendo el mostrador. */
  personalMostrador: number;
  /** Δ — ancho de la franja, en minutos. Es la ventana de entrega. */
  anchoFranjaMin: number;
  /** α — factor de seguridad. Se aplica a las dos restricciones. */
  factorSeguridad: number;
}

/**
 * Minutos de cocina que el comercio puede producir entre `ahora` y `limite`.
 *
 * Devuelve 0 para un límite ya pasado en vez de un número negativo: una
 * capacidad negativa se propaga como una holgura absurda y termina admitiendo
 * pedidos en franjas vencidas.
 */
export function capacidadCocinaHasta(
  ahora: Date,
  limite: Date,
  params: Pick<ParametrosCapacidad, "personalCocina" | "factorSeguridad">,
): number {
  const minutos = (limite.getTime() - ahora.getTime()) / 60_000;
  if (minutos <= 0) return 0;
  return minutos * params.personalCocina * params.factorSeguridad;
}

/** Minutos de mostrador disponibles dentro de una franja. */
export function capacidadDespachoFranja(
  params: Pick<
    ParametrosCapacidad,
    "personalMostrador" | "anchoFranjaMin" | "factorSeguridad"
  >,
): number {
  return (
    params.personalMostrador * params.anchoFranjaMin * params.factorSeguridad
  );
}

export type MotivoNoCabe = "COCINA_SATURADA" | "MOSTRADOR_LLENO";

export interface ResultadoCabe {
  cabe: boolean;
  motivo?: MotivoNoCabe;
  /**
   * Cuando no cabe por cocina, el fin de la franja cuyo límite se rompe.
   *
   * No siempre es la franja que se pidió: el pedido nuevo puede ser el que
   * desborda a otro que vence antes. Saber cuál es lo que permite explicarle al
   * usuario qué pasó en vez de un "no hay espacio" sin causa.
   */
  limiteRoto?: Date;
}

/**
 * ¿Cabe un pedido nuevo, sin romper ninguna promesa ya hecha?
 *
 * `compromisos` son los trabajos ya admitidos, uno por franja. El pedido nuevo
 * se suma al de su franja y se comprueban las dos restricciones.
 */
export function cabeConAnticipacion(args: {
  ahora: Date;
  /** Franja donde se quiere retirar. */
  franjaDestino: { franjaId: string; fin: Date };
  /** Costo del pedido nuevo. */
  cocinaMin: number;
  despachoMin: number;
  /** Trabajo ya comprometido, en cualquier orden. */
  compromisos: CompromisoFranja[];
  params: ParametrosCapacidad;
}): ResultadoCabe {
  const { ahora, franjaDestino, cocinaMin, despachoMin, params } = args;

  /* --- Mostrador: es local a la franja, así que se mira sola. --- */
  const enDestino = args.compromisos.find(
    (c) => c.franjaId === franjaDestino.franjaId,
  );
  const despachoUsado = enDestino?.minutosDespacho ?? 0;
  if (
    despachoUsado + despachoMin >
    capacidadDespachoFranja(params) + TOLERANCIA
  ) {
    return { cabe: false, motivo: "MOSTRADOR_LLENO" };
  }

  /* --- Cocina: se comprueban TODOS los límites, no solo el del destino. ---
     Recorrer solo la franja pedida deja pasar el pedido que le quita a la
     cocina el tiempo que otro, con vencimiento anterior, ya tenía apalabrado. */
  const conNuevo = args.compromisos.map((c) => ({
    ...c,
    minutosCocina:
      c.franjaId === franjaDestino.franjaId
        ? c.minutosCocina + cocinaMin
        : c.minutosCocina,
  }));

  // Si la franja destino todavía no tenía nada comprometido, no está en la
  // lista y hay que agregarla: su propio límite es el que más suele romperse.
  if (!enDestino) {
    conNuevo.push({
      franjaId: franjaDestino.franjaId,
      fin: franjaDestino.fin,
      minutosCocina: cocinaMin,
      minutosDespacho: despachoMin,
    });
  }

  const porLimite = [...conNuevo].sort(
    (a, b) => a.fin.getTime() - b.fin.getTime(),
  );

  let acumulado = 0;
  for (const c of porLimite) {
    // Lo ya vencido no se descuenta ni se ignora: sigue sumando. Es trabajo que
    // la cocina tiene encima aunque su franja haya pasado.
    acumulado += c.minutosCocina;
    const disponible = capacidadCocinaHasta(ahora, c.fin, params);
    if (acumulado > disponible + TOLERANCIA) {
      return { cabe: false, motivo: "COCINA_SATURADA", limiteRoto: c.fin };
    }
  }

  return { cabe: true };
}

/**
 * Margen de coma flotante, en minutos.
 *
 * `factorSeguridad` es decimal, así que las capacidades salen con cola binaria:
 * un pedido que llena la franja EXACTAMENTE puede dar 30.000000000000004 > 30 y
 * ser rechazado sin motivo. La tolerancia es mucho menor que un minuto de
 * cocina, así que no admite nada que no quepa de verdad.
 */
const TOLERANCIA = 1e-9;

/**
 * Minutos de cocina libres para una franja dada, considerando todos los límites.
 *
 * Es lo que se le puede agregar a esa franja sin romper ninguna promesa. Puede
 * ser menor que la holgura de su propio límite: si una franja posterior ya está
 * apretada, lo que se meta acá se lo quita a aquella.
 */
export function holguraCocina(args: {
  ahora: Date;
  franja: { franjaId: string; fin: Date };
  compromisos: CompromisoFranja[];
  params: ParametrosCapacidad;
}): number {
  const { ahora, franja, compromisos, params } = args;

  /* Si la franja no tiene nada comprometido, entra con cero: así el bucle de
     abajo es uno solo. La alternativa —tratar ese caso aparte— era el mismo
     recorrido escrito dos veces, y dos copias de una regla se separan. */
  const todas = compromisos.some((c) => c.franjaId === franja.franjaId)
    ? compromisos
    : [
        ...compromisos,
        {
          franjaId: franja.franjaId,
          fin: franja.fin,
          minutosCocina: 0,
          minutosDespacho: 0,
        },
      ];

  const porLimite = [...todas].sort((a, b) => a.fin.getTime() - b.fin.getTime());

  let acumulado = 0;
  let margen = Number.POSITIVE_INFINITY;
  let vista = false;

  for (const c of porLimite) {
    acumulado += c.minutosCocina;
    if (c.franjaId === franja.franjaId) vista = true;
    /* Agregar trabajo a `franja` engorda el acumulado de su propio límite y el
       de todos los posteriores; los anteriores no se tocan, y por eso el mínimo
       se toma solo desde que aparece. */
    if (vista) {
      margen = Math.min(
        margen,
        capacidadCocinaHasta(ahora, c.fin, params) - acumulado,
      );
    }
  }

  return Math.max(0, margen);
}
