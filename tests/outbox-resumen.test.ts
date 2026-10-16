import { describe, expect, it } from "vitest";
import { resumirBandeja, type FilaAviso } from "@/core/outbox-resumen";

const AHORA = new Date("2026-10-15T12:00:00Z");
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);

function fila(p: Partial<FilaAviso> = {}): FilaAviso {
  return {
    canal: "CORREO",
    estado: "PENDIENTE",
    intentos: 0,
    ultimoError: null,
    reclamadaEn: null,
    creadaEn: hace(1),
    enviadaEn: null,
    ...p,
  };
}

describe("resumirBandeja", () => {
  it("sin filas devuelve ceros y antigüedad null", () => {
    const r = resumirBandeja([], AHORA);
    expect(r.CORREO).toEqual({
      pendientes: 0,
      enviando: 0,
      fallidas: 0,
      enviadasUltimas24h: 0,
      masAntiguaPendienteMin: null,
      atascadas: 0,
      ultimoError: null,
      intentosMax: 0,
    });
    expect(r.PUSH.masAntiguaPendienteMin).toBeNull();
  });

  it("solo pendientes: cuenta y no marca fallos", () => {
    const r = resumirBandeja([fila(), fila()], AHORA).CORREO;
    expect(r.pendientes).toBe(2);
    expect(r.fallidas).toBe(0);
    expect(r.atascadas).toBe(0);
  });

  it("antigüedad es la del pendiente más viejo, en minutos", () => {
    const r = resumirBandeja(
      [fila({ creadaEn: hace(3) }), fila({ creadaEn: hace(42) })],
      AHORA,
    ).CORREO;
    expect(r.masAntiguaPendienteMin).toBe(42);
  });

  it("atascadas: ENVIANDO con reclamo de más de 10 minutos", () => {
    const r = resumirBandeja(
      [
        fila({ estado: "ENVIANDO", reclamadaEn: hace(11) }),
        fila({ estado: "ENVIANDO", reclamadaEn: hace(2) }),
      ],
      AHORA,
    ).CORREO;
    expect(r.enviando).toBe(2);
    expect(r.atascadas).toBe(1);
  });

  it("fallidas: toma el último error y el máximo de intentos", () => {
    const r = resumirBandeja(
      [
        fila({ estado: "FALLIDA", intentos: 5, ultimoError: "viejo", creadaEn: hace(90) }),
        fila({ estado: "FALLIDA", intentos: 3, ultimoError: "SMTP 550", creadaEn: hace(10) }),
      ],
      AHORA,
    ).CORREO;
    expect(r.fallidas).toBe(2);
    expect(r.ultimoError).toBe("SMTP 550");
    expect(r.intentosMax).toBe(5);
  });

  it("separa los canales y cuenta enviadas de las últimas 24 horas", () => {
    const r = resumirBandeja(
      [
        fila({ canal: "PUSH", estado: "FALLIDA", ultimoError: "410" }),
        fila({ estado: "ENVIADA", enviadaEn: hace(60) }),
        fila({ estado: "ENVIADA", enviadaEn: hace(60 * 30) }),
      ],
      AHORA,
    );
    expect(r.PUSH.fallidas).toBe(1);
    expect(r.PUSH.enviadasUltimas24h).toBe(0);
    expect(r.CORREO.fallidas).toBe(0);
    expect(r.CORREO.enviadasUltimas24h).toBe(1);
    expect(r.CORREO.ultimoError).toBeNull();
  });
});
