/**
 * El día de una franja, visto por el estudiante.
 *
 * Estas pruebas nacen de un fallo concreto: a las ocho de la noche el selector
 * ofrecía "11:00, 11:15, 11:30" sin decir que eran de la mañana siguiente. El
 * día se marcaba solo en la primera columna, y la regla se desplaza — en cuanto
 * alguien la corría, la única marca salía de la vista. Lo que quedaba eran
 * horas de la mañana en plena noche, que se leen como un sistema roto.
 *
 * Debajo había algo más silencioso: el día se calculaba con la zona del
 * NAVEGADOR y la hora se pintaba con la de Managua. Dos relojes decidiendo
 * cosas distintas sobre el mismo dato.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { diaEnCampus, nombreDelDia } from "@/lib/cliente";

afterEach(() => {
  vi.useRealTimers();
});

/** Fija el reloj en un instante UTC concreto. */
function congelar(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("qué día es, en el campus", () => {
  it("usa la zona de Managua y no la del proceso", () => {
    /*
     * Las 02:00 UTC son todavía las 20:00 del día ANTERIOR en Managua (UTC−6).
     * Un servidor en UTC —como el de producción— que resolviera el día con su
     * propia zona diría que es día 5; para quien está en el campus son las
     * ocho de la noche del 4.
     */
    expect(diaEnCampus("2026-09-05T02:00:00.000Z")).toBe("2026-09-04");
  });

  it("cambia de día a la medianoche de Managua, no a la de UTC", () => {
    // 05:59 UTC sigue siendo el día 4 en el campus; 06:00 ya es el 5.
    expect(diaEnCampus("2026-09-05T05:59:00.000Z")).toBe("2026-09-04");
    expect(diaEnCampus("2026-09-05T06:00:00.000Z")).toBe("2026-09-05");
  });
});

describe("cómo se nombra el día", () => {
  it("dice Hoy cuando es hoy", () => {
    congelar("2026-09-04T18:00:00.000Z"); // mediodía en Managua
    expect(nombreDelDia("2026-09-04T20:00:00.000Z")).toBe("Hoy");
  });

  it("dice Mañana en el caso que motivó todo esto", () => {
    /*
     * El escenario real: son las 20:14 del 4 en Managua, el local cerró a las
     * 20:00, y la primera hora disponible es a las 11:00 del día siguiente.
     * Antes eso se mostraba como "11:00" a secas.
     */
    congelar("2026-09-05T02:14:00.000Z"); // 20:14 del 4 en Managua
    expect(nombreDelDia("2026-09-05T17:00:00.000Z")).toBe("Mañana"); // 11:00 del 5
  });

  it("para más adelante da el día con su fecha, no una palabra", () => {
    congelar("2026-09-04T18:00:00.000Z");
    // Pasado mañana ya no tiene nombre corto: hace falta la fecha.
    const texto = nombreDelDia("2026-09-06T17:00:00.000Z");
    expect(texto).not.toBe("Hoy");
    expect(texto).not.toBe("Mañana");
    expect(texto).toMatch(/6/);
  });

  it("cerca de la medianoche del campus no se adelanta un día", () => {
    /*
     * 23:30 en Managua es ya el día siguiente en UTC. Si el nombre se calculara
     * con la zona equivocada, una franja de esta misma noche se anunciaría como
     * "Mañana" — y quien la reservara llegaría un día tarde.
     */
    congelar("2026-09-05T05:30:00.000Z"); // 23:30 del 4 en Managua
    expect(nombreDelDia("2026-09-05T05:45:00.000Z")).toBe("Hoy"); // 23:45 del 4
    expect(nombreDelDia("2026-09-05T17:00:00.000Z")).toBe("Mañana"); // 11:00 del 5
  });
});
