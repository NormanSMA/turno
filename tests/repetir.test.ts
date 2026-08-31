/**
 * "Pedir lo mismo" — rearmar un pedido anterior contra el menú de hoy.
 *
 * Lo que se prueba acá no es la comodidad de la función, sino la promesa que le
 * hace al estudiante: que nada de lo que entra al carrito vaya a ser rechazado
 * después por una razón que ya se conocía al rearmarlo.
 */
import { describe, expect, it } from "vitest";
import { rearmarCarrito, type ProductoVigente } from "../src/core/repetir";

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
