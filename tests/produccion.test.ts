import { describe, expect, it } from "vitest";
import { totalAProducir } from "@/core/produccion";

const pedido = (estado: string, ...items: [string, number][]) => ({
  estado,
  items: items.map(([nombre, cantidad]) => ({ nombre, cantidad })),
});

describe("totalAProducir", () => {
  it("devuelve vacio sin pedidos", () => {
    expect(totalAProducir([])).toEqual([]);
  });

  it("suma un plato repetido en dos pedidos", () => {
    const r = totalAProducir([
      pedido("RECIBIDO", ["Enchiladas", 6]),
      pedido("EN_PREPARACION", ["Enchiladas", 8], ["Tajadas", 2]),
    ]);
    expect(r).toEqual([
      { nombre: "Enchiladas", cantidad: 14 },
      { nombre: "Tajadas", cantidad: 2 },
    ]);
  });

  it("ordena por cantidad desc y luego por nombre", () => {
    const r = totalAProducir([
      pedido("RECIBIDO", ["Tajadas", 3], ["Arepas", 3], ["Enchiladas", 5]),
    ]);
    expect(r.map((t) => t.nombre)).toEqual(["Enchiladas", "Arepas", "Tajadas"]);
  });

  it("excluye pedidos listos y cancelados", () => {
    const r = totalAProducir([
      pedido("RECIBIDO", ["Enchiladas", 1]),
      pedido("LISTO", ["Enchiladas", 10]),
      pedido("CANCELADO", ["Tajadas", 4]),
    ]);
    expect(r).toEqual([{ nombre: "Enchiladas", cantidad: 1 }]);
  });
});
