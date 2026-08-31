import { describe, expect, it } from "vitest";
import {
  cabeEnFranja,
  calcularOpciones,
  capacidadEfectiva,
  cargaPedido,
  esElegible,
  holgura,
  relacionPicoPromedio,
  validarPedido,
  type FranjaCapacidad,
  type LineaPedido,
  type ParametrosComercio,
} from "@/core/admision";

const params: ParametrosComercio = {
  factorSeguridad: 0.85,
  tiempoMinAnticipable: 3,
};

function producto(
  id: string,
  t: number,
  extra: Partial<{ anticipable: boolean; disponible: boolean }> = {},
) {
  return {
    id,
    tiempoPreparacionMin: t,
    anticipable: extra.anticipable ?? true,
    disponible: extra.disponible ?? true,
  };
}

function franja(
  id: string,
  minutoInicio: number,
  capacidad: number,
  carga = 0,
  abierta = true,
): FranjaCapacidad {
  const base = new Date("2026-09-01T12:00:00Z").getTime();
  return {
    id,
    inicio: new Date(base + minutoInicio * 60_000),
    fin: new Date(base + (minutoInicio + 10) * 60_000),
    capacidadMinutos: capacidad,
    cargaAsignada: carga,
    abierta,
  };
}

describe("w(i) — carga del pedido en minutos-cocina", () => {
  it("suma tiempo de preparación por cantidad", () => {
    const lineas: LineaPedido[] = [
      { producto: producto("pizza", 10), cantidad: 2 },
      { producto: producto("cafe", 3), cantidad: 1 },
    ];
    expect(cargaPedido(lineas)).toBe(23);
  });

  it("distingue diez cafés de diez almuerzos (ADR-02)", () => {
    const cafes = cargaPedido([{ producto: producto("cafe", 3), cantidad: 10 }]);
    const almuerzos = cargaPedido([
      { producto: producto("almuerzo", 12), cantidad: 10 },
    ]);
    // Un contador de pedidos los trataría igual: 10 = 10. El modelo no.
    expect(cafes).toBe(30);
    expect(almuerzos).toBe(120);
    expect(almuerzos).toBeGreaterThan(cafes);
  });
});

describe("criterio de elegibilidad t(p) >= t_min (§6.3)", () => {
  it("acepta un producto por encima del umbral", () => {
    expect(esElegible(producto("pizza", 10), params)).toBe(true);
  });

  it("rechaza un producto de preparación casi nula", () => {
    expect(esElegible(producto("chicle", 0), params)).toBe(false);
  });

  it("rechaza aunque supere t_min si el comercio no lo marcó anticipable", () => {
    expect(
      esElegible(producto("pizza", 10, { anticipable: false }), params),
    ).toBe(false);
  });

  it("rechaza un producto no disponible", () => {
    expect(
      esElegible(producto("pizza", 10, { disponible: false }), params),
    ).toBe(false);
  });

  it("acepta exactamente en el umbral (borde inclusivo)", () => {
    expect(esElegible(producto("jugo", 3), params)).toBe(true);
  });
});

describe("validarPedido", () => {
  it("rechaza el pedido vacío", () => {
    expect(validarPedido([], params)).toMatchObject({
      valido: false,
      motivo: "PEDIDO_VACIO",
    });
  });

  it("rechaza cantidades no enteras o menores a 1", () => {
    expect(
      validarPedido([{ producto: producto("p", 5), cantidad: 0 }], params),
    ).toMatchObject({ motivo: "CANTIDAD_INVALIDA" });
    expect(
      validarPedido([{ producto: producto("p", 5), cantidad: 1.5 }], params),
    ).toMatchObject({ motivo: "CANTIDAD_INVALIDA" });
  });

  it("señala cuál producto no es elegible", () => {
    const r = validarPedido(
      [
        { producto: producto("pizza", 10), cantidad: 1 },
        { producto: producto("chicle", 1), cantidad: 1 },
      ],
      params,
    );
    expect(r).toMatchObject({
      valido: false,
      motivo: "PRODUCTO_NO_ELEGIBLE",
      detalle: "chicle",
    });
  });

  it("devuelve la carga cuando es válido", () => {
    const r = validarPedido(
      [{ producto: producto("pizza", 10), cantidad: 2 }],
      params,
    );
    expect(r).toMatchObject({ valido: true, carga: 20 });
  });
});

describe("regla de admisión: carga + w <= alfa * C", () => {
  it("alfa recorta la capacidad teórica", () => {
    expect(capacidadEfectiva({ capacidadMinutos: 100 }, 0.85)).toBe(85);
  });

  it("admite justo en el borde", () => {
    // C=100, alfa=0.85 -> 85 minutos comprometibles. Carga 80 + w 5 = 85.
    expect(cabeEnFranja(franja("f", 0, 100, 80), 5, 0.85)).toBe(true);
  });

  it("rechaza un minuto por encima del borde", () => {
    expect(cabeEnFranja(franja("f", 0, 100, 80), 6, 0.85)).toBe(false);
  });

  it("con alfa = 1 se compromete el 100% de la capacidad teórica", () => {
    expect(cabeEnFranja(franja("f", 0, 100, 95), 5, 1)).toBe(true);
  });

  it("una franja cerrada no admite nada", () => {
    expect(cabeEnFranja(franja("f", 0, 100, 0, false), 1, 0.85)).toBe(false);
  });

  it("la holgura nunca es negativa aunque haya sobrecarga histórica", () => {
    expect(holgura(franja("f", 0, 100, 200), 0.85)).toBe(0);
  });
});

describe("calcularOpciones — variable experimental (§6.4)", () => {
  // f1 casi llena, f2 vacía, f3 a medias.
  const franjas = [
    franja("f1", 0, 100, 70),
    franja("f2", 10, 100, 0),
    franja("f3", 20, 100, 40),
  ];

  it("A destaca la franja que el usuario pidió si cabe", () => {
    const r = calcularOpciones(franjas, 10, 0.85, "A", "f1");
    expect(r.solicitadaDisponible).toBe(true);
    expect(r.sugeridaId).toBe("f1");
  });

  it("B destaca la franja que mejor aplana la carga, no la pedida", () => {
    const r = calcularOpciones(franjas, 10, 0.85, "B", "f1");
    expect(r.sugeridaId).toBe("f2");
    // pero f1 sigue ofrecida: B sugiere, no obliga.
    expect(r.opciones.map((o) => o.franjaId)).toContain("f1");
  });

  it("ambas condiciones ofrecen exactamente el mismo conjunto de franjas", () => {
    const a = calcularOpciones(franjas, 10, 0.85, "A", "f1");
    const b = calcularOpciones(franjas, 10, 0.85, "B", "f1");
    expect(a.opciones.map((o) => o.franjaId).sort()).toEqual(
      b.opciones.map((o) => o.franjaId).sort(),
    );
  });

  it("no ofrece franjas sin espacio suficiente", () => {
    // w = 20: f1 (70+20=90 > 85) queda fuera.
    const r = calcularOpciones(franjas, 20, 0.85, "A", "f1");
    expect(r.solicitadaDisponible).toBe(false);
    expect(r.opciones.map((o) => o.franjaId)).toEqual(["f2", "f3"]);
  });

  it("cuando la pedida no cabe, A propone la siguiente cronológica con espacio", () => {
    const r = calcularOpciones(franjas, 20, 0.85, "A", "f1");
    expect(r.sugeridaId).toBe("f2");
  });

  it("no hay sugerida si ninguna franja admite el pedido", () => {
    const r = calcularOpciones(franjas, 500, 0.85, "B", "f1");
    expect(r.opciones).toEqual([]);
    expect(r.sugeridaId).toBeNull();
  });

  it("las opciones vienen en orden cronológico", () => {
    const desordenadas = [franjas[2], franjas[0], franjas[1]];
    const r = calcularOpciones(desordenadas, 5, 0.85, "A", "f1");
    expect(r.opciones.map((o) => o.franjaId)).toEqual(["f1", "f2", "f3"]);
  });

  it("respeta el máximo de opciones pero nunca oculta la sugerida", () => {
    const muchas = Array.from({ length: 10 }, (_, i) =>
      franja("g" + i, i * 10, 100, i === 9 ? 0 : 80),
    );
    // La menos cargada es la última: con maxOpciones=3 debe aparecer igual.
    const r = calcularOpciones(muchas, 5, 0.85, "B", "g0", 3);
    expect(r.sugeridaId).toBe("g9");
    expect(r.opciones.find((o) => o.franjaId === "g9")?.sugerida).toBe(true);
  });
});

describe("relación pico/promedio — indicador 3", () => {
  it("vale 1 con carga perfectamente plana", () => {
    expect(relacionPicoPromedio([50, 50, 50])).toBe(1);
  });

  it("crece cuando la demanda se concentra", () => {
    expect(relacionPicoPromedio([150, 0, 0])).toBe(3);
  });

  it("es 0 si no hubo carga", () => {
    expect(relacionPicoPromedio([0, 0, 0])).toBe(0);
    expect(relacionPicoPromedio([])).toBe(0);
  });
});
