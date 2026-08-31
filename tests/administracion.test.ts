import { describe, expect, it } from "vitest";
import {
  avisoAlCerrarFranja,
  avisoElegibilidad,
  capacidadSugerida,
  franjasQueRomperia,
  validarCapacidadFranja,
  validarParametros,
  validarProducto,
  type FranjaConCarga,
} from "@/core/administracion";

const AHORA = new Date("2026-09-01T10:00:00Z");

function franja(
  id: string,
  minutosDesdeAhora: number,
  capacidad: number,
  carga: number,
): FranjaConCarga {
  return {
    id,
    inicio: new Date(AHORA.getTime() + minutosDesdeAhora * 60_000),
    capacidadMinutos: capacidad,
    cargaAsignada: carga,
  };
}

describe("parámetros del comercio", () => {
  it("acepta una configuración razonable", () => {
    expect(
      validarParametros({
        personalCocina: 2,
        anchoFranjaMin: 10,
        factorSeguridad: 0.85,
      }).valido,
    ).toBe(true);
  });

  it("rechaza α mayor que 1", () => {
    // Prometer más capacidad de la que la cocina tiene es incumplir por diseño.
    const r = validarParametros({ factorSeguridad: 1.2 });
    expect(r.valido).toBe(false);
    expect(r.violaciones[0].campo).toBe("factorSeguridad");
  });

  it("acepta α exactamente 1", () => {
    expect(validarParametros({ factorSeguridad: 1 }).valido).toBe(true);
  });

  it("rechaza un Δ absurdo en ambos extremos", () => {
    expect(validarParametros({ anchoFranjaMin: 2 }).valido).toBe(false);
    expect(validarParametros({ anchoFranjaMin: 90 }).valido).toBe(false);
    expect(validarParametros({ anchoFranjaMin: 5 }).valido).toBe(true);
    expect(validarParametros({ anchoFranjaMin: 60 }).valido).toBe(true);
  });

  it("rechaza una cocina sin personal", () => {
    expect(validarParametros({ personalCocina: 0 }).valido).toBe(false);
  });

  it("acumula todas las violaciones, no solo la primera", () => {
    const r = validarParametros({
      personalCocina: 0,
      anchoFranjaMin: 1,
      factorSeguridad: 3,
    });
    expect(r.violaciones).toHaveLength(3);
  });
});

describe("bajar α sin romper promesas ya hechas", () => {
  // C=100 y α pasa de 0.85 a 0.60: la capacidad comprometible cae de 85 a 60.
  const franjas = [
    franja("llena", 60, 100, 80),
    franja("media", 120, 100, 50),
    franja("vacia", 180, 100, 0),
  ];

  it("detecta las franjas que quedarían sobrevendidas", () => {
    const rotas = franjasQueRomperia(franjas, 0.6, AHORA);
    expect(rotas.map((f) => f.id)).toEqual(["llena"]);
  });

  it("no reporta nada si α sube", () => {
    expect(franjasQueRomperia(franjas, 0.95, AHORA)).toEqual([]);
  });

  it("ignora las franjas que ya pasaron: su carga es historia", () => {
    // Una franja vencida con carga alta no es una promesa viva; bloquear por
    // ella impediría recalibrar α para siempre.
    const pasada = franja("ayer", -600, 100, 95);
    expect(franjasQueRomperia([pasada], 0.5, AHORA)).toEqual([]);
  });

  it("el borde exacto no se considera roto", () => {
    // carga 60 con α 0.60 sobre C=100 da exactamente 60: cabe.
    expect(franjasQueRomperia([franja("f", 60, 100, 60)], 0.6, AHORA)).toEqual([]);
  });
});

describe("capacidad de una franja concreta", () => {
  const f = franja("f", 60, 100, 70);

  it("permite subirla siempre", () => {
    expect(validarCapacidadFranja(f, 200, 0.85).valido).toBe(true);
  });

  it("permite bajarla hasta donde la carga sigue cabiendo", () => {
    // 70 comprometidos, α 0.85 → hace falta C >= 82.35, o sea 83.
    expect(validarCapacidadFranja(f, 83, 0.85).valido).toBe(true);
  });

  it("rechaza bajarla por debajo de lo ya comprometido", () => {
    const r = validarCapacidadFranja(f, 60, 0.85);
    expect(r.valido).toBe(false);
    // El mensaje dice los dos números: sin ellos el operador no sabe cuánto
    // puede bajar.
    expect(r.violaciones[0].motivo).toContain("70");
    expect(r.violaciones[0].motivo).toContain("51");
  });

  it("rechaza valores imposibles", () => {
    expect(validarCapacidadFranja(f, -1, 0.85).valido).toBe(false);
    expect(validarCapacidadFranja(f, 5000, 0.85).valido).toBe(false);
  });

  it("una franja vacía se puede vaciar del todo", () => {
    expect(validarCapacidadFranja(franja("v", 60, 100, 0), 0, 0.85).valido).toBe(
      true,
    );
  });
});

describe("aviso al cerrar una franja", () => {
  it("no avisa si no hay pedidos", () => {
    expect(avisoAlCerrarFranja(0)).toBeNull();
  });

  it("avisa cuántos pedidos quedan comprometidos", () => {
    expect(avisoAlCerrarFranja(3)).toContain("3 pedidos");
    // Cerrar no cancela: eso hay que decirlo o el operador va a creer que sí.
    expect(avisoAlCerrarFranja(3)).toContain("prepararlos igual");
  });

  it("concuerda en singular", () => {
    expect(avisoAlCerrarFranja(1)).toContain("1 pedido ");
  });
});

describe("productos", () => {
  it("acepta un producto normal", () => {
    expect(
      validarProducto({ nombre: "Pizza", precio: 120, tiempoPreparacionMin: 10 })
        .valido,
    ).toBe(true);
  });

  it("rechaza nombres vacíos o desmedidos", () => {
    expect(validarProducto({ nombre: "x" }).valido).toBe(false);
    expect(validarProducto({ nombre: "a".repeat(100) }).valido).toBe(false);
  });

  it("rechaza precios negativos y t(p) imposibles", () => {
    expect(validarProducto({ precio: -1 }).valido).toBe(false);
    expect(validarProducto({ tiempoPreparacionMin: 500 }).valido).toBe(false);
  });

  it("permite t(p) = 0: existe y se vende en el mostrador", () => {
    expect(validarProducto({ tiempoPreparacionMin: 0 }).valido).toBe(true);
  });
});

describe("aviso de elegibilidad", () => {
  it("avisa si se marca anticipable algo por debajo de t_mín", () => {
    // No se bloquea: el comercio manda sobre su catálogo. Pero si no se avisa,
    // el operador cree que lo activó y no entiende por qué nadie lo pide.
    const a = avisoElegibilidad(1, true, 3);
    expect(a).toContain("1 min");
    expect(a).toContain("3");
  });

  it("no avisa si cumple el umbral", () => {
    expect(avisoElegibilidad(5, true, 3)).toBeNull();
  });

  it("no avisa si no está marcado como anticipable", () => {
    expect(avisoElegibilidad(1, false, 3)).toBeNull();
  });
});

describe("capacidad sugerida", () => {
  it("es personal × Δ, la misma fórmula que genera las franjas", () => {
    expect(capacidadSugerida(2, 10)).toBe(20);
    expect(capacidadSugerida(3, 15)).toBe(45);
  });
});
