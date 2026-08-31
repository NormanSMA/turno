/**
 * El próximo cuello de botella.
 *
 * Lo que se prueba es cuándo el tablero DEBE callarse. Una cocina a la que se
 * le avisa siempre deja de mirar el aviso, y a partir de ahí la alerta que
 * importaba tampoco se ve.
 */

import { describe, expect, it } from "vitest";
import { proximoCuello, type PedidoEnCurso } from "@/core/cuello";

const T0 = new Date("2026-03-10T12:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

function p(cargaMin: number, finMin: number, estado = "RECIBIDO"): PedidoEnCurso {
  return { estado, cargaMin, franjaFin: min(finMin) };
}

describe("qué entra en la cuenta", () => {
  it("sin pedidos, no hay presión", () => {
    const r = proximoCuello([], T0);
    expect(r.nivel).toBe("HOLGADO");
    expect(r.pedidos).toBe(0);
  });

  it("ignora lo que vence más allá de la ventana", () => {
    // Diez pedidos dentro de una hora no son una alerta: son un día de trabajo.
    const r = proximoCuello([p(12, 40), p(12, 50)], T0);
    expect(r.pedidos).toBe(0);
    expect(r.nivel).toBe("HOLGADO");
  });

  it("ignora lo que ya salió de la cocina", () => {
    // Un pedido LISTO no ocupa fuego. Contarlo infla la alarma con trabajo ya
    // hecho, que es la forma más rápida de que la alarma pierda sentido.
    const r = proximoCuello([p(20, 5, "LISTO"), p(20, 5, "RETIRADO")], T0);
    expect(r.cargaMin).toBe(0);
  });
});

describe("los niveles", () => {
  it("por debajo del 60 % no alarma", () => {
    const r = proximoCuello([p(5, 5)], T0, 10, 1);
    expect(r.nivel).toBe("HOLGADO");
  });

  it("cerca del límite avisa antes de incumplir", () => {
    // 9 de 10 minutos: todavía se puede adelantar algo. Avisar al 100 % sería
    // avisar cuando ya no se puede hacer nada.
    const r = proximoCuello([p(9, 5)], T0, 10, 1);
    expect(r.nivel).toBe("AJUSTADO");
  });

  it("por encima de la capacidad, alguien va a esperar de más", () => {
    const r = proximoCuello([p(7, 3), p(7, 6)], T0, 10, 1);
    expect(r.nivel).toBe("EN_RIESGO");
    expect(r.cargaMin).toBe(14);
    expect(r.disponibleMin).toBe(10);
  });
});

describe("puestos de cocina", () => {
  it("dos personas duplican los minutos disponibles", () => {
    // La misma carga que ahoga a una cocina de un puesto es cómoda con dos.
    const carga = [p(7, 3), p(7, 6)];
    expect(proximoCuello(carga, T0, 10, 1).nivel).toBe("EN_RIESGO");
    expect(proximoCuello(carga, T0, 10, 2).nivel).toBe("HOLGADO");
  });

  it("nunca divide por cero aunque los puestos vengan en cero", () => {
    const r = proximoCuello([p(3, 5)], T0, 10, 0);
    expect(r.disponibleMin).toBe(10);
  });
});
