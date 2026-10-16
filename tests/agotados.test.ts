/**
 * Agotados al cancelar desde la cocina: quién puede pedirlo y qué ids acepta.
 * Sin base de datos: el cliente es un doble que responde con los ítems del
 * pedido, y `comercio.ts` se reemplaza para observar qué productos se apagan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const actualizarProducto = vi.fn();
vi.mock("@/lib/comercio", () => ({
  actualizarProducto: (...args: unknown[]) => actualizarProducto(...args),
}));

import {
  apagarAgotados,
  ErrorAgotados,
  validarAgotados,
} from "@/lib/agotados";
import { esquemaCambioEstado } from "@/lib/esquemas";

const COMERCIO = "c0000000-0000-4000-8000-000000000001";
const PEDIDO = "d0000000-0000-4000-8000-000000000001";
const POLLO = "a0000000-0000-4000-8000-000000000001";
const ARROZ = "a0000000-0000-4000-8000-000000000002";
const AJENO = "a0000000-0000-4000-8000-000000000003";

/** Doble de `itemPedido`: el pedido tiene POLLO y ARROZ, ambos de COMERCIO. */
function dbConItems() {
  const findMany = vi.fn(
    async ({ where }: { where: { productoId: { in: string[] } } }) =>
      where.productoId.in
        .filter((id) => id === POLLO || id === ARROZ)
        .map((productoId) => ({ productoId })),
  );
  return { db: { itemPedido: { findMany } } as never, findMany };
}

const base = {
  estado: "CANCELADO",
  actor: "COMERCIO" as const,
  pedidoId: PEDIDO,
  comercioId: COMERCIO,
};

beforeEach(() => actualizarProducto.mockReset());

describe("validarAgotados", () => {
  it("acepta un producto del pedido y consulta por pedido y comercio", async () => {
    const { db, findMany } = dbConItems();
    const ids = await validarAgotados(db, { ...base, ids: [POLLO] });
    expect(ids).toEqual([POLLO]);
    expect(findMany.mock.calls[0]![0]).toMatchObject({
      where: { pedidoId: PEDIDO, producto: { comercioId: COMERCIO } },
    });
  });

  it("sin selección no consulta nada ni exige permiso", async () => {
    const { db, findMany } = dbConItems();
    const ids = await validarAgotados(db, {
      ...base,
      actor: "USUARIO",
      ids: [],
    });
    expect(ids).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rechaza al estudiante con 403", async () => {
    const { db } = dbConItems();
    const r = validarAgotados(db, { ...base, actor: "USUARIO", ids: [POLLO] });
    await expect(r).rejects.toMatchObject({
      codigo: "AGOTADOS_NO_PERMITIDOS",
      status: 403,
    });
  });

  it("rechaza un producto que no es del pedido con 400", async () => {
    const { db } = dbConItems();
    const r = validarAgotados(db, { ...base, ids: [POLLO, AJENO] });
    await expect(r).rejects.toBeInstanceOf(ErrorAgotados);
    await expect(r).rejects.toMatchObject({
      codigo: "AGOTADOS_INVALIDOS",
      status: 400,
    });
  });

  it("rechaza agotados si el estado no es CANCELADO", async () => {
    const { db } = dbConItems();
    const r = validarAgotados(db, { ...base, estado: "LISTO", ids: [POLLO] });
    await expect(r).rejects.toMatchObject({ status: 400 });
  });

  it("el admin sí puede", async () => {
    const { db } = dbConItems();
    const ids = await validarAgotados(db, { ...base, actor: "ADMIN", ids: [ARROZ] });
    expect(ids).toEqual([ARROZ]);
  });
});

describe("apagarAgotados", () => {
  it("pedido de 2 ítems marcando solo uno: apaga solo ese", async () => {
    const { db } = dbConItems();
    const ids = await validarAgotados(db, { ...base, ids: [POLLO] });
    await apagarAgotados(COMERCIO, "usuario-1", ids);
    expect(actualizarProducto).toHaveBeenCalledTimes(1);
    expect(actualizarProducto).toHaveBeenCalledWith(
      COMERCIO,
      POLLO,
      "usuario-1",
      { disponible: false },
    );
  });
});

describe("esquemaCambioEstado", () => {
  it("acepta agotados con uuid y rechaza texto libre", () => {
    expect(
      esquemaCambioEstado.safeParse({ estado: "CANCELADO", agotados: [POLLO] })
        .success,
    ).toBe(true);
    expect(
      esquemaCambioEstado.safeParse({ estado: "CANCELADO", agotados: ["x"] })
        .success,
    ).toBe(false);
  });
});
