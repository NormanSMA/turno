/**
 * Simulación de eventos discretos (§15).
 *
 * Con un piloto chico no se puede probar qué pasa con 500 usuarios ni saturar
 * al comercio a propósito; y una simulación sin validez externa es un juguete.
 * Juntas sí sirven: se calibra con lo medido en campo, se valida que reproduce
 * lo observado, y recién ahí se explora lo que en la realidad no se toca.
 *
 * **Reutiliza el módulo de admisión real** en vez de reimplementar la regla:
 * con una copia propia, un resultado del simulador hablaría de esa copia, no
 * del sistema. Por eso corre en TypeScript y no en SimPy — desviación
 * consciente del documento maestro, a cambio de que no haya dos versiones de
 * la regla que puedan divergir.
 */

import {
  cabeEnFranja,
  calcularOpcionesConCutoff,
  capacidadEfectiva,
  relacionPicoPromedio,
  type CondicionExperimental,
  type FranjaCapacidad,
  type LineaPedido,
} from "./admision";

// --------------------------------------------------------------- Entradas ---

export interface ProductoSim {
  id: string;
  /** t(p) medido con cronómetro en la fase de calibración. */
  tiempoPreparacionMin: number;
  /** Peso relativo en la demanda: qué tan seguido lo piden. */
  peso: number;
}

export interface ParametrosSimulacion {
  /** Δ — ancho de franja en minutos. */
  anchoFranjaMin: number;
  /** α — factor de seguridad. */
  factorSeguridad: number;
  /** Personal en cocina; junto con Δ define C(f). */
  personalCocina: number;
  /** Minuto del día en que abre el servicio (11:30 → 690). */
  aperturaMin: number;
  /** Minuto del día en que cierra. */
  cierreMin: number;
  /** Cantidad de pedidos que INTENTAN entrar en el día. */
  demandaDiaria: number;
  /** Catálogo con su distribución de tiempos. */
  productos: ProductoSim[];
  /** Proporción de usuarios en la condición B, entre 0 y 1. */
  proporcionB: number;
  /** Probabilidad de que un usuario en B acepte la franja sugerida. */
  adherenciaB: number;
  /** Probabilidad de que un pedido admitido no se retire. */
  tasaNoShow: number;
  /**
   * Desvío del tiempo real de cocina respecto de t(p), como fracción.
   * 0.25 significa que un plato de 12 min tarda entre 9 y 15.
   */
  variabilidadCocina: number;
  margenCutoffMin: number;
  /** Días simulados. Más días reducen el ruido de un día atípico. */
  dias: number;
  semilla: number;
}

export interface ResultadoSimulacion {
  parametros: ParametrosSimulacion;
  /** Pedidos que intentaron entrar. */
  intentos: number;
  /** Pedidos admitidos por el control de admisión. */
  admitidos: number;
  /** Rechazados porque ninguna franja tenía espacio. */
  rechazadosPorCapacidad: number;
  /** Rechazados porque ya no daba tiempo de prepararlos. */
  rechazadosPorCutoff: number;
  /** admitidos / intentos */
  tasaAdmision: number;
  /** Indicador 2: listos antes del fin de su franja / admitidos que se cocinaron. */
  tasaCumplimiento: number;
  /** Indicador 3: relación pico/promedio de carga por franja. */
  relacionPicoPromedio: number;
  /** Minutos-cocina efectivamente comprometidos. */
  cargaTotalMin: number;
  /** Minutos-cocina ofrecidos (α · C(f) sumado). */
  capacidadEfectivaTotalMin: number;
  /** cargaTotal / capacidadEfectivaTotal: cuánta capacidad se aprovecha. */
  aprovechamiento: number;
  /** Proporción de admitidos que nadie retiró. */
  tasaNoShowObservada: number;
  /** Cuántos minutos se pasan, en promedio, los pedidos que incumplen. */
  retrasoMedioIncumplidosMin: number;
}

// --------------------------------------------------- Aleatoriedad estable ---

/**
 * Generador congruencial lineal. Reproducible por diseño: un experimento de
 * simulación que no se puede repetir no es un experimento, y la tesis tiene que
 * poder decir "con la semilla 42 se obtiene esto".
 */
function crearAzar(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Normal truncada por Box–Muller: los tiempos de cocina no son uniformes. */
function normal(azar: () => number, media: number, desvio: number): number {
  const u1 = Math.max(1e-9, azar());
  const u2 = azar();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return media + z * desvio;
}

/**
 * Hora preferida de retiro: campana centrada en el pico del receso.
 *
 * Es el fenómeno que el sistema existe para administrar. Un modelo con llegadas
 * uniformes daría pico/promedio ≈ 1 y "demostraría" que el control de admisión
 * no hace falta — probando solo que el modelo estaba mal.
 */
function franjaPreferida(azar: () => number, total: number): number {
  let suma = 0;
  for (let i = 0; i < 3; i++) suma += azar();
  const centro = total * 0.35;
  const desvio = (suma / 3 - 0.5) * total * 0.55;
  return Math.max(0, Math.min(total - 1, Math.round(centro + desvio)));
}

function elegirProducto(azar: () => number, productos: ProductoSim[]): ProductoSim {
  const total = productos.reduce((a, p) => a + p.peso, 0);
  let r = azar() * total;
  for (const p of productos) {
    r -= p.peso;
    if (r <= 0) return p;
  }
  return productos[productos.length - 1];
}

// -------------------------------------------------------------- Simulación ---

interface PedidoSim {
  /** w(i): lo que el sistema PROMETIÓ que costaría. */
  cargaEstimada: number;
  /** Lo que la cocina TARDÓ de verdad. La brecha es lo que α absorbe. */
  cargaReal: number;
  /** Índice de la franja de retiro: define el plazo del pedido. */
  franja: number;
  noShow: boolean;
}

interface FranjaSim extends FranjaCapacidad {
  pedidos: PedidoSim[];
}

/**
 * Corre la simulación y devuelve los indicadores del piloto.
 *
 * El modelo de cocina es el mismo supuesto declarado en el ADR-02: el trabajo de
 * una franja se reparte entre el personal y la franja se cumple si el trabajo
 * REAL cabe en los minutos de reloj disponibles. La variabilidad se aplica al
 * tiempo real, no al estimado: el sistema promete con t(p) y la cocina entrega
 * con lo que de verdad tarda. Esa brecha es lo que α existe para absorber, y por
 * eso el simulador puede responder cuánto α hace falta.
 */
export function simular(p: ParametrosSimulacion): ResultadoSimulacion {
  const azar = crearAzar(p.semilla);

  let intentos = 0;
  let admitidos = 0;
  let rechazadosPorCapacidad = 0;
  let rechazadosPorCutoff = 0;
  let cumplidos = 0;
  let incumplidos = 0;
  let noShows = 0;
  let retrasoTotalMin = 0;
  const cargasPorFranja: number[] = [];
  let capacidadEfectivaTotal = 0;

  const capacidad = p.personalCocina * p.anchoFranjaMin;
  const alfa = p.factorSeguridad;

  for (let dia = 0; dia < p.dias; dia++) {
    const cantidad = Math.floor(
      (p.cierreMin - p.aperturaMin) / p.anchoFranjaMin,
    );
    if (cantidad <= 0) break;

    const base = dia * 24 * 60;
    const franjas: FranjaSim[] = Array.from({ length: cantidad }, (_, i) => ({
      id: `d${dia}f${i}`,
      inicio: new Date((base + p.aperturaMin + i * p.anchoFranjaMin) * 60_000),
      fin: new Date(
        (base + p.aperturaMin + (i + 1) * p.anchoFranjaMin) * 60_000,
      ),
      capacidadMinutos: capacidad,
      cargaAsignada: 0,
      pedidos: [],
      abierta: true,
    }));
    // Se llama a `capacidadEfectiva` en vez de repetir `capacidad * alfa`.
    // Parece lo mismo y ahí está el riesgo: el día que la regla de admisión
    // cambie —un techo distinto, un redondeo—, una copia a mano se queda
    // atrás en silencio y el simulador empieza a reportar sobre un sistema
    // que ya no existe. Es el punto 15 de la auditoría: los resultados del
    // simulador solo dicen algo del sistema si comparten el mismo módulo.
    capacidadEfectivaTotal +=
      cantidad * capacidadEfectiva({ capacidadMinutos: capacidad }, alfa);

    for (let n = 0; n < p.demandaDiaria; n++) {
      intentos++;

      const producto = elegirProducto(azar, p.productos);
      const cantidadItems = azar() < 0.2 ? 2 : 1;
      const lineas: LineaPedido[] = [
        {
          cantidad: cantidadItems,
          producto: {
            id: producto.id,
            tiempoPreparacionMin: producto.tiempoPreparacionMin,
            anticipable: true,
            disponible: true,
          },
        },
      ];
      const w = producto.tiempoPreparacionMin * cantidadItems;

      const condicion: CondicionExperimental =
        azar() < p.proporcionB ? "B" : "A";
      const preferida = franjas[franjaPreferida(azar, cantidad)];

      // El pedido se hace con anticipación: entre 20 min y 4 h antes.
      const anticipacion = 20 + azar() * 220;
      const ahora = new Date(preferida.inicio.getTime() - anticipacion * 60_000);

      // MISMA función que usa la reserva real. No es una reimplementación.
      const opciones = calcularOpcionesConCutoff(
        franjas,
        lineas,
        w,
        alfa,
        condicion,
        ahora,
        p.margenCutoffMin,
        preferida.id,
      );

      if (opciones.opciones.length === 0) {
        // Sin ninguna franja alcanzable: o todo lleno, o pasó el cut-off.
        const algunaCabe = franjas.some((f) => cabeEnFranja(f, w, alfa));
        if (algunaCabe) rechazadosPorCutoff++;
        else rechazadosPorCapacidad++;
        continue;
      }

      // Elección del usuario. En A insiste con su hora si puede; en B acepta la
      // sugerencia con probabilidad `adherenciaB`. Modelar adherencia < 1 es
      // importante: suponer que todos obedecen sobreestimaría el efecto de B.
      let destinoId: string;
      if (condicion === "B" && opciones.sugeridaId && azar() < p.adherenciaB) {
        destinoId = opciones.sugeridaId;
      } else if (opciones.solicitadaDisponible) {
        destinoId = preferida.id;
      } else {
        destinoId = opciones.opciones[0].franjaId;
      }

      const destino = franjas.find((f) => f.id === destinoId);
      if (!destino || !cabeEnFranja(destino, w, alfa)) {
        rechazadosPorCapacidad++;
        continue;
      }

      destino.cargaAsignada += w;
      admitidos++;

      // Tiempo REAL de cocina: t(p) con variabilidad. El sistema prometió con
      // el estimado; la cocina entrega con esto. La brecha es exactamente lo
      // que α existe para absorber.
      const real = Math.max(1, normal(azar, w, w * p.variabilidadCocina));
      const noShow = azar() < p.tasaNoShow;
      if (noShow) noShows++;

      destino.pedidos.push({
        cargaEstimada: w,
        cargaReal: real,
        franja: franjas.indexOf(destino),
        noShow,
      });
    }

    // Cumplimiento: capacidad por franja con ARRASTRE.
    //
    // Dos errores de modelado que hay que evitar acá, y que se descartaron
    // probando el simulador contra lo que la teoría predice:
    //
    //  1. Exigir que cada pedido se cocine dentro de los Δ minutos de su propia
    //     franja, empezando de cero. Sería absurdo: la franja es la ventana de
    //     RETIRO, no la de cocción, y un plato de 12 minutos nunca cumpliría en
    //     una franja de 10.
    //
    //  2. Dejar que la cocina trabaje con toda la anticipación que quiera. Con
    //     eso, α deja de ser vinculante: si el sistema compromete α · C(f) y la
    //     cocina dispone de C(f) por franja más un arranque libre, el trabajo
    //     SIEMPRE entra y el modelo reporta 100% de cumplimiento para cualquier
    //     α — que es lo contrario de lo que §6.2 afirma.
    //
    // El modelo correcto: durante cada franja la cocina dispone de
    // `personalCocina × Δ` minutos de trabajo. Lo que no alcanza a terminar se
    // arrastra a la siguiente franja, y los pedidos que quedan del otro lado del
    // corte incumplen su promesa.
    //
    // Así el incumplimiento tiene una causa identificable: la carga REAL de una
    // franja superó su capacidad de reloj, aunque la carga ESTIMADA cupiera bajo
    // α. Esa brecha entre lo prometido y lo que de verdad tarda la cocina es
    // exactamente lo que α existe para absorber — y es lo que hace que el
    // simulador pueda responder cuánto α hace falta.
    const capacidadRelojPorFranja = p.personalCocina * p.anchoFranjaMin;
    let arrastre = 0;

    for (const f of franjas) {
      cargasPorFranja.push(f.cargaAsignada);
      if (f.pedidos.length === 0) {
        // Una franja sin pedidos igual sirve para descontar arrastre: la cocina
        // no se queda quieta porque nadie pidió para esa hora.
        arrastre = Math.max(0, arrastre - capacidadRelojPorFranja);
        continue;
      }

      // El trabajo pendiente de antes se hace primero: la cocina no abandona un
      // pedido a medias para empezar el siguiente.
      let usado = Math.min(arrastre, capacidadRelojPorFranja);
      arrastre -= usado;

      for (const pedido of f.pedidos) {
        usado += pedido.cargaReal;
        if (usado <= capacidadRelojPorFranja) {
          cumplidos++;
        } else {
          incumplidos++;
          // Cuánto se pasa: los minutos de trabajo excedentes convertidos a
          // reloj. Le dice al comercio si el atraso es marginal o estructural.
          retrasoTotalMin +=
            (usado - capacidadRelojPorFranja) / p.personalCocina;
        }
      }

      arrastre += Math.max(0, usado - capacidadRelojPorFranja);
    }
  }

  const cargaTotal = cargasPorFranja.reduce((a, b) => a + b, 0);
  const totalEvaluado = cumplidos + incumplidos;

  return {
    parametros: p,
    intentos,
    admitidos,
    rechazadosPorCapacidad,
    rechazadosPorCutoff,
    tasaAdmision: intentos === 0 ? 0 : admitidos / intentos,
    tasaCumplimiento: totalEvaluado === 0 ? 1 : cumplidos / totalEvaluado,
    relacionPicoPromedio: relacionPicoPromedio(cargasPorFranja),
    cargaTotalMin: cargaTotal,
    capacidadEfectivaTotalMin: Math.round(capacidadEfectivaTotal),
    aprovechamiento:
      capacidadEfectivaTotal === 0 ? 0 : cargaTotal / capacidadEfectivaTotal,
    tasaNoShowObservada: admitidos === 0 ? 0 : noShows / admitidos,
    retrasoMedioIncumplidosMin:
      incumplidos === 0 ? 0 : retrasoTotalMin / incumplidos,
  };
}

// ------------------------------------------------------------- Exploración ---

export interface PuntoBarrido {
  anchoFranjaMin: number;
  factorSeguridad: number;
  /** Intentos de pedido por día, no pedidos servidos. */
  demandaDiaria: number;
  tasaAdmision: number;
  tasaCumplimiento: number;
  relacionPicoPromedio: number;
  aprovechamiento: number;
  /**
   * Pedidos admitidos POR DÍA. Se normaliza a propósito: el total de la corrida
   * depende de cuántos días se simularon, y compararlo entre configuraciones
   * con distinta duración da conclusiones falsas.
   */
  admitidosPorDia: number;
}

/**
 * Barrido del espacio de parámetros.
 *
 * Es lo que el piloto no puede hacer: probar Δ = 5, 10, 15 y 20 sobre el mismo
 * comercio, o subir la demanda a 500 sin arruinarle el día a nadie. Cada
 * combinación se corre con varias semillas y se promedia, porque una sola
 * corrida puede caer en un día atípico y llevar a una recomendación equivocada.
 */
export function barrer(
  base: ParametrosSimulacion,
  rejilla: {
    anchos?: number[];
    alfas?: number[];
    demandas?: number[];
    repeticiones?: number;
  },
): PuntoBarrido[] {
  const anchos = rejilla.anchos ?? [base.anchoFranjaMin];
  const alfas = rejilla.alfas ?? [base.factorSeguridad];
  const demandas = rejilla.demandas ?? [base.demandaDiaria];
  const repeticiones = rejilla.repeticiones ?? 5;

  const puntos: PuntoBarrido[] = [];

  for (const anchoFranjaMin of anchos) {
    for (const factorSeguridad of alfas) {
      for (const demandaDiaria of demandas) {
        const corridas = Array.from({ length: repeticiones }, (_, i) =>
          simular({
            ...base,
            anchoFranjaMin,
            factorSeguridad,
            demandaDiaria,
            semilla: base.semilla + i * 7919,
          }),
        );
        const media = (f: (r: ResultadoSimulacion) => number) =>
          corridas.reduce((a, r) => a + f(r), 0) / corridas.length;

        puntos.push({
          anchoFranjaMin,
          factorSeguridad,
          demandaDiaria,
          tasaAdmision: media((r) => r.tasaAdmision),
          tasaCumplimiento: media((r) => r.tasaCumplimiento),
          relacionPicoPromedio: media((r) => r.relacionPicoPromedio),
          aprovechamiento: media((r) => r.aprovechamiento),
          admitidosPorDia: media((r) => r.admitidos / Math.max(1, base.dias)),
        });
      }
    }
  }

  return puntos;
}

/**
 * Encuentra el α que MAXIMIZA pedidos atendidos sin bajar del umbral de
 * cumplimiento. Es la pregunta de §15 formulada como búsqueda:
 *
 *   "¿Qué α maximiza pedidos atendidos sin bajar del 90% de cumplimiento?"
 *
 * Devuelve null si ningún α del barrido alcanza el umbral: eso también es un
 * resultado, y significa que el problema no está en α sino en la capacidad.
 */
export function alfaOptimo(
  puntos: PuntoBarrido[],
  umbralCumplimiento = 0.9,
): PuntoBarrido | null {
  const validos = puntos.filter(
    (p) => p.tasaCumplimiento >= umbralCumplimiento,
  );
  if (validos.length === 0) return null;
  return validos.reduce((mejor, p) =>
    p.admitidosPorDia > mejor.admitidosPorDia ? p : mejor,
  );
}

export interface Techo {
  /** Pedidos efectivamente SERVIDOS por día en el punto de saturación. */
  servidosPorDia: number;
  /** Intentos por día a los que se alcanza ese techo. */
  demandaEnSaturacion: number;
  /** Qué proporción de los intentos se rechaza en ese punto. */
  tasaRechazo: number;
}

/**
 * Volumen que el comercio realmente SIRVE manteniendo el umbral.
 *
 * Acá hay una trampa que conviene señalar, porque es fácil caer en ella y da
 * una conclusión falsa: si se define el techo como "el mayor número de INTENTOS
 * con cumplimiento ≥ 90%", el resultado es absurdamente alto. El control de
 * admisión mantiene el cumplimiento precisamente RECHAZANDO: con 240 intentos
 * diarios sigue cumpliendo el 97%, pero porque admite el 14%. Decir que
 * "sostiene 240 pedidos diarios" sería falso — sostiene los mismos ~35 de
 * siempre y le dice que no a 205 personas.
 *
 * Lo que hay que medir es cuántos pedidos SIRVE, y a partir de qué demanda deja
 * de crecer. Eso convierte "se recomienda seguir mejorando la plataforma" en
 * "el comercio sirve hasta N pedidos diarios; por encima de M intentos, uno de
 * cada X se queda sin lugar y hace falta más capacidad".
 */
export function volumenSostenible(
  puntos: PuntoBarrido[],
  umbralCumplimiento = 0.9,
): Techo | null {
  const validos = puntos
    .filter((p) => p.tasaCumplimiento >= umbralCumplimiento)
    .sort((a, b) => a.demandaDiaria - b.demandaDiaria);
  if (validos.length === 0) return null;

  const techo = validos.reduce((mejor, p) =>
    p.admitidosPorDia > mejor.admitidosPorDia ? p : mejor,
  );

  return {
    servidosPorDia: techo.admitidosPorDia,
    demandaEnSaturacion: techo.demandaDiaria,
    tasaRechazo: 1 - techo.tasaAdmision,
  };
}
