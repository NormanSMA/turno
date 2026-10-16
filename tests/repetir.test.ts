/**
 * "Pedir lo mismo" — rearmar un pedido anterior contra el menú de hoy.
 *
 * Lo que se prueba acá no es la comodidad de la función, sino la promesa que le
 * hace al estudiante: que nada de lo que entra al carrito vaya a ser rechazado
 * después por una razón que ya se conocía al rearmarlo.
 */
import { describe, expect, it } from "vitest";
import {
  franjaHabitual,
  franjaPreseleccionada,
  rearmarCarrito,
  type ProductoVigente,
} from "../src/core/repetir";
import type { FranjaVeredicto } from "../src/core/cabe";

const menu = (...ids: [string, boolean, boolean][]): ProductoVigente[] =>
  ids.map(([id, disponible, elegible]) => ({ id, disponible, elegible }));

describe("rearmar un pedido anterior", () => {
  it("repite lo que sigue disponible y elegible", () => {
    const r = rearmarCarrito(
      [{ productoId: "a", nombre: "Café", cantidad: 2 }],
      menu(["a", true, true]),
    );
    expect(r.carrito).toEqual({ a: 2 });
    expect(r.omitidos).toEqual([]);
  });

  it("deja fuera lo agotado y lo nombra", () => {
    const r = rearmarCarrito(
      [
        { productoId: "a", nombre: "Café", cantidad: 1 },
        { productoId: "b", nombre: "Quesillo", cantidad: 1 },
      ],
      menu(["a", true, true], ["b", false, true]),
    );
    expect(r.carrito).toEqual({ a: 1 });
    expect(r.omitidos).toEqual(["Quesillo"]);
  });

  it("deja fuera lo que dejó de ser anticipable", () => {
    // El caso real: el comercio le subió el tiempo de preparación por encima
    // del ancho de franja. Sigue en el menú, pero ya no se puede anticipar.
    const r = rearmarCarrito(
      [{ productoId: "a", nombre: "Nacatamal", cantidad: 1 }],
      menu(["a", true, false]),
    );
    expect(r.carrito).toEqual({});
    expect(r.omitidos).toEqual(["Nacatamal"]);
  });

  it("deja fuera lo que ya no está en el menú", () => {
    const r = rearmarCarrito(
      [{ productoId: "borrado", nombre: "Pinolillo", cantidad: 1 }],
      menu(["a", true, true]),
    );
    expect(r.carrito).toEqual({});
    expect(r.omitidos).toEqual(["Pinolillo"]);
  });

  it("suma las líneas repetidas del mismo producto", () => {
    const r = rearmarCarrito(
      [
        { productoId: "a", nombre: "Café", cantidad: 1 },
        { productoId: "a", nombre: "Café", cantidad: 2 },
      ],
      menu(["a", true, true]),
    );
    expect(r.carrito).toEqual({ a: 3 });
  });

  it("no repite el mismo aviso dos veces", () => {
    const r = rearmarCarrito(
      [
        { productoId: "x", nombre: "Quesillo", cantidad: 1 },
        { productoId: "x", nombre: "Quesillo", cantidad: 1 },
      ],
      menu(["a", true, true]),
    );
    expect(r.omitidos).toEqual(["Quesillo"]);
  });

  it("ignora cantidades no positivas en vez de propagarlas", () => {
    const r = rearmarCarrito(
      [{ productoId: "a", nombre: "Café", cantidad: 0 }],
      menu(["a", true, true]),
    );
    expect(r.carrito).toEqual({});
    expect(r.omitidos).toEqual([]);
  });

  it("un pedido entero de productos retirados no rompe: carrito vacío", () => {
    const r = rearmarCarrito(
      [
        { productoId: "x", nombre: "Café", cantidad: 1 },
        { productoId: "y", nombre: "Quesillo", cantidad: 1 },
      ],
      menu(),
    );
    expect(r.carrito).toEqual({});
    expect(r.omitidos).toEqual(["Café", "Quesillo"]);
  });
});

describe("franja habitual", () => {
  const AHORA = new Date("2026-08-29T12:00:00Z");
  // Hora local de prueba: HH:MM en UTC, suficiente para comparar.
  const hora = (iso: string) => iso.slice(11, 16);
  const f = (id: string, h: string, holguraMin: number, cierra = "T23:00:00Z"): FranjaVeredicto => ({
    franjaId: id,
    inicio: `2026-08-29T${h}:00Z`,
    holguraMin,
    cierraEn: `2026-08-29${cierra}`,
  });
  const ayer = "2026-08-28T13:00:00Z";

  it("conserva la misma hora si sigue libre", () => {
    const opciones = [f("a", "12:30", 30), f("b", "13:00", 30)];
    expect(franjaHabitual(ayer, opciones, 15, AHORA, hora)?.franjaId).toBe("b");
  });

  it("devuelve null si esa hora ya no admite el carrito", () => {
    const opciones = [f("a", "12:30", 30), f("b", "13:00", 5)];
    expect(franjaHabitual(ayer, opciones, 15, AHORA, hora)).toBeNull();
  });

  it("devuelve null si esa hora ya no existe hoy o venció", () => {
    expect(franjaHabitual(ayer, [f("a", "12:30", 30)], 15, AHORA, hora)).toBeNull();
    expect(
      franjaHabitual(ayer, [f("b", "13:00", 30, "T11:00:00Z")], 15, AHORA, hora),
    ).toBeNull();
  });

  describe("prioridad al preseleccionar", () => {
    const opciones = [f("a", "12:30", 30), f("b", "13:00", 30)];

    it("la habitual gana a la sugerida", () => {
      expect(
        franjaPreseleccionada(ayer, "a", opciones, 15, AHORA, hora),
      ).toBe("b");
    });

    it("cae a la sugerida si la habitual ya no admite el carrito", () => {
      const llena = [f("a", "12:30", 30), f("b", "13:00", 5)];
      expect(franjaPreseleccionada(ayer, "a", llena, 15, AHORA, hora)).toBe("a");
    });

    it("sin pedido repetido usa la sugerida, y sin sugerida null", () => {
      expect(franjaPreseleccionada(null, "a", opciones, 15, AHORA, hora)).toBe("a");
      expect(franjaPreseleccionada(null, null, opciones, 15, AHORA, hora)).toBeNull();
    });
  });
});
