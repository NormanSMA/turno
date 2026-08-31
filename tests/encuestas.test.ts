import { describe, expect, it } from "vitest";
import {
  interpretarSus,
  preguntasCuantitativas,
  promedioMinutos,
  ITEMS_SUS,
  preguntaDelDia,
  PREGUNTAS_MICRO,
  puntajeSus,
  RespuestasSusInvalidas,
  resumirMicro,
  resumirSus,
} from "@/core/encuestas";

describe("cálculo del SUS", () => {
  it("todo el acuerdo posible da 100", () => {
    // Positivos en 5 y negativos en 1: el mejor puntaje posible.
    const respuestas = ITEMS_SUS.map((i) => (i.positivo ? 5 : 1));
    expect(puntajeSus(respuestas)).toBe(100);
  });

  it("todo el desacuerdo posible da 0", () => {
    const respuestas = ITEMS_SUS.map((i) => (i.positivo ? 1 : 5));
    expect(puntajeSus(respuestas)).toBe(0);
  });

  it("todo neutral da 50", () => {
    expect(puntajeSus(Array(10).fill(3))).toBe(50);
  });

  it("marcar la misma columna en todo NO da 50: la alternancia importa", () => {
    // Es el punto de que los ítems alternen signo. Quien marca 5 en todo no
    // obtiene un puntaje alto, porque estaría diciendo a la vez que es fácil y
    // que es complejo. Sin la alternancia, el instrumento no detectaría eso.
    expect(puntajeSus(Array(10).fill(5))).toBe(50);
    expect(puntajeSus(Array(10).fill(1))).toBe(50);
  });

  it("rechaza una cantidad incorrecta de respuestas", () => {
    expect(() => puntajeSus([5, 1, 5])).toThrow(RespuestasSusInvalidas);
    expect(() => puntajeSus(Array(11).fill(3))).toThrow(RespuestasSusInvalidas);
  });

  it("rechaza valores fuera de la escala", () => {
    expect(() => puntajeSus([...Array(9).fill(3), 6])).toThrow(
      RespuestasSusInvalidas,
    );
    expect(() => puntajeSus([...Array(9).fill(3), 0])).toThrow(
      RespuestasSusInvalidas,
    );
    expect(() => puntajeSus([...Array(9).fill(3), 3.5])).toThrow(
      RespuestasSusInvalidas,
    );
  });

  it("tiene exactamente diez ítems y alterna signo", () => {
    expect(ITEMS_SUS).toHaveLength(10);
    ITEMS_SUS.forEach((item, i) => {
      // Impares (índice par) positivos, pares negativos: el orden canónico.
      expect(item.positivo).toBe(i % 2 === 0);
    });
  });
});

describe("interpretación del puntaje", () => {
  it("68 es el límite de aceptable, que es la meta del indicador 7", () => {
    expect(interpretarSus(67.5)).toBe("pobre");
    expect(interpretarSus(68)).toBe("aceptable");
  });

  it("cubre toda la escala", () => {
    expect(interpretarSus(20)).toBe("inaceptable");
    expect(interpretarSus(60)).toBe("pobre");
    expect(interpretarSus(75)).toBe("aceptable");
    expect(interpretarSus(85)).toBe("bueno");
    expect(interpretarSus(95)).toBe("excelente");
  });
});

describe("resumen de una cohorte", () => {
  it("promedia, saca mediana y cuenta cuántos superan el umbral", () => {
    const r = resumirSus([60, 70, 80, 90], 68);
    expect(r.respuestas).toBe(4);
    expect(r.promedio).toBe(75);
    expect(r.mediana).toBe(75);
    expect(r.sobreUmbral).toBe(0.75);
    expect(r.adjetivo).toBe("aceptable");
  });

  it("mediana con cantidad impar", () => {
    expect(resumirSus([10, 50, 90]).mediana).toBe(50);
  });

  it("no se rompe sin respuestas y NO inventa un cero", () => {
    // Devolver 0 sería peor que null: se leería como "usabilidad pésima" en vez
    // de "todavía nadie contestó".
    const r = resumirSus([]);
    expect(r.respuestas).toBe(0);
    expect(r.promedio).toBeNull();
    expect(r.adjetivo).toBeNull();
  });
});

describe("micro-encuesta", () => {
  it("todas las preguntas tienen id, texto y al menos dos opciones", () => {
    for (const p of PREGUNTAS_MICRO) {
      expect(p.id).toMatch(/^[a-z_]+$/);
      expect(p.texto.length).toBeGreaterThan(5);
      expect(p.opciones.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("los identificadores no se repiten", () => {
    const ids = PREGUNTAS_MICRO.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("la pregunta del día es la misma para todos ese día", () => {
    // Si rotara por usuario, cada pregunta tendría una muestra distinta y los
    // días no se podrían comparar entre sí.
    const manana = new Date("2026-09-01T08:00:00Z");
    const tarde = new Date("2026-09-01T20:00:00Z");
    expect(preguntaDelDia(manana).id).toBe(preguntaDelDia(tarde).id);
  });

  it("rota entre días", () => {
    const ids = new Set(
      Array.from({ length: PREGUNTAS_MICRO.length }, (_, i) =>
        preguntaDelDia(new Date(2026, 8, 1 + i)).id,
      ),
    );
    expect(ids.size).toBe(PREGUNTAS_MICRO.length);
  });

  it("las preguntas cuantitativas traen minutos en todas sus opciones", () => {
    // Si una opción no tuviera minutos, el promedio la ignoraría en silencio y
    // el número saldría sesgado hacia las que sí los tienen.
    for (const p of preguntasCuantitativas()) {
      for (const o of p.opciones) {
        expect(o.minutos, `${p.id}/${o.valor}`).toBeTypeOf("number");
      }
    }
  });

  it("promedia las respuestas en minutos", () => {
    // Es lo que convierte la micro-encuesta en un dato del Capítulo V:
    // "bastante" y "poco" no se pueden promediar ni comparar con la línea base.
    const r = promedioMinutos(
      [
        { pregunta: "tiempo_ahorrado", valores: { opcion: "10" } },
        { pregunta: "tiempo_ahorrado", valores: { opcion: "20" } },
        { pregunta: "tiempo_ahorrado", valores: { opcion: "15" } },
        // De otra pregunta: no debe contaminar el promedio.
        { pregunta: "espera_retiro", valores: { opcion: "0" } },
      ],
      "tiempo_ahorrado",
    );
    expect(r.respuestas).toBe(3);
    expect(r.promedioMin).toBeCloseTo(15);
    expect(r.medianaMin).toBe(15);
  });

  it("no promedia una pregunta que no es cuantitativa", () => {
    const r = promedioMinutos(
      [{ pregunta: "volveria", valores: { opcion: "si" } }],
      "volveria",
    );
    expect(r.promedioMin).toBeNull();
  });

  it("sin respuestas devuelve null y no cero", () => {
    // Un cero se leería como "no ahorró nada" en vez de "nadie contestó".
    const r = promedioMinutos([], "tiempo_ahorrado");
    expect(r.respuestas).toBe(0);
    expect(r.promedioMin).toBeNull();
  });

  it("resume los conteos por pregunta y opción", () => {
    const r = resumirMicro([
      { pregunta: "listo_a_tiempo", valores: { opcion: "si" } },
      { pregunta: "listo_a_tiempo", valores: { opcion: "si" } },
      { pregunta: "listo_a_tiempo", valores: { opcion: "espere_poco" } },
      { pregunta: "volveria", valores: { opcion: "si" } },
    ]);
    const listo = r.filter((x) => x.pregunta === "listo_a_tiempo");
    expect(listo[0]).toMatchObject({ opcion: "si", conteo: 2 });
    expect(r.find((x) => x.pregunta === "volveria")?.conteo).toBe(1);
  });
});
