/**
 * TURNO — Estado del sistema, para quien opera la plataforma.
 *
 * Distinto de `metricas.ts` (que mide el experimento) y de `informe.ts` (que
 * mide el negocio de un comercio). Esto responde a "¿está funcionando bien?" y
 * a la pregunta que ninguna de las otras dos hace: **¿el modelo de admisión
 * sigue siendo cierto?**
 *
 * Todo es puro. Entra una lista de observaciones, sale el diagnóstico.
 */

/** Mediana. Devuelve `null` sin datos en vez de un cero que miente. */
export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 1 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

// ------------------------------------------------------ Presión de capacidad

export interface FranjaSistema {
  comercio: string;
  hora: string;
  capacidadMinutos: number;
  cargaAsignada: number;
  /** α del comercio: la fracción de la capacidad que el modelo se permite usar. */
  factorSeguridad: number;
}

export interface PresionComercio {
  comercio: string;
  franjas: number;
  /** Franjas que llegaron al tope que α les permite. Ahí ya se rechaza. */
  saturadas: number;
  vacias: number;
  /** Ocupación media sobre la capacidad declarada, no sobre α·C. */
  ocupacionMedia: number | null;
  picoHora: string | null;
  picoOcupacion: number | null;
}

/**
 * Dónde está apretando el sistema.
 *
 * `saturadas` es el número que importa: una franja al tope de α es una franja
 * donde el sistema **ya está rechazando estudiantes**. Si crece, el problema no
 * es de software — es que falta cocina, o que α está demasiado bajo.
 *
 * Se cuenta contra α·C y no contra C porque ese es el punto en que el control
 * de admisión empieza a decir que no. La ocupación media, en cambio, se reporta
 * contra C: es lo que el comercio entiende como "cuánto usé mi cocina".
 */
export function presionPorComercio(
  franjas: FranjaSistema[],
): PresionComercio[] {
  const mapa = new Map<string, FranjaSistema[]>();
  for (const f of franjas) {
    if (f.capacidadMinutos <= 0) continue;
    const lista = mapa.get(f.comercio) ?? [];
    lista.push(f);
    mapa.set(f.comercio, lista);
  }

  return [...mapa.entries()]
    .map(([comercio, fs]) => {
      const usadas = fs.filter((f) => f.cargaAsignada > 0);
      const razones = usadas.map((f) => ({
        hora: f.hora,
        ocupacion: f.cargaAsignada / f.capacidadMinutos,
      }));

      const pico = razones.reduce<{ hora: string; ocupacion: number } | null>(
        (mejor, r) => (!mejor || r.ocupacion > mejor.ocupacion ? r : mejor),
        null,
      );

      return {
        comercio,
        franjas: fs.length,
        // Margen de un minuto: la carga es entera y α·C casi nunca lo es, así
        // que exigir igualdad exacta no marcaría nunca una franja llena.
        saturadas: fs.filter(
          (f) => f.cargaAsignada + 1 > f.factorSeguridad * f.capacidadMinutos,
        ).length,
        vacias: fs.length - usadas.length,
        ocupacionMedia:
          razones.length > 0
            ? razones.reduce((n, r) => n + r.ocupacion, 0) / razones.length
            : null,
        picoHora: pico?.hora ?? null,
        picoOcupacion: pico?.ocupacion ?? null,
      };
    })
    .sort((a, b) => b.saturadas - a.saturadas);
}

// ----------------------------------------------------- Calidad de la promesa

export interface MuestraPreparacion {
  comercio: string;
  /** Minutos que el modelo prometió: la suma de t(p) del pedido. */
  declarado: number;
  /** Minutos que la cocina tardó de verdad: EN_PREPARACION → LISTO. */
  real: number;
  /** Nombre del producto, solo si el pedido tenía UNO. Si no, `null`. */
  productoUnico: string | null;
}

export interface Desvio {
  clave: string;
  muestras: number;
  declarado: number;
  real: number;
  /** real / declarado. Mayor que 1 = la cocina tarda más de lo prometido. */
  factor: number;
}

/**
 * Cuánto se aparta la realidad de lo declarado. **Si `t(p)` está mal medido, el
 * modelo de admisión descansa sobre un número falso**: prometer diez minutos y
 * tardar quince es una promesa incumplida por diseño.
 *
 * Por MEDIANA, no promedio: un pedido olvidado una hora en "en preparación"
 * haría ver mal a una cocina que anda bien. Bajo `minimo` muestras no se
 * reporta — un desvío sobre dos pedidos es ruido con aspecto de dato.
 */
export function desvios(
  muestras: MuestraPreparacion[],
  clave: (m: MuestraPreparacion) => string | null,
  minimo = 5,
): Desvio[] {
  const mapa = new Map<string, MuestraPreparacion[]>();
  for (const m of muestras) {
    const k = clave(m);
    if (k === null) continue;
    const lista = mapa.get(k) ?? [];
    lista.push(m);
    mapa.set(k, lista);
  }

  return [...mapa.entries()]
    .filter(([, ms]) => ms.length >= minimo)
    .map(([k, ms]) => {
      const declarado = mediana(ms.map((m) => m.declarado)) ?? 0;
      const real = mediana(ms.map((m) => m.real)) ?? 0;
      return {
        clave: k,
        muestras: ms.length,
        declarado,
        real,
        factor: declarado > 0 ? real / declarado : 1,
      };
    })
    // Lo más desviado primero, en cualquiera de las dos direcciones: prometer
    // de más también es un problema — deja capacidad sin vender.
    .sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1));
}

export const desviosPorComercio = (ms: MuestraPreparacion[]) =>
  desvios(ms, (m) => m.comercio);

export const desviosPorProducto = (ms: MuestraPreparacion[]) =>
  desvios(ms, (m) => m.productoUnico);

// -------------------------------------------------------- Embudo operativo

export interface Embudo {
  creados: number;
  enCocina: number;
  listos: number;
  retirados: number;
  noShows: number;
  cancelados: number;
  /** retirados / creados. La tasa de finalización del recorrido. */
  tasaRetiro: number | null;
}

/**
 * Qué pasa con los pedidos que SÍ entraron.
 *
 * Deliberadamente no incluye los rechazos por capacidad: esos nunca llegaron a
 * ser un pedido y el sistema no los persiste. Mostrar un embudo que arranca en
 * "intentos" con un número inventado sería peor que empezar donde empieza el
 * dato — la presión de capacidad de arriba es la que habla de los rechazos.
 */
export function embudoOperativo(estados: string[]): Embudo {
  const contar = (e: string) => estados.filter((x) => x === e).length;
  const creados = estados.length;
  const retirados = contar("RETIRADO");

  return {
    creados,
    enCocina: contar("EN_PREPARACION"),
    listos: contar("LISTO"),
    retirados,
    noShows: contar("NO_SHOW"),
    cancelados: contar("CANCELADO"),
    tasaRetiro: creados > 0 ? retirados / creados : null,
  };
}
