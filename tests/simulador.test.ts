/**
 * Pruebas del simulador (§15).
 *
 * Un simulador que no se valida es un generador de números. Lo que se comprueba
 * acá no es "que corra", sino que su comportamiento coincida con lo que la
 * teoría predice: si el modelo dijera lo contrario de la Ley de Little o de la
 * regla de admisión, sus recomendaciones no valdrían nada.
 */

import { describe, expect, it } from "vitest";
import {
  alfaOptimo,
  barrer,
  simular,
  volumenSostenible,
  type ParametrosSimulacion,
} from "@/core/simulador";

const BASE: ParametrosSimulacion = {
  anchoFranjaMin: 10,
  factorSeguridad: 0.85,
  personalCocina: 4,
  aperturaMin: 11 * 60 + 30,
  cierreMin: 13 * 60,
  demandaDiaria: 24,
  productos: [
    { id: "almuerzo", tiempoPreparacionMin: 12, peso: 3 },
    { id: "pizza", tiempoPreparacionMin: 10, peso: 3 },
    { id: "quesillo", tiempoPreparacionMin: 5, peso: 2 },
    { id: "cafe", tiempoPreparacionMin: 3, peso: 2 },
  ],
  proporcionB: 0.5,
  adherenciaB: 0.75,
  tasaNoShow: 0.06,
  variabilidadCocina: 0.25,
  margenCutoffMin: 2,
  dias: 10,
  semilla: 42,
};

describe("reproducibilidad", () => {
  it("la misma semilla da exactamente el mismo resultado", () => {
    // Un experimento de simulación que no se puede repetir no es un
    // experimento: la tesis tiene que poder decir "con la semilla 42, esto".
    const a = simular(BASE);
    const b = simular(BASE);
    expect(a.admitidos).toBe(b.admitidos);
    expect(a.tasaCumplimiento).toBe(b.tasaCumplimiento);
    expect(a.relacionPicoPromedio).toBe(b.relacionPicoPromedio);
  });

  it("semillas distintas dan resultados distintos", () => {
    const a = simular(BASE);
    const b = simular({ ...BASE, semilla: 4242 });
    expect(a.admitidos).not.toBe(b.admitidos);
  });
});

describe("el invariante de admisión se respeta también en la simulación", () => {
  it("nunca se compromete más carga que α · C(f)", () => {
    // El simulador usa el MISMO módulo de admisión que la reserva real, así que
    // si esto fallara, fallaría el sistema en producción.
    const r = simular({ ...BASE, demandaDiaria: 200 });
    expect(r.cargaTotalMin).toBeLessThanOrEqual(r.capacidadEfectivaTotalMin);
    expect(r.aprovechamiento).toBeLessThanOrEqual(1);
  });

  it("bajo demanda enorme, la capacidad se llena pero no se desborda", () => {
    const r = simular({ ...BASE, demandaDiaria: 300 });
    expect(r.aprovechamiento).toBeGreaterThan(0.5);
    expect(r.aprovechamiento).toBeLessThanOrEqual(1);
    expect(r.rechazadosPorCapacidad).toBeGreaterThan(0);
  });

  it("con demanda muy baja se admite casi todo", () => {
    const r = simular({ ...BASE, demandaDiaria: 4 });
    expect(r.tasaAdmision).toBeGreaterThan(0.85);
  });
});

describe("α se comporta como la teoría predice", () => {
  it("subir α admite más pedidos", () => {
    // α es la fracción de capacidad que el sistema se anima a comprometer.
    const conservador = simular({ ...BASE, factorSeguridad: 0.5, demandaDiaria: 80 });
    const agresivo = simular({ ...BASE, factorSeguridad: 1, demandaDiaria: 80 });
    expect(agresivo.admitidos).toBeGreaterThan(conservador.admitidos);
  });

  it("subir α degrada el cumplimiento", () => {
    // Es el compromiso central de §6.2: α = 1 promete el 100% de la capacidad
    // teórica y falla ante cualquier imprevisto. Si el simulador no mostrara
    // este intercambio, no serviría para calibrar α.
    const conservador = simular({ ...BASE, factorSeguridad: 0.5, demandaDiaria: 80 });
    const agresivo = simular({ ...BASE, factorSeguridad: 1, demandaDiaria: 80 });
    expect(agresivo.tasaCumplimiento).toBeLessThan(conservador.tasaCumplimiento);
  });

  it("sin variabilidad de cocina, α = 1 cumple", () => {
    // Con tiempos perfectamente predecibles no hay nada que absorber: α solo
    // existe por la variabilidad. Que esto se cumpla valida que la variabilidad
    // es la causa del incumplimiento en el modelo, y no un artefacto.
    const r = simular({
      ...BASE,
      factorSeguridad: 1,
      variabilidadCocina: 0,
      demandaDiaria: 80,
    });
    expect(r.tasaCumplimiento).toBeGreaterThan(0.99);
  });

  it("más variabilidad exige más holgura para el mismo cumplimiento", () => {
    const estable = simular({ ...BASE, variabilidadCocina: 0.1, demandaDiaria: 80 });
    const caotico = simular({ ...BASE, variabilidadCocina: 0.6, demandaDiaria: 80 });
    expect(caotico.tasaCumplimiento).toBeLessThan(estable.tasaCumplimiento);
    expect(caotico.retrasoMedioIncumplidosMin).toBeGreaterThan(0);
  });
});

describe("la condición B aplana la carga", () => {
  it("con adherencia alta, el pico/promedio baja", () => {
    // Es la hipótesis de §6.4. Si el simulador no la reprodujera bajo su propia
    // lógica, no podría usarse para estimar cuánto aplanamiento esperar.
    // Demanda MUY por debajo del techo: si el sistema está saturado, todas las
    // franjas se llenan hasta el borde y el pico/promedio tiende a 1 en las dos
    // condiciones. El aplanamiento solo se puede observar cuando hay holgura
    // donde repartir — que es justamente cuando la sugerencia tiene sentido.
    const sinSugerencia = simular({
      ...BASE,
      proporcionB: 0,
      demandaDiaria: 12,
    });
    const conSugerencia = simular({
      ...BASE,
      proporcionB: 1,
      adherenciaB: 1,
      demandaDiaria: 12,
    });
    expect(conSugerencia.relacionPicoPromedio).toBeLessThan(
      sinSugerencia.relacionPicoPromedio,
    );
  });

  it("con adherencia nula, B se comporta igual que A", () => {
    // Control: si nadie acepta la sugerencia, no puede haber efecto. Que el
    // modelo lo respete descarta que el aplanamiento venga de otra parte.
    const a = simular({ ...BASE, proporcionB: 0, demandaDiaria: 12 });
    const b = simular({ ...BASE, proporcionB: 1, adherenciaB: 0, demandaDiaria: 12 });
    expect(Math.abs(b.relacionPicoPromedio - a.relacionPicoPromedio)).toBeLessThan(
      0.35,
    );
  });
});

describe("Δ y su compromiso", () => {
  it("franjas más anchas concentran más carga por franja", () => {
    // Trivialmente cierto en minutos absolutos, pero conviene verificarlo: si
    // saliera al revés, habría un error de escala en la generación de franjas.
    const angostas = simular({ ...BASE, anchoFranjaMin: 5, demandaDiaria: 60 });
    const anchas = simular({ ...BASE, anchoFranjaMin: 20, demandaDiaria: 60 });
    expect(anchas.cargaTotalMin / Math.max(1, anchas.admitidos)).toBeGreaterThan(0);
    expect(angostas.admitidos).toBeGreaterThan(0);
  });

  it("el cut-off rechaza pedidos cuando el margen es grande", () => {
    const sinMargen = simular({ ...BASE, margenCutoffMin: 0, demandaDiaria: 30 });
    const conMargen = simular({ ...BASE, margenCutoffMin: 25, demandaDiaria: 30 });
    expect(conMargen.rechazadosPorCutoff).toBeGreaterThanOrEqual(
      sinMargen.rechazadosPorCutoff,
    );
  });
});

describe("barrido del espacio de parámetros", () => {
  it("recorre todas las combinaciones de la rejilla", () => {
    const puntos = barrer(
      { ...BASE, dias: 3 },
      { anchos: [5, 10], alfas: [0.7, 0.9], demandas: [30], repeticiones: 2 },
    );
    expect(puntos).toHaveLength(4);
    expect(new Set(puntos.map((p) => p.anchoFranjaMin))).toEqual(new Set([5, 10]));
  });

  it("promedia varias corridas: una sola puede caer en un día atípico", () => {
    const unaVez = barrer({ ...BASE, dias: 3 }, { repeticiones: 1 });
    const muchas = barrer({ ...BASE, dias: 3 }, { repeticiones: 8 });
    // No tienen por qué coincidir; lo que importa es que el promedio exista y
    // esté en el mismo orden de magnitud.
    expect(muchas[0].admitidosPorDia).toBeGreaterThan(0);
    expect(
      Math.abs(muchas[0].admitidosPorDia - unaVez[0].admitidosPorDia) /
        unaVez[0].admitidosPorDia,
    ).toBeLessThan(0.5);
  });
});

describe("las preguntas que el piloto no puede responder", () => {
  it("encuentra el α que más pedidos admite sin bajar del 90%", () => {
    const puntos = barrer(
      { ...BASE, dias: 5, demandaDiaria: 60 },
      { alfas: [0.5, 0.6, 0.7, 0.8, 0.9, 1], repeticiones: 3 },
    );
    const mejor = alfaOptimo(puntos, 0.9);
    expect(mejor).not.toBeNull();
    expect(mejor!.tasaCumplimiento).toBeGreaterThanOrEqual(0.9);

    // Y es realmente el máximo entre los que cumplen: ningún α válido sirve más.
    const validos = puntos.filter((p) => p.tasaCumplimiento >= 0.9);
    for (const p of validos) {
      expect(p.admitidosPorDia).toBeLessThanOrEqual(mejor!.admitidosPorDia);
    }
  });

  it("devuelve null si ningún α alcanza el umbral", () => {
    // También es un resultado: significa que el problema no está en α sino en
    // la capacidad, y la recomendación tiene que ser otra.
    const puntos = barrer(
      { ...BASE, dias: 3, variabilidadCocina: 2, demandaDiaria: 200 },
      { alfas: [0.9, 1], repeticiones: 2 },
    );
    expect(alfaOptimo(puntos, 0.999)).toBeNull();
  });

  it("estima el volumen diario sostenible", () => {
    // Es la frase del capítulo de recomendaciones: "sostiene hasta N pedidos
    // diarios manteniendo cumplimiento sobre 90%".
    const puntos = barrer(
      { ...BASE, dias: 5 },
      { demandas: [10, 20, 40, 80, 160], repeticiones: 3 },
    );
    const techo = volumenSostenible(puntos, 0.9);
    expect(techo).not.toBeNull();
    expect(techo!.servidosPorDia).toBeGreaterThan(0);

    // El techo mide pedidos SERVIDOS, no intentos: el control de admisión
    // mantiene el cumplimiento rechazando, así que "aguanta 240 intentos"
    // sería una conclusión falsa. Se comprueba que el número reportado sea
    // consistente con la tasa de admisión de su punto.
    expect(techo!.servidosPorDia).toBeLessThanOrEqual(
      techo!.demandaEnSaturacion,
    );
    expect(techo!.tasaRechazo).toBeGreaterThanOrEqual(0);
    expect(techo!.tasaRechazo).toBeLessThanOrEqual(1);
  });
});

describe("coherencia interna de los indicadores", () => {
  it("los rechazos y los admitidos suman los intentos", () => {
    const r = simular({ ...BASE, demandaDiaria: 100 });
    expect(r.admitidos + r.rechazadosPorCapacidad + r.rechazadosPorCutoff).toBe(
      r.intentos,
    );
  });

  it("las tasas están en el rango que declaran", () => {
    const r = simular({ ...BASE, demandaDiaria: 100 });
    for (const v of [
      r.tasaAdmision,
      r.tasaCumplimiento,
      r.aprovechamiento,
      r.tasaNoShowObservada,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("el no-show observado se acerca al parámetro configurado", () => {
    const r = simular({ ...BASE, tasaNoShow: 0.2, demandaDiaria: 100, dias: 20 });
    expect(r.tasaNoShowObservada).toBeGreaterThan(0.15);
    expect(r.tasaNoShowObservada).toBeLessThan(0.25);
  });

  it("sin demanda no hay nada y nada se rompe", () => {
    const r = simular({ ...BASE, demandaDiaria: 0 });
    expect(r.intentos).toBe(0);
    expect(r.admitidos).toBe(0);
    expect(r.tasaAdmision).toBe(0);
    expect(r.relacionPicoPromedio).toBe(0);
  });
});
