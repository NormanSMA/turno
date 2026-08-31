/**
 * Centro de incidentes.
 *
 * Lo que más importa probar acá es el SILENCIO. Un centro de incidentes que
 * siempre tiene algo en amarillo entrena a quien opera a ignorarlo, y para
 * cuando aparezca algo rojo ya nadie lo mira.
 */

import { describe, expect, it } from "vitest";
import { detectarIncidentes, type SenalesSistema } from "@/core/incidentes";

function sano(p: Partial<SenalesSistema> = {}): SenalesSistema {
  return {
    baseMs: 12,
    notificacionesPendientes: 0,
    notificacionesFallidas: 0,
    dispositivosDescartados: 0,
    comercios: [
      {
        nombre: "Central",
        saturado: false,
        estadoOperacion: "ABIERTO",
        franjasFuturas: 8,
      },
    ],
    pedidosAtrasados: 0,
    ...p,
  };
}

describe("cuando todo está bien", () => {
  it("no dice nada", () => {
    expect(detectarIncidentes(sano())).toEqual([]);
  });

  it("un comercio cerrado no es un incidente", () => {
    // Cerrar es una decisión del comercio, no una falla del sistema.
    const r = detectarIncidentes(
      sano({
        comercios: [
          { nombre: "Central", saturado: false, estadoOperacion: "CERRADO", franjasFuturas: 0 },
        ],
      }),
    );
    expect(r).toEqual([]);
  });

  it("una base rápida no genera ruido", () => {
    expect(detectarIncidentes(sano({ baseMs: 399 }))).toEqual([]);
  });
});

describe("el fallo silencioso más caro", () => {
  it("abierto y sin franjas se reporta ALTO", () => {
    // Desde afuera parece que la aplicación está rota: el comercio se ve
    // disponible y no hay ni una hora que elegir.
    const r = detectarIncidentes(
      sano({
        comercios: [
          { nombre: "Central", saturado: false, estadoOperacion: "ABIERTO", franjasFuturas: 0 },
        ],
      }),
    );
    expect(r[0]).toMatchObject({ gravedad: "ALTO" });
    expect(r[0]?.titulo).toContain("sin horas");
  });
});

describe("orden por gravedad", () => {
  it("la base caída va primero, por encima de todo lo demás", () => {
    // Sin base no hay pedidos ni cocina ni retiro: cualquier alerta arriba de
    // esta le hace perder tiempo a quien opera.
    const r = detectarIncidentes(
      sano({ baseMs: 2000, notificacionesFallidas: 4, pedidosAtrasados: 9 }),
    );
    expect(r[0]?.id).toBe("base-critica");
    expect(r[0]?.gravedad).toBe("CRITICO");
  });

  it("los atrasados escalan de ALTO a CRITICO con el volumen", () => {
    expect(detectarIncidentes(sano({ pedidosAtrasados: 1 }))[0]?.gravedad).toBe("ALTO");
    expect(detectarIncidentes(sano({ pedidosAtrasados: 5 }))[0]?.gravedad).toBe("CRITICO");
  });
});

describe("avisos", () => {
  it("un aviso fallido es un no-show en potencia, no un detalle", () => {
    const r = detectarIncidentes(sano({ notificacionesFallidas: 2 }));
    expect(r[0]?.gravedad).toBe("ALTO");
  });

  it("una cola corta de avisos no alarma", () => {
    // Que haya algo esperando salir es el funcionamiento normal de la bandeja.
    expect(detectarIncidentes(sano({ notificacionesPendientes: 20 }))).toEqual([]);
  });

  it("una cola larga sugiere que el cron no corre", () => {
    const r = detectarIncidentes(sano({ notificacionesPendientes: 21 }));
    expect(r[0]?.accion).toContain("cron");
  });
});

describe("saturación", () => {
  it("no se trata como falla: es el control de admisión funcionando", () => {
    const r = detectarIncidentes(
      sano({
        comercios: [
          { nombre: "Central", saturado: true, estadoOperacion: "ABIERTO", franjasFuturas: 4 },
        ],
      }),
    );
    expect(r[0]?.gravedad).toBe("MEDIO");
    expect(r[0]?.accion).toBeNull();
  });
});
