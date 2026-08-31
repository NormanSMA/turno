/**
 * Instrumentos de usabilidad (§13.1, §14.6).
 *
 *  - **Micro-encuesta**: una pregunta, tres segundos, DESPUÉS del retiro.
 *    Preguntar durante el pedido mete fricción en lo que se está midiendo. La
 *    pregunta rota cada pocos días para no cansar.
 *  - **SUS**: los diez ítems canónicos, una vez al cierre. Su valor es que el
 *    puntaje se compara con literatura ajena.
 *
 * Sesgo declarado: las encuestas opcionales las contesta quien quedó contento.
 * Son direccionales; el peso lo cargan los datos duros. La mejor "encuesta" es
 * conductual: si volvieron a pedir, el producto sirve.
 */

export interface OpcionMicro {
  valor: string;
  texto: string;
  /**
   * Valor numérico en minutos, cuando la pregunta lo admite.
   *
   * Sin esto, "bastante" y "poco" son categorías que no se pueden promediar ni
   * comparar con la línea base medida en campo. Con cifras, la respuesta del
   * usuario se puede contrastar contra el ahorro que el sistema calcula —
   * `tiempoRecuperadoMin` en `core/metricas.ts`— y esa comparación entre
   * percepción y medición es un resultado en sí mismo.
   */
  minutos?: number;
}

export interface PreguntaMicro {
  id: string;
  texto: string;
  opciones: OpcionMicro[];
  /** true si las opciones llevan minutos y la respuesta se puede promediar. */
  cuantitativa?: boolean;
}

/**
 * Banco de micro-preguntas. Rotan por día para no preguntar siempre lo mismo:
 * una sola pregunta repetida durante veinte días mide menos que cuatro
 * preguntas repartidas, y cansa más.
 */
export const PREGUNTAS_MICRO: PreguntaMicro[] = [
  {
    id: "listo_a_tiempo",
    texto: "¿Estaba listo cuando llegaste?",
    opciones: [
      { valor: "si", texto: "Sí" },
      { valor: "espere_poco", texto: "Esperé un poco" },
      { valor: "espere_mucho", texto: "Esperé bastante" },
    ],
  },
  {
    // La pregunta más valiosa del banco: es la única que produce un número
    // comparable con el ahorro que el sistema calcula por su cuenta.
    id: "tiempo_ahorrado",
    texto: "¿Cuántos minutos creés que te ahorraste?",
    cuantitativa: true,
    opciones: [
      { valor: "0", texto: "Nada", minutos: 0 },
      { valor: "5", texto: "5 min", minutos: 5 },
      { valor: "10", texto: "10 min", minutos: 10 },
      { valor: "15", texto: "15 min", minutos: 15 },
      { valor: "20", texto: "20 min o más", minutos: 20 },
    ],
  },
  {
    id: "fila_evitada",
    texto: "¿Cuánta fila te habrías comido sin TURNO?",
    cuantitativa: true,
    opciones: [
      { valor: "0", texto: "Ninguna", minutos: 0 },
      { valor: "5", texto: "5 min", minutos: 5 },
      { valor: "10", texto: "10 min", minutos: 10 },
      { valor: "15", texto: "15 min o más", minutos: 15 },
    ],
  },
  {
    id: "espera_retiro",
    texto: "¿Cuánto esperaste al llegar a retirar?",
    cuantitativa: true,
    opciones: [
      { valor: "0", texto: "Nada, estaba listo", minutos: 0 },
      { valor: "2", texto: "1 o 2 min", minutos: 2 },
      { valor: "5", texto: "5 min", minutos: 5 },
      { valor: "10", texto: "10 min o más", minutos: 10 },
    ],
  },
  {
    id: "volveria",
    texto: "¿Volverías a pedir así?",
    opciones: [
      { valor: "si", texto: "Sí" },
      { valor: "tal_vez", texto: "Tal vez" },
      { valor: "no", texto: "No" },
    ],
  },
  {
    id: "hora_util",
    texto: "¿La hora que elegiste te sirvió?",
    opciones: [
      { valor: "si", texto: "Sí, justo" },
      { valor: "temprano", texto: "Muy temprano" },
      { valor: "tarde", texto: "Muy tarde" },
    ],
  },
];

/**
 * Qué pregunta toca hoy. Determinista por día para que todos los usuarios de
 * una misma jornada respondan lo mismo: si rotara por usuario, cada pregunta
 * tendría una muestra distinta y no se podrían comparar días.
 */
export function preguntaDelDia(fecha = new Date()): PreguntaMicro {
  const dias = Math.floor(fecha.getTime() / 86_400_000);
  return PREGUNTAS_MICRO[dias % PREGUNTAS_MICRO.length];
}

// -------------------------------------------------------------------- SUS ---

/**
 * Los diez ítems del System Usability Scale, en su orden canónico y con la
 * alternancia positivo/negativo del instrumento original.
 *
 * Esa alternancia no es un capricho de redacción: obliga a leer cada ítem en vez
 * de marcar toda una columna, y es parte de por qué el puntaje es comparable.
 * Reordenarlos o hacerlos todos positivos rompería la comparabilidad, que es la
 * única razón para usar SUS en lugar de preguntas propias.
 */
export const ITEMS_SUS: { texto: string; positivo: boolean }[] = [
  { texto: "Creo que usaría TURNO frecuentemente.", positivo: true },
  { texto: "Encontré TURNO innecesariamente complejo.", positivo: false },
  { texto: "Me pareció fácil de usar.", positivo: true },
  {
    texto: "Creo que necesitaría ayuda de alguien para poder usarlo.",
    positivo: false,
  },
  {
    texto: "Las distintas partes de TURNO están bien integradas.",
    positivo: true,
  },
  { texto: "Hay demasiada inconsistencia en TURNO.", positivo: false },
  {
    texto: "Imagino que la mayoría aprendería a usarlo muy rápido.",
    positivo: true,
  },
  { texto: "Me resultó muy incómodo de usar.", positivo: false },
  { texto: "Me sentí seguro usándolo.", positivo: true },
  {
    texto: "Tuve que aprender muchas cosas antes de poder usarlo.",
    positivo: false,
  },
];

export class RespuestasSusInvalidas extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "RespuestasSusInvalidas";
  }
}

/**
 * Puntaje SUS a partir de los diez ítems (1 a 5).
 *
 * Fórmula estándar: en los ítems impares (positivos) se resta 1; en los pares
 * (negativos) se resta la respuesta de 5. La suma resultante, de 0 a 40, se
 * multiplica por 2,5 para llevarla a 0–100.
 *
 * El resultado NO es un porcentaje, aunque vaya de 0 a 100. Presentarlo como
 * "68% de usabilidad" es un error frecuente: 68 es el promedio de la literatura,
 * el umbral que §14.5 fija como meta, y el punto que separa "aceptable" de "no".
 */
export function puntajeSus(respuestas: number[]): number {
  if (respuestas.length !== ITEMS_SUS.length) {
    throw new RespuestasSusInvalidas(
      `SUS necesita exactamente ${ITEMS_SUS.length} respuestas, llegaron ${respuestas.length}`,
    );
  }
  for (const r of respuestas) {
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      throw new RespuestasSusInvalidas("Cada ítem va de 1 a 5");
    }
  }

  let suma = 0;
  respuestas.forEach((r, i) => {
    suma += ITEMS_SUS[i].positivo ? r - 1 : 5 - r;
  });
  return suma * 2.5;
}

export type Adjetivo =
  | "inaceptable"
  | "pobre"
  | "aceptable"
  | "bueno"
  | "excelente";

/**
 * Interpretación del puntaje según la escala de adjetivos de Bangor et al.
 * Se incluye porque un número suelto no le dice nada a un lector, y porque el
 * umbral de 68 del indicador 7 cae justo en el límite de "aceptable".
 */
export function interpretarSus(puntaje: number): Adjetivo {
  if (puntaje < 51) return "inaceptable";
  if (puntaje < 68) return "pobre";
  if (puntaje < 80.3) return "aceptable";
  if (puntaje < 90) return "bueno";
  return "excelente";
}

export interface ResumenSus {
  respuestas: number;
  promedio: number | null;
  mediana: number | null;
  /** Proporción que alcanza o supera el umbral del indicador 7. */
  sobreUmbral: number | null;
  adjetivo: Adjetivo | null;
}

export function resumirSus(puntajes: number[], umbral = 68): ResumenSus {
  if (puntajes.length === 0) {
    return {
      respuestas: 0,
      promedio: null,
      mediana: null,
      sobreUmbral: null,
      adjetivo: null,
    };
  }
  const ordenados = [...puntajes].sort((a, b) => a - b);
  const m = Math.floor(ordenados.length / 2);
  const promedio = puntajes.reduce((a, b) => a + b, 0) / puntajes.length;

  return {
    respuestas: puntajes.length,
    promedio,
    mediana:
      ordenados.length % 2 ? ordenados[m] : (ordenados[m - 1] + ordenados[m]) / 2,
    sobreUmbral: puntajes.filter((p) => p >= umbral).length / puntajes.length,
    adjetivo: interpretarSus(promedio),
  };
}

/**
 * Promedio de las respuestas cuantitativas de una pregunta, en minutos.
 *
 * Es lo que convierte la micro-encuesta en un dato del Capítulo V y no en una
 * impresión: se puede promediar, comparar entre condiciones A y B, y contrastar
 * con el ahorro que el sistema calcula por su cuenta.
 *
 * La diferencia entre percepción y medición no es un error a corregir: es un
 * hallazgo. Si la gente percibe menos ahorro del que el sistema calcula, el
 * problema puede estar en la comunicación de la hora prometida, no en el motor.
 */
export function promedioMinutos(
  respuestas: { pregunta: string; valores: unknown }[],
  preguntaId: string,
): { respuestas: number; promedioMin: number | null; medianaMin: number | null } {
  const pregunta = PREGUNTAS_MICRO.find((p) => p.id === preguntaId);
  if (!pregunta?.cuantitativa) {
    return { respuestas: 0, promedioMin: null, medianaMin: null };
  }

  const minutos: number[] = [];
  for (const r of respuestas) {
    if (r.pregunta !== preguntaId) continue;
    const opcion =
      typeof r.valores === "object" && r.valores !== null && "opcion" in r.valores
        ? String((r.valores as { opcion: unknown }).opcion)
        : null;
    if (opcion === null) continue;
    const elegida = pregunta.opciones.find((o) => o.valor === opcion);
    if (elegida?.minutos !== undefined) minutos.push(elegida.minutos);
  }

  if (minutos.length === 0) {
    return { respuestas: 0, promedioMin: null, medianaMin: null };
  }

  const ordenados = [...minutos].sort((a, b) => a - b);
  const m = Math.floor(ordenados.length / 2);

  return {
    respuestas: minutos.length,
    promedioMin: minutos.reduce((a, b) => a + b, 0) / minutos.length,
    medianaMin:
      ordenados.length % 2 ? ordenados[m] : (ordenados[m - 1] + ordenados[m]) / 2,
  };
}

/** Todas las preguntas que producen minutos, para recorrerlas en el panel. */
export function preguntasCuantitativas(): PreguntaMicro[] {
  return PREGUNTAS_MICRO.filter((p) => p.cuantitativa);
}

/** Conteo de respuestas de una micro-pregunta, para el panel. */
export function resumirMicro(
  respuestas: { pregunta: string; valores: unknown }[],
): { pregunta: string; opcion: string; conteo: number }[] {
  const m = new Map<string, number>();
  for (const r of respuestas) {
    const valor =
      typeof r.valores === "object" && r.valores !== null && "opcion" in r.valores
        ? String((r.valores as { opcion: unknown }).opcion)
        : String(r.valores);
    const clave = `${r.pregunta} ${valor}`;
    m.set(clave, (m.get(clave) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([clave, conteo]) => {
      const [pregunta, opcion] = clave.split(" ");
      return { pregunta, opcion, conteo };
    })
    .sort((a, b) => a.pregunta.localeCompare(b.pregunta) || b.conteo - a.conteo);
}
