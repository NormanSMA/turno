/**
 * Cómo se dice el tiempo.
 *
 * Parece cosmético y no lo es: "tiempo recuperado" es la promesa del producto,
 * y una cifra que se lee mal la debilita en lugar de sostenerla.
 */

import { describe, expect, it } from "vitest";
import {
  equivalenciaDeTiempo,
  minutosLegibles,
  tiempoRecuperado,
} from "@/lib/tiempo";

describe("minutos legibles", () => {
  it("no dice cero: dice que ya casi", () => {
    // "0 minutos" en una cuenta regresiva se lee como "se acabó", y todavía no.
    expect(minutosLegibles(0)).toBe("menos de un minuto");
    expect(minutosLegibles(-3)).toBe("menos de un minuto");
  });

  it("concuerda el singular", () => {
    expect(minutosLegibles(1)).toBe("1 minuto");
    expect(minutosLegibles(2)).toBe("2 minutos");
  });

  it("pasa a horas cuando el número deja de contarse de memoria", () => {
    expect(minutosLegibles(59)).toBe("59 minutos");
    expect(minutosLegibles(60)).toBe("1 h");
    expect(minutosLegibles(75)).toBe("1 h 15 min");
  });
});

describe("tiempo recuperado", () => {
  it("por debajo de la hora se queda en minutos", () => {
    // "0 h 40 m" se lee como poca cosa, y 40 minutos de recreo no lo son.
    expect(tiempoRecuperado(40)).toBe("40 min");
  });

  it("no muestra números negativos aunque el dato venga sucio", () => {
    expect(tiempoRecuperado(-5)).toBe("0 min");
  });

  it("desde la hora usa el formato corto", () => {
    expect(tiempoRecuperado(60)).toBe("1 h");
    expect(tiempoRecuperado(198)).toBe("3 h 18 m");
  });
});

describe("equivalencia", () => {
  it("calla cuando la cifra todavía no significa nada", () => {
    // Decirle a alguien que recuperó "casi un receso" con 10 minutos suena a
    // exageración, y una exageración quema la cifra para cuando sí sea grande.
    expect(equivalenciaDeTiempo(10)).toBeNull();
  });

  it("aterriza la cifra en algo del campus", () => {
    expect(equivalenciaDeTiempo(30)).toBe("Casi un receso entero");
    expect(equivalenciaDeTiempo(90)).toBe("Una clase completa");
    expect(equivalenciaDeTiempo(198)).toBe("3 clases enteras");
  });

  it("cambia de unidad cuando contar clases deja de ayudar", () => {
    // "14 clases" ya no se imagina; "2 días de campus" sí.
    expect(equivalenciaDeTiempo(700)).toBe("2 días de campus");
  });
});
