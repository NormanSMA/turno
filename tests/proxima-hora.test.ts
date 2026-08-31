/**
 * La próxima hora libre que se le muestra al estudiante.
 *
 * El riesgo que cubren estas pruebas es uno solo y ya ocurrió en producción:
 * que la tarjeta ofrezca una hora que la reserva después rechaza. Por eso las
 * dos condiciones —holgura y cut-off— se prueban por separado y en su borde.
 */

import { describe, expect, it } from "vitest";
import {
  leerVentana,
  proximaHoraLibre,
  type FranjaCandidata,
  type ParametrosComercio,
} from "@/core/proxima-hora";

const AHORA = new Date("2026-08-29T12:00:00Z");

/** Comercio de referencia: α = 0.8, margen de 5 min, plato más rápido de 7. */
const COMERCIO: ParametrosComercio = {
  factorSeguridad: 0.8,
  margenCutoffMin: 5,
  minutosMasRapido: 7,
};

const franja = (
  minutosHastaFin: number,
  cargaAsignada = 0,
  capacidadMinutos = 100,
): FranjaCandidata => ({
  inicio: new Date(AHORA.getTime() + (minutosHastaFin - 10) * 60_000),
  fin: new Date(AHORA.getTime() + minutosHastaFin * 60_000),
  cargaAsignada,
  capacidadMinutos,
});

describe("la franja tiene que ser alcanzable", () => {
  it("una que termina antes de que la cocina llegue no cuenta", () => {
    // Necesita 7 + 5 = 12 minutos; esta termina en 10.
    expect(proximaHoraLibre([franja(10)], COMERCIO, AHORA)).toBeNull();
  });

  it("justo en el límite sí cuenta", () => {
    // El cut-off es `>=`: a los 12 minutos exactos todavía se cumple.
    expect(proximaHoraLibre([franja(12)], COMERCIO, AHORA)).not.toBeNull();
  });

  it("se devuelve la más temprana que sirva, no la más holgada", () => {
    // En un receso de treinta minutos, antes gana a cómodo.
    const temprana = franja(20, 70);
    const vacia = franja(90, 0);
    expect(proximaHoraLibre([temprana, vacia], COMERCIO, AHORA)).toBe(temprana);
  });
});

describe("la franja tiene que tener holgura", () => {
  it("llena hasta el factor de seguridad ya no cuenta", () => {
    // 80 de 100 con α = 0.8: el motor la rechazaría.
    expect(proximaHoraLibre([franja(60, 80)], COMERCIO, AHORA)).toBeNull();
  });

  it("un minuto por debajo del tope sí cuenta", () => {
    expect(proximaHoraLibre([franja(60, 79)], COMERCIO, AHORA)).not.toBeNull();
  });

  it("se salta la llena y devuelve la siguiente", () => {
    const llena = franja(30, 80);
    const libre = franja(60, 10);
    expect(proximaHoraLibre([llena, libre], COMERCIO, AHORA)).toBe(libre);
  });
});

describe("cuando no hay nada que ofrecer", () => {
  it("sin franjas, null", () => {
    expect(proximaHoraLibre([], COMERCIO, AHORA)).toBeNull();
  });

  it("sin ningún producto anticipable, null", () => {
    // No es que no haya hora: es que no hay nada que pedir. La tarjeta no
    // dibuja la línea en vez de inventar un dato.
    expect(
      proximaHoraLibre([franja(60)], { ...COMERCIO, minutosMasRapido: null }, AHORA),
    ).toBeNull();
  });

  it("un plato lento puede dejar sin horas un comercio que sí tiene franjas", () => {
    // 40 + 5 = 45 minutos de necesidad contra una franja que cierra en 30.
    expect(
      proximaHoraLibre([franja(30)], { ...COMERCIO, minutosMasRapido: 40 }, AHORA),
    ).toBeNull();
  });
});

describe("cómo se lee la hora según el reloj", () => {
  it("una hora de hoy que todavía no llegó", () => {
    const f = franja(40);
    expect(leerVentana(f.inicio, f.fin, AHORA)).toEqual({
      tipo: "HOY",
      hora: f.inicio,
    });
  });

  it("si ya empezó, lo cierto es hasta cuándo, no cuándo empezó", () => {
    // El caso que se vio en pantalla: "próxima hora libre 09:00" a las 13:18.
    // `franja(5)` empezó hace cinco minutos y cierra en cinco.
    const f = franja(5);
    expect(leerVentana(f.inicio, f.fin, AHORA)).toEqual({
      tipo: "EN_CURSO",
      hasta: f.fin,
    });
  });

  it("empezando justo ahora ya cuenta como en curso", () => {
    const f = { ...franja(20), inicio: AHORA };
    expect(leerVentana(f.inicio, f.fin, AHORA).tipo).toBe("EN_CURSO");
  });

  it("una hora de otro día no se muestra como si fuera hoy", () => {
    // El comercio ya cerró: su próxima hora libre es del lunes. Decir "09:00"
    // a secas manda a alguien a caminar hasta un mostrador cerrado.
    const lunes = new Date(AHORA.getTime() + 2 * 24 * 60 * 60_000);
    expect(
      leerVentana(lunes, new Date(lunes.getTime() + 20 * 60_000), AHORA).tipo,
    ).toBe("OTRO_DIA");
  });

  it("el día se compara en local, no en UTC", () => {
    // En UTC-6 una franja de las 19:00 del sábado cae en domingo si se compara
    // en UTC. Sigue siendo hoy para quien la mira.
    const ahora = new Date(2026, 7, 29, 13, 0);
    const tarde = new Date(2026, 7, 29, 19, 0);
    expect(
      leerVentana(tarde, new Date(tarde.getTime() + 20 * 60_000), ahora).tipo,
    ).toBe("HOY");
  });
});
