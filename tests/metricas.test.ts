import { describe, expect, it } from "vitest";
import {
  cargaPorFranja,
  compararAB,
  embudoPorCanal,
  resumir,
  tiempoActivacionMedianaMin,
  tiempoRecuperadoMin,
  type PedidoMetrica,
} from "@/core/metricas";

const T = (iso: string) => new Date(iso);

function pedido(p: Partial<PedidoMetrica> = {}): PedidoMetrica {
  return {
    id: crypto.randomUUID(),
    condicionExperimental: "A",
    franjaId: "f1",
    cargaEstimadaMin: 10,
    estado: "RETIRADO",
    cumplimiento: "CUMPLIDO",
    creadoEn: T("2026-09-01T11:00:00Z"),
    franjaInicio: T("2026-09-01T12:00:00Z"),
    franjaFin: T("2026-09-01T12:10:00Z"),
    listoEn: T("2026-09-01T12:05:00Z"),
    retiradoEn: T("2026-09-01T12:08:00Z"),
    canalCaptacion: "qr_mostrador",
    ...p,
  };
}

describe("indicador 2 — tasa de cumplimiento", () => {
  it("cuenta cumplidos sobre pedidos CON VEREDICTO, no sobre todos", () => {
    // Incluir los PENDIENTE inflaría el incumplimiento al inicio de la franja.
    const r = resumir([
      pedido({ cumplimiento: "CUMPLIDO" }),
      pedido({ cumplimiento: "CUMPLIDO" }),
      pedido({ cumplimiento: "INCUMPLIDO" }),
      pedido({ cumplimiento: "PENDIENTE", estado: "EN_PREPARACION" }),
      pedido({ cumplimiento: "NO_APLICA", estado: "CANCELADO" }),
    ]);
    expect(r.tasaCumplimiento).toBeCloseTo(2 / 3);
  });

  it("es null si todavía no hay ningún veredicto", () => {
    const r = resumir([pedido({ cumplimiento: "PENDIENTE" })]);
    expect(r.tasaCumplimiento).toBeNull();
  });

  it("detecta si se alcanza la meta del 90%", () => {
    const pedidos = [
      ...Array.from({ length: 9 }, () => pedido({ cumplimiento: "CUMPLIDO" })),
      pedido({ cumplimiento: "INCUMPLIDO" }),
    ];
    expect(resumir(pedidos).tasaCumplimiento).toBeCloseTo(0.9);
  });
});

describe("indicador 3 — relación pico/promedio", () => {
  it("suma la carga por franja ignorando los cancelados", () => {
    const m = cargaPorFranja([
      pedido({ franjaId: "f1", cargaEstimadaMin: 10 }),
      pedido({ franjaId: "f1", cargaEstimadaMin: 20 }),
      pedido({ franjaId: "f2", cargaEstimadaMin: 5 }),
      // Cancelado: devolvió su capacidad, no debe contar como carga.
      pedido({ franjaId: "f2", cargaEstimadaMin: 99, estado: "CANCELADO" }),
    ]);
    expect(m.get("f1")).toBe(30);
    expect(m.get("f2")).toBe(5);
  });

  it("es menor cuando la carga está repartida", () => {
    const concentrado = resumir([
      pedido({ franjaId: "f1", cargaEstimadaMin: 90 }),
      pedido({ franjaId: "f2", cargaEstimadaMin: 5 }),
      pedido({ franjaId: "f3", cargaEstimadaMin: 5 }),
    ]);
    const plano = resumir([
      pedido({ franjaId: "f1", cargaEstimadaMin: 33 }),
      pedido({ franjaId: "f2", cargaEstimadaMin: 33 }),
      pedido({ franjaId: "f3", cargaEstimadaMin: 34 }),
    ]);
    expect(plano.relacionPicoPromedio).toBeLessThan(
      concentrado.relacionPicoPromedio,
    );
    expect(plano.relacionPicoPromedio).toBeCloseTo(1, 1);
  });
});

describe("indicador 4 — tasa de no-show", () => {
  it("se mide sobre los pedidos que llegaron a entregarse", () => {
    // Un pedido que nunca se preparó no pudo ser plantado por el usuario.
    const r = resumir([
      pedido({ estado: "RETIRADO" }),
      pedido({ estado: "RETIRADO" }),
      pedido({ estado: "RETIRADO" }),
      pedido({ estado: "NO_SHOW" }),
      pedido({ estado: "CANCELADO" }),
      pedido({ estado: "EN_PREPARACION" }),
    ]);
    expect(r.tasaNoShow).toBeCloseTo(0.25);
  });

  it("es null si no hubo entregas todavía", () => {
    expect(resumir([pedido({ estado: "RECIBIDO" })]).tasaNoShow).toBeNull();
  });
});

describe("comparación A/B — la hipótesis de §6.4", () => {
  it("delta negativo en pico/promedio significa que B aplanó la carga", () => {
    const pedidos = [
      // A concentra todo en una franja.
      pedido({ condicionExperimental: "A", franjaId: "a1", cargaEstimadaMin: 80 }),
      pedido({ condicionExperimental: "A", franjaId: "a2", cargaEstimadaMin: 10 }),
      pedido({ condicionExperimental: "A", franjaId: "a3", cargaEstimadaMin: 10 }),
      // B se reparte.
      pedido({ condicionExperimental: "B", franjaId: "b1", cargaEstimadaMin: 33 }),
      pedido({ condicionExperimental: "B", franjaId: "b2", cargaEstimadaMin: 33 }),
      pedido({ condicionExperimental: "B", franjaId: "b3", cargaEstimadaMin: 34 }),
    ];
    const c = compararAB(pedidos);
    expect(c.a.pedidos).toBe(3);
    expect(c.b.pedidos).toBe(3);
    expect(c.deltaPicoPromedio).toBeLessThan(0);
    expect(c.todas.pedidos).toBe(6);
  });

  it("no reporta delta si una condición no tiene datos todavía", () => {
    // Un delta contra una condición vacía se leería como hipótesis confirmada
    // cuando en realidad no hay con qué comparar.
    const c = compararAB([
      pedido({ condicionExperimental: "A", cargaEstimadaMin: 30 }),
    ]);
    expect(c.b.pedidos).toBe(0);
    expect(c.deltaPicoPromedio).toBeNull();
  });

  it("delta de cumplimiento cercano a 0 = B no degradó el servicio", () => {
    const pedidos = [
      pedido({ condicionExperimental: "A", cumplimiento: "CUMPLIDO" }),
      pedido({ condicionExperimental: "B", cumplimiento: "CUMPLIDO" }),
    ];
    expect(compararAB(pedidos).deltaCumplimiento).toBe(0);
  });

  it("delta null si a alguna condición le falta veredicto", () => {
    const pedidos = [
      pedido({ condicionExperimental: "A", cumplimiento: "CUMPLIDO" }),
      pedido({ condicionExperimental: "B", cumplimiento: "PENDIENTE" }),
    ];
    expect(compararAB(pedidos).deltaCumplimiento).toBeNull();
  });

  it("no se rompe con el conjunto vacío", () => {
    const c = compararAB([]);
    expect(c.a.pedidos).toBe(0);
    expect(c.a.tasaCumplimiento).toBeNull();
    expect(c.a.relacionPicoPromedio).toBe(0);
  });
});

describe("embudo del QR (§14.4)", () => {
  it("calcula la activación por canal de captación", () => {
    const e = embudoPorCanal([
      { canalCaptacion: "qr_mostrador", primerPedidoEn: T("2026-09-01T12:00:00Z") },
      { canalCaptacion: "qr_mostrador", primerPedidoEn: null },
      { canalCaptacion: "qr_pasillo", primerPedidoEn: T("2026-09-01T12:00:00Z") },
      { canalCaptacion: null, primerPedidoEn: null },
    ]);
    const mostrador = e.find((x) => x.canal === "qr_mostrador")!;
    expect(mostrador.registros).toBe(2);
    expect(mostrador.tasaActivacion).toBe(0.5);
    expect(e.find((x) => x.canal === "qr_pasillo")!.tasaActivacion).toBe(1);
    expect(e.find((x) => x.canal === "sin_canal")!.tasaActivacion).toBe(0);
  });

  it("ordena por volumen de registros", () => {
    const e = embudoPorCanal([
      { canalCaptacion: "whatsapp", primerPedidoEn: null },
      { canalCaptacion: "qr_mostrador", primerPedidoEn: null },
      { canalCaptacion: "qr_mostrador", primerPedidoEn: null },
    ]);
    expect(e[0].canal).toBe("qr_mostrador");
  });
});

describe("tiempo de activación", () => {
  it("mediana de minutos entre registro y primer pedido", () => {
    const m = tiempoActivacionMedianaMin([
      { creadoEn: T("2026-09-01T12:00:00Z"), primerPedidoEn: T("2026-09-01T12:10:00Z") },
      { creadoEn: T("2026-09-01T12:00:00Z"), primerPedidoEn: T("2026-09-01T12:30:00Z") },
      // Registrado y nunca activado: no entra en la mediana.
      { creadoEn: T("2026-09-01T12:00:00Z"), primerPedidoEn: null },
    ]);
    expect(m).toBe(20);
  });

  it("es null si nadie se activó todavía", () => {
    expect(
      tiempoActivacionMedianaMin([
        { creadoEn: T("2026-09-01T12:00:00Z"), primerPedidoEn: null },
      ]),
    ).toBeNull();
  });
});

describe("indicador 1 — tiempo de receso recuperado", () => {
  it("reproduce el caso del documento maestro: 10+10 → 2 min", () => {
    const r = tiempoRecuperadoMin({
      esperaFilaBaseMin: 10,
      preparacionBaseMin: 10,
      permanenciaConSistemaMin: 2,
    });
    expect(r.recuperadoMin).toBe(18);
    expect(r.reduccion).toBeCloseTo(0.9);
  });

  it("alcanza la meta de reducción ≥ 50%", () => {
    const r = tiempoRecuperadoMin({
      esperaFilaBaseMin: 6,
      preparacionBaseMin: 6,
      permanenciaConSistemaMin: 6,
    });
    expect(r.reduccion).toBeCloseTo(0.5);
  });

  it("no inventa la línea base: sale de los parámetros medidos", () => {
    const r = tiempoRecuperadoMin({
      esperaFilaBaseMin: 0,
      preparacionBaseMin: 0,
      permanenciaConSistemaMin: 0,
    });
    expect(r.reduccion).toBe(0);
  });
});
