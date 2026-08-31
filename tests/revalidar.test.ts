/**
 * Revalidación del carrito.
 *
 * Lo que se verifica no es que la comparación funcione: es que el usuario
 * SIEMPRE se entere. La regla del sistema es que el servidor gana, pero un
 * producto que desaparece del carrito sin decir nada es peor que un error —
 * el estudiante llega al mostrador esperando algo que nunca pidió.
 */

import { describe, expect, it } from "vitest";
import {
  revalidarCarrito,
  totalVigente,
  type ItemCarrito,
  type ProductoVigente,
} from "@/core/revalidar";

function enCarrito(p: Partial<ItemCarrito> = {}): ItemCarrito {
  return { productoId: "p1", cantidad: 1, precio: "100.00", nombre: "Pizza", ...p };
}

function enMenu(p: Partial<ProductoVigente> = {}): ProductoVigente {
  return {
    id: "p1",
    nombre: "Pizza",
    precio: "100.00",
    disponible: true,
    elegible: true,
    ...p,
  };
}

describe("cuando no cambió nada", () => {
  it("no inventa cambios y conserva el carrito", () => {
    const r = revalidarCarrito([enCarrito({ cantidad: 2 })], [enMenu()]);
    expect(r.sinNovedades).toBe(true);
    expect(r.carrito).toEqual({ p1: 2 });
  });

  it("no avisa por un precio que solo cambió de formato", () => {
    // "100.00" y "100" son el mismo precio. Avisar de un cambio que no existe
    // gasta la confianza del usuario para la vez que sí importe.
    const r = revalidarCarrito(
      [enCarrito({ precio: "100.00" })],
      [enMenu({ precio: "100" })],
    );
    expect(r.cambios).toEqual([]);
  });
});

describe("cambios que sacan el producto del carrito", () => {
  it("un producto agotado se avisa Y se quita", () => {
    // Dejarlo dentro garantiza un rechazo al confirmar, y ese rechazo no dice
    // cuál de los cinco productos era el problema.
    const r = revalidarCarrito(
      [enCarrito()],
      [enMenu({ disponible: false })],
    );
    expect(r.cambios[0]).toMatchObject({ tipo: "AGOTADO", bloqueante: true });
    expect(r.carrito).toEqual({});
  });

  it("un producto que ya no está en el menú se avisa como retirado", () => {
    const r = revalidarCarrito([enCarrito()], []);
    expect(r.cambios[0]).toMatchObject({ tipo: "RETIRADO", bloqueante: true });
    expect(r.carrito).toEqual({});
  });

  it("un producto que dejó de ser anticipable se avisa aparte", () => {
    // No es lo mismo que agotado: existe y hay, pero ya no se puede reservar.
    // Mezclarlos haría que el estudiante lo busque en el mostrador creyendo que
    // se acabó.
    const r = revalidarCarrito([enCarrito()], [enMenu({ elegible: false })]);
    expect(r.cambios[0]?.tipo).toBe("NO_ANTICIPABLE");
  });

  it("lo que sigue bien sobrevive aunque otro producto caiga", () => {
    const r = revalidarCarrito(
      [enCarrito({ productoId: "p1" }), enCarrito({ productoId: "p2", nombre: "Café" })],
      [enMenu({ id: "p1" }), enMenu({ id: "p2", nombre: "Café", disponible: false })],
    );
    expect(r.carrito).toEqual({ p1: 1 });
    expect(r.cambios).toHaveLength(1);
  });
});

describe("cambio de precio", () => {
  it("se avisa pero NO saca el producto", () => {
    // Se puede pedir igual; lo que no se puede es cobrarlo distinto sin decirlo.
    const r = revalidarCarrito(
      [enCarrito({ precio: "45.00" })],
      [enMenu({ precio: "50.00" })],
    );
    expect(r.cambios[0]).toMatchObject({
      tipo: "PRECIO",
      precioAntes: "45.00",
      precioAhora: "50.00",
      bloqueante: false,
    });
    expect(r.carrito).toEqual({ p1: 1 });
  });

  it("también avisa cuando BAJA", () => {
    // Una baja no perjudica, pero el total va a cambiar y el usuario tiene que
    // entender por qué.
    const r = revalidarCarrito(
      [enCarrito({ precio: "50.00" })],
      [enMenu({ precio: "45.00" })],
    );
    expect(r.cambios[0]?.tipo).toBe("PRECIO");
  });

  it("usa el nombre del MENÚ, no el que estaba guardado", () => {
    // Si lo renombraron, el estudiante tiene que poder reconocerlo en el
    // mostrador por el nombre nuevo.
    const r = revalidarCarrito(
      [enCarrito({ nombre: "Pizza chica" })],
      [enMenu({ nombre: "Pizza personal", disponible: false })],
    );
    expect(r.cambios[0]?.nombre).toBe("Pizza personal");
  });
});

describe("total con precios vigentes", () => {
  it("cobra el precio de ahora, no el guardado", () => {
    const total = totalVigente({ p1: 2 }, [enMenu({ precio: "50.00" })]);
    expect(total).toBe(100);
  });

  it("ignora lo que ya no está en el menú en vez de reventar", () => {
    expect(totalVigente({ fantasma: 3 }, [enMenu()])).toBe(0);
  });
});

describe("un precio que nunca se vio", () => {
  it("no puede haber cambiado", () => {
    /*
     * Regresión real, encontrada probando el carrito restaurado.
     *
     * La foto de precios solo se llenaba al tocar "agregar", así que un carrito
     * sembrado por URL o restaurado del almacenamiento llegaba acá con precio
     * "0" de respaldo — y la pantalla anunciaba "Cambió de precio: C$ 0.00 →
     * C$ 150.00" sobre algo que nadie había cambiado.
     *
     * Este módulo no puede impedirlo solo (un precio de 0 es un precio válido
     * de entrada), pero sí deja fijada la regla que sostiene el arreglo: el
     * precio que se le pasa tiene que ser uno que el usuario haya visto.
     */
    const r = revalidarCarrito(
      [enCarrito({ precio: "150.00" })],
      [enMenu({ precio: "150.00" })],
    );
    expect(r.cambios).toEqual([]);
    expect(r.sinNovedades).toBe(true);
  });

  it("comparar contra cero SÍ reporta cambio: por eso el cero no puede ser el respaldo", () => {
    const r = revalidarCarrito(
      [enCarrito({ precio: "0" })],
      [enMenu({ precio: "150.00" })],
    );
    expect(r.cambios[0]?.tipo).toBe("PRECIO");
  });
});

describe("bordes", () => {
  it("una cantidad en cero no se revalida ni se arrastra", () => {
    const r = revalidarCarrito([enCarrito({ cantidad: 0 })], [enMenu()]);
    expect(r.cambios).toEqual([]);
    expect(r.carrito).toEqual({});
  });

  it("un carrito vacío no tiene novedades", () => {
    expect(revalidarCarrito([], [enMenu()]).sinNovedades).toBe(true);
  });
});
