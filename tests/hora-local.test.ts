/**
 * P0‑4 — Las horas de operación no pueden depender del reloj del servidor.
 *
 * Estas pruebas valen por una sola razón: **corren igual en cualquier zona**.
 * Si alguien vuelve a introducir un `setHours` o un `new Date("…T08:00:00")`
 * sin zona, acá se ve — aunque la máquina de quien lo escribió esté en Managua
 * y todo le funcione a la perfección.
 */

import { describe, expect, it } from "vitest";
import { diasEntre, enZona, sumarDias, ZONA } from "@/core/hora-local";

/** El desfase de Managua, hoy: seis horas detrás de UTC, todo el año. */
const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

describe("una hora de pared se resuelve a un instante", () => {
  it("las 08:00 de Managua son las 14:00 UTC", () => {
    expect(enZona("2026-09-01", 8, 0).toISOString()).toBe(
      "2026-09-01T14:00:00.000Z",
    );
  });

  it("la medianoche local NO es la medianoche UTC", () => {
    // El caso que rompía la generación de franjas: `new Date("…T00:00:00")` en
    // un proceso UTC daba las 00:00Z, que en Managua son las 18:00 del día
    // anterior.
    expect(enZona("2026-09-01", 0, 0).toISOString()).toBe(
      "2026-09-01T06:00:00.000Z",
    );
  });

  it("el resultado no depende de la zona del proceso", () => {
    // Se compara contra el desfase esperado en vez de contra el reloj local:
    // esta aserción da lo mismo en Managua, en UTC o en Tokio.
    const pared = Date.UTC(2026, 8, 1, 8, 0);
    expect(enZona("2026-09-01", 8, 0).getTime()).toBe(pared + SEIS_HORAS_MS);
  });

  it("en julio también, porque Nicaragua no cambia de hora", () => {
    // Media año después: si alguien aplicara horario de verano por costumbre,
    // acá aparecería una hora de diferencia.
    expect(enZona("2026-07-15", 8, 0).toISOString()).toBe(
      "2026-07-15T14:00:00.000Z",
    );
  });

  it("una zona con horario de verano sí desplaza, y se resuelve bien", () => {
    // Prueba de que el desfase se MIDE y no está escrito a mano. Madrid en
    // agosto va a UTC+2; en enero, a UTC+1.
    expect(enZona("2026-08-01", 12, 0, "Europe/Madrid").toISOString()).toBe(
      "2026-08-01T10:00:00.000Z",
    );
    expect(enZona("2026-01-15", 12, 0, "Europe/Madrid").toISOString()).toBe(
      "2026-01-15T11:00:00.000Z",
    );
  });

  it("una fecha inválida no inventa un instante", () => {
    expect(Number.isNaN(enZona("no-es-fecha", 8, 0).getTime())).toBe(true);
  });

  it("la zona por omisión es la del campus", () => {
    expect(ZONA).toBe("America/Managua");
    expect(enZona("2026-09-01", 8, 0).getTime()).toBe(
      enZona("2026-09-01", 8, 0, "America/Managua").getTime(),
    );
  });
});

describe("avanzar en el calendario", () => {
  it("suma días naturales", () => {
    expect(sumarDias("2026-09-01", 1)).toBe("2026-09-02");
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("cruza un año bisiesto sin perder el paso", () => {
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("cuenta los días de un rango, inclusive", () => {
    expect(diasEntre("2026-09-01", "2026-09-01")).toBe(1);
    expect(diasEntre("2026-09-01", "2026-09-30")).toBe(30);
  });
});
