import { describe, expect, it } from "vitest";
import { ErrorApi } from "@/lib/cliente";
import {
  aplicarEstado,
  clasificarError,
  type Tablero,
} from "@/lib/consultas-cocina";

const pedido = (id: string, estado: "RECIBIDO" | "EN_PREPARACION" | "LISTO") => ({
  id,
  codigo: id,
  estado,
  cargaEstimadaMin: 5,
  franjaInicio: "",
  franjaFin: "",
  minutosRestantes: 10,
  items: [],
});

const tablero: Tablero = {
  generadoEn: "",
  comercio: { nombre: "x", estadoOperacion: "ABIERTO" },
  pedidos: [pedido("a", "RECIBIDO"), pedido("b", "LISTO")],
  franjas: [],
};

describe("aplicarEstado", () => {
  it("mueve la tarjeta de columna sin tocar el original", () => {
    const r = aplicarEstado(tablero, "a", "EN_PREPARACION");
    expect(r.pedidos[0].estado).toBe("EN_PREPARACION");
    expect(tablero.pedidos[0].estado).toBe("RECIBIDO");
  });
  it("saca el pedido al entregarse o cancelarse", () => {
    expect(aplicarEstado(tablero, "b", "RETIRADO").pedidos.map((p) => p.id)).toEqual(["a"]);
    expect(aplicarEstado(tablero, "a", "CANCELADO").pedidos.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("clasificarError", () => {
  const err = (s: number) => new ErrorApi("E", "m", s);
  it("401 pide sesion", () => {
    expect(clasificarError(err(401), "x").sinSesion).toBe(true);
  });
  it("404 y 403 no son desconexion", () => {
    expect(clasificarError(err(404), "tienda").mensaje).toContain("tienda");
    expect(clasificarError(err(403), "x").desconectado).toBe(false);
  });
  it("sin respuesta es desconexion sin pantalla de error", () => {
    const r = clasificarError(new TypeError("fetch"), "x");
    expect(r).toMatchObject({ desconectado: true, mensaje: null });
  });
  it("error del servidor es desconexion con aviso", () => {
    const r = clasificarError(err(500), "x");
    expect(r.desconectado).toBe(true);
    expect(r.mensaje).toContain("No se pudo actualizar la cola");
  });
});
