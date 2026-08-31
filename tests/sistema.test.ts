/**
 * Consola del sistema.
 *
 * Lo que se verifica no es que las divisiones den: es que el diagnóstico no
 * dispare falsas alarmas ni esconda las verdaderas. Una consola que grita
 * cuando todo anda bien se ignora en una semana, y entonces no sirve el día que
 * sí hay que mirarla.
 */

import { describe, expect, it } from "vitest";
import {
  desviosPorComercio,
  desviosPorProducto,
  embudoOperativo,
  mediana,
  presionPorComercio,
  type FranjaSistema,
  type MuestraPreparacion,
} from "@/core/sistema";

function franja(p: Partial<FranjaSistema> = {}): FranjaSistema {
  return {
    comercio: "Cafetería",
    hora: "12:00",
    capacidadMinutos: 100,
    cargaAsignada: 50,
    factorSeguridad: 0.85,
    ...p,
  };
}

function muestra(p: Partial<MuestraPreparacion> = {}): MuestraPreparacion {
  return {
    comercio: "Cafetería",
    declarado: 10,
    real: 10,
    productoUnico: null,
    ...p,
  };
}

describe("mediana", () => {
  it("sin datos no devuelve cero", () => {
    // Cero se lee como "el valor es cero". `null` dice "no hay dato", que es lo
    // cierto, y la interfaz lo dibuja como una raya.
    expect(mediana([])).toBeNull();
  });

  it("promedia los dos centrales cuando la cantidad es par", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it("no altera el arreglo que recibe", () => {
    const xs = [3, 1, 2];
    mediana(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("presión de capacidad", () => {
  it("marca saturada la franja que llegó al tope de α, no al de C", () => {
    // α = 0.85 sobre 100 min: a los 85 el sistema YA rechaza, aunque la cocina
    // tenga 15 minutos libres. Medir contra C escondería el rechazo.
    const [p] = presionPorComercio([
      franja({ cargaAsignada: 85 }),
      franja({ hora: "12:10", cargaAsignada: 60 }),
    ]);
    expect(p?.saturadas).toBe(1);
  });

  it("una franja vacía no baja la ocupación media", () => {
    // "Abriste horas que nadie usó" y "cocinaste al 70 %" son dos problemas
    // distintos; mezclarlos esconde los dos.
    const [p] = presionPorComercio([
      franja({ cargaAsignada: 80 }),
      franja({ hora: "12:10", cargaAsignada: 60 }),
      franja({ hora: "12:20", cargaAsignada: 0 }),
    ]);
    expect(p?.ocupacionMedia).toBeCloseTo(0.7);
    expect(p?.vacias).toBe(1);
  });

  it("ordena primero el comercio con más franjas saturadas", () => {
    const r = presionPorComercio([
      franja({ comercio: "Tranquilo", cargaAsignada: 10 }),
      franja({ comercio: "Apretado", cargaAsignada: 95 }),
      franja({ comercio: "Apretado", hora: "12:10", cargaAsignada: 90 }),
    ]);
    expect(r[0]?.comercio).toBe("Apretado");
  });

  it("descarta franjas sin capacidad en vez de dividir por cero", () => {
    const r = presionPorComercio([franja({ capacidadMinutos: 0 })]);
    expect(r).toEqual([]);
  });
});

describe("calibración del modelo", () => {
  it("detecta que la cocina tarda más de lo prometido", () => {
    const [d] = desviosPorComercio(
      Array.from({ length: 6 }, () => muestra({ declarado: 10, real: 15 })),
    );
    expect(d?.factor).toBeCloseTo(1.5);
  });

  it("no concluye nada con pocas muestras", () => {
    // Un desvío calculado sobre dos pedidos es ruido con aspecto de dato, y
    // actuar sobre él es peor que no tener el dato.
    const pocas = [muestra({ real: 30 }), muestra({ real: 30 })];
    expect(desviosPorComercio(pocas)).toEqual([]);
  });

  it("usa la mediana, así un pedido olvidado no arrastra el diagnóstico", () => {
    const ms = [
      ...Array.from({ length: 6 }, () => muestra({ declarado: 10, real: 10 })),
      // Alguien no tocó el botón hasta una hora después. Con promedio esto
      // haría ver pésima a una cocina que anda bien.
      muestra({ declarado: 10, real: 90 }),
    ];
    const [d] = desviosPorComercio(ms);
    expect(d?.real).toBe(10);
    expect(d?.factor).toBe(1);
  });

  it("también señala prometer de más, no solo de menos", () => {
    // Reservar el doble del tiempo que se usa deja capacidad sin vender. Es un
    // problema distinto pero problema al fin, y el orden lo tiene que reflejar.
    const r = desviosPorComercio([
      ...Array.from({ length: 5 }, () =>
        muestra({ comercio: "Lento", declarado: 10, real: 12 }),
      ),
      ...Array.from({ length: 5 }, () =>
        muestra({ comercio: "Sobrado", declarado: 20, real: 10 }),
      ),
    ]);
    expect(r[0]?.clave).toBe("Sobrado");
  });

  it("por producto solo cuenta los pedidos de un único producto", () => {
    const r = desviosPorProducto([
      ...Array.from({ length: 5 }, () => muestra({ productoUnico: "Café" })),
      // Sin `productoUnico` no se puede atribuir el tiempo a un producto: el
      // pedido llevaba varios y la cocina los hizo juntos.
      ...Array.from({ length: 9 }, () => muestra({ productoUnico: null })),
    ]);
    expect(r.map((x) => x.clave)).toEqual(["Café"]);
    expect(r[0]?.muestras).toBe(5);
  });
});

describe("embudo operativo", () => {
  it("cuenta cada estado y la tasa de retiro", () => {
    const e = embudoOperativo([
      "RETIRADO",
      "RETIRADO",
      "NO_SHOW",
      "CANCELADO",
      "LISTO",
    ]);
    expect(e).toMatchObject({
      creados: 5,
      retirados: 2,
      noShows: 1,
      cancelados: 1,
      listos: 1,
    });
    expect(e.tasaRetiro).toBeCloseTo(0.4);
  });

  it("sin pedidos no inventa una tasa de cero", () => {
    expect(embudoOperativo([]).tasaRetiro).toBeNull();
  });
});
