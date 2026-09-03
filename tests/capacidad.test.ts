/**
 * Capacidad de cocina como flujo.
 *
 * Lo que estas pruebas protegen es la promesa del sistema en las dos
 * direcciones a la vez, que es lo difícil:
 *
 *   - **No prometer de más.** Nunca admitir un conjunto de pedidos que la
 *     cocina no pueda terminar a tiempo. Un no-show provocado por el sistema es
 *     el peor fallo posible del producto.
 *   - **No rechazar de menos.** Rechazar un pedido que sí cabía es una venta
 *     perdida y un usuario que se va. Era el defecto del modelo anterior, así
 *     que hay pruebas explícitas de que ya no ocurre.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  cabeConAnticipacion,
  capacidadCocinaHasta,
  capacidadDespachoFranja,
  holguraCocina,
  type CompromisoFranja,
  type ParametrosCapacidad,
} from "@/core/capacidad";

const AHORA = new Date("2026-03-02T12:00:00.000Z");

/** Un comercio de una persona en cocina y una en mostrador, sin colchón. */
const PARAMS: ParametrosCapacidad = {
  personalCocina: 1,
  personalMostrador: 1,
  anchoFranjaMin: 15,
  factorSeguridad: 1,
};

function enMinutos(m: number): Date {
  return new Date(AHORA.getTime() + m * 60_000);
}

describe("el caso que motivó el cambio", () => {
  /*
   * El escenario real: son las 12:00, la franja de retiro es 12:45–13:00 y en
   * la cocina hay una persona.
   *
   * El modelo viejo le daba a esa franja `1 × 15 = 15` minutos-cocina, así que
   * admitía UNA pizza o TRES almuerzos y cerraba. El nuevo mira lo que de
   * verdad tiene la cocina: sesenta minutos, de 12:00 a 13:00.
   */
  const franja = { franjaId: "f13", fin: enMinutos(60) };

  it("admite doce almuerzos ya hechos donde antes cabían tres", () => {
    // Un almuerzo preparado solo hay que terminarlo: 5 minutos.
    let compromisos: CompromisoFranja[] = [];
    let admitidos = 0;

    for (let i = 0; i < 20; i++) {
      const r = cabeConAnticipacion({
        ahora: AHORA,
        franjaDestino: franja,
        cocinaMin: 5,
        despachoMin: 1,
        compromisos,
        params: { ...PARAMS, personalMostrador: 2 },
        // Mostrador holgado a propósito: acá se mide la cocina, no la fila.
      });
      if (!r.cabe) break;
      admitidos++;
      compromisos = [
        {
          franjaId: franja.franjaId,
          fin: franja.fin,
          minutosCocina: admitidos * 5,
          minutosDespacho: admitidos * 1,
        },
      ];
    }

    // 60 minutos de cocina ÷ 5 por almuerzo = 12.
    expect(admitidos).toBe(12);
  });

  it("a la pizza le sigue cobrando lo que cuesta", () => {
    // 60 minutos ÷ 15 por pizza = 4. Sigue siendo cuatro veces lo de antes,
    // pero no es gratis: el plato caro paga caro.
    const cuatro: CompromisoFranja[] = [
      { ...franja, minutosCocina: 60, minutosDespacho: 4 },
    ];

    expect(
      cabeConAnticipacion({
        ahora: AHORA,
        franjaDestino: franja,
        cocinaMin: 15,
        despachoMin: 1,
        compromisos: cuatro,
        params: { ...PARAMS, personalMostrador: 4 },
      }).motivo,
    ).toBe("COCINA_SATURADA");
  });

  it("mezcla platos distintos hasta llenar el tiempo, no un cupo", () => {
    // Un almuerzo (5), una hamburguesa (10) y una pizza (15) son 30 minutos:
    // media cocina. Lo que importa es el trabajo, no cuántos pedidos son.
    const mezcla: CompromisoFranja[] = [
      { ...franja, minutosCocina: 30, minutosDespacho: 3 },
    ];

    expect(
      cabeConAnticipacion({
        ahora: AHORA,
        franjaDestino: franja,
        cocinaMin: 15,
        despachoMin: 1,
        compromisos: mezcla,
        params: { ...PARAMS, personalMostrador: 4 },
      }).cabe,
    ).toBe(true);
  });

  it("cuanto más tarde se retira, más cocina hay disponible", () => {
    // La misma franja pedida a las 12:00 tiene una hora; pedida a las 12:30,
    // media. Que la anticipación valga algo es el punto de todo el sistema.
    const temprano = holguraCocina({
      ahora: AHORA,
      franja,
      compromisos: [],
      params: PARAMS,
    });
    const tarde = holguraCocina({
      ahora: enMinutos(30),
      franja,
      compromisos: [],
      params: PARAMS,
    });

    expect(temprano).toBe(60);
    expect(tarde).toBe(30);
  });
});

describe("no prometer lo que la cocina no puede", () => {
  it("un pedido tardío no le roba el tiempo a uno que vence antes", () => {
    /*
     * Ésta es la prueba que justifica recorrer TODOS los límites.
     *
     * La franja de las 12:30 ya tiene 30 minutos comprometidos: la cocina está
     * exactamente llena hasta ahí. Llega un pedido para las 13:00, que mirando
     * solo su propia franja parece caber de sobra (hay 60 minutos hasta las
     * 13:00 y solo 30 usados).
     *
     * Pero admitirlo obliga a la cocina a hacer 30 + 40 = 70 minutos de trabajo
     * en los 60 que tiene. Uno de los dos llega tarde. Comprobar solo la franja
     * del pedido nuevo dejaría pasar exactamente este caso.
     */
    const lleno: CompromisoFranja[] = [
      {
        franjaId: "f1230",
        fin: enMinutos(30),
        minutosCocina: 30,
        minutosDespacho: 2,
      },
    ];

    const r = cabeConAnticipacion({
      ahora: AHORA,
      franjaDestino: { franjaId: "f13", fin: enMinutos(60) },
      cocinaMin: 40,
      despachoMin: 1,
      compromisos: lleno,
      params: { ...PARAMS, personalMostrador: 4 },
    });

    expect(r.cabe).toBe(false);
    expect(r.motivo).toBe("COCINA_SATURADA");
  });

  it("y sí lo admite cuando de verdad queda tiempo", () => {
    // Mismo escenario, pero pidiendo 30 en vez de 40: 30 + 30 = 60, que es
    // justo lo que hay. Cabe, y tiene que caber.
    const lleno: CompromisoFranja[] = [
      {
        franjaId: "f1230",
        fin: enMinutos(30),
        minutosCocina: 30,
        minutosDespacho: 2,
      },
    ];

    expect(
      cabeConAnticipacion({
        ahora: AHORA,
        franjaDestino: { franjaId: "f13", fin: enMinutos(60) },
        cocinaMin: 30,
        despachoMin: 1,
        compromisos: lleno,
        params: { ...PARAMS, personalMostrador: 4 },
      }).cabe,
    ).toBe(true);
  });

  it("señala qué límite se rompe, no solo que no cabe", () => {
    const r = cabeConAnticipacion({
      ahora: AHORA,
      franjaDestino: { franjaId: "f13", fin: enMinutos(60) },
      cocinaMin: 999,
      despachoMin: 1,
      compromisos: [],
      params: { ...PARAMS, personalMostrador: 4 },
    });

    expect(r.limiteRoto).toEqual(enMinutos(60));
  });

  it("una franja que ya venció no ofrece capacidad", () => {
    expect(capacidadCocinaHasta(AHORA, enMinutos(-5), PARAMS)).toBe(0);
    expect(capacidadCocinaHasta(AHORA, AHORA, PARAMS)).toBe(0);
  });

  it("el trabajo ya vencido sigue pesando sobre la cocina", () => {
    /*
     * Una franja que pasó sin entregarse no libera a la cocina: esa comida
     * sigue sin hacerse. Si se ignorara, el sistema admitiría pedidos nuevos
     * sobre una cocina que ya está atrasada — y el atraso se hereda.
     */
    const atrasado: CompromisoFranja[] = [
      {
        franjaId: "vencida",
        fin: enMinutos(-10),
        minutosCocina: 50,
        minutosDespacho: 2,
      },
    ];

    expect(
      cabeConAnticipacion({
        ahora: AHORA,
        franjaDestino: { franjaId: "f13", fin: enMinutos(60) },
        cocinaMin: 20,
        despachoMin: 1,
        compromisos: atrasado,
        params: { ...PARAMS, personalMostrador: 4 },
      }).cabe,
    ).toBe(false);
  });
});

describe("el mostrador es la otra restricción", () => {
  it("limita cuántos se entregan aunque la comida esté lista", () => {
    /*
     * Doce almuerzos caben en la cocina, pero no en el mostrador: con una
     * persona atendiendo y franjas de 15 minutos, a 2 minutos por entrega
     * entran siete, no doce.
     */
    const franja = { franjaId: "f13", fin: enMinutos(60) };
    const casiLleno: CompromisoFranja[] = [
      { ...franja, minutosCocina: 20, minutosDespacho: 14 },
    ];

    const r = cabeConAnticipacion({
      ahora: AHORA,
      franjaDestino: franja,
      cocinaMin: 5,
      despachoMin: 2,
      compromisos: casiLleno,
      params: PARAMS,
    });

    expect(r.cabe).toBe(false);
    expect(r.motivo).toBe("MOSTRADOR_LLENO");
  });

  it("más personal en mostrador atiende a más gente en la misma franja", () => {
    expect(capacidadDespachoFranja(PARAMS)).toBe(15);
    expect(
      capacidadDespachoFranja({ ...PARAMS, personalMostrador: 3 }),
    ).toBe(45);
  });

  it("el mostrador es local a su franja y no se acumula con otras", () => {
    // Que la franja de las 12:30 esté llena de gente no impide entregar en la
    // de las 13:00: son dos ventanas distintas y dos filas distintas.
    const otraLlena: CompromisoFranja[] = [
      {
        franjaId: "f1230",
        fin: enMinutos(30),
        minutosCocina: 1,
        minutosDespacho: 15,
      },
    ];

    expect(
      cabeConAnticipacion({
        ahora: AHORA,
        franjaDestino: { franjaId: "f13", fin: enMinutos(60) },
        cocinaMin: 5,
        despachoMin: 10,
        compromisos: otraLlena,
        params: PARAMS,
      }).cabe,
    ).toBe(true);
  });
});

describe("el factor de seguridad", () => {
  it("recorta las dos capacidades por igual", () => {
    const conColchon = { ...PARAMS, factorSeguridad: 0.8 };
    expect(capacidadCocinaHasta(AHORA, enMinutos(60), conColchon)).toBe(48);
    expect(capacidadDespachoFranja(conColchon)).toBe(12);
  });

  it("un pedido que llena la franja al milímetro no se rechaza por decimales", () => {
    /*
     * `factorSeguridad` es decimal y las capacidades salen con cola binaria:
     * 0.85 × 60 no da exactamente 51. Sin tolerancia, el pedido que encaja
     * clavado se rechaza por un error de representación, y es justo el pedido
     * que más importa admitir.
     */
    const params = { ...PARAMS, factorSeguridad: 0.85 };
    const exacto = capacidadCocinaHasta(AHORA, enMinutos(60), params);

    expect(
      cabeConAnticipacion({
        ahora: AHORA,
        franjaDestino: { franjaId: "f13", fin: enMinutos(60) },
        cocinaMin: exacto,
        despachoMin: 1,
        compromisos: [],
        params: { ...params, personalMostrador: 4 },
      }).cabe,
    ).toBe(true);
  });
});

describe("propiedades", () => {
  const minutos = fc.integer({ min: 1, max: 180 });
  const carga = fc.integer({ min: 0, max: 120 });

  it("lo admitido siempre cabe en el tiempo que la cocina tiene", () => {
    /*
     * La propiedad que sostiene toda la promesa: después de admitir, para cada
     * límite, el trabajo acumulado nunca supera la capacidad hasta ese límite.
     * Si esto se cumple, existe un orden de cocina que cumple todos los
     * pedidos; si se rompiera, ninguno lo haría.
     */
    fc.assert(
      fc.property(
        fc.array(fc.tuple(minutos, carga), { minLength: 1, maxLength: 8 }),
        minutos,
        carga,
        fc.integer({ min: 1, max: 4 }),
        (previos, finNuevo, cargaNueva, personal) => {
          const params: ParametrosCapacidad = {
            personalCocina: personal,
            personalMostrador: 99,
            anchoFranjaMin: 15,
            factorSeguridad: 1,
          };

          const compromisos: CompromisoFranja[] = previos.map(
            ([min, c], i) => ({
              franjaId: `f${i}`,
              fin: enMinutos(min),
              minutosCocina: c,
              minutosDespacho: 0,
            }),
          );

          // Solo interesa el caso en que lo ya comprometido era realizable: si
          // se parte de un estado imposible, cualquier respuesta vale.
          const yaValido = esRealizable(compromisos, AHORA, params);
          fc.pre(yaValido);

          const destino = { franjaId: "nuevo", fin: enMinutos(finNuevo) };
          const r = cabeConAnticipacion({
            ahora: AHORA,
            franjaDestino: destino,
            cocinaMin: cargaNueva,
            despachoMin: 0,
            compromisos,
            params,
          });

          if (!r.cabe) return true;

          return esRealizable(
            [
              ...compromisos,
              {
                franjaId: destino.franjaId,
                fin: destino.fin,
                minutosCocina: cargaNueva,
                minutosDespacho: 0,
              },
            ],
            AHORA,
            params,
          );
        },
      ),
      { numRuns: 400 },
    );
  });

  it("la holgura es exactamente lo que todavía cabe", () => {
    /*
     * Que `holguraCocina` y `cabeConAnticipacion` no se contradigan: lo que la
     * primera dice que entra tiene que entrar, y un minuto más no. Si divergen,
     * la pantalla enseña un número y el servidor aplica otro.
     */
    fc.assert(
      fc.property(
        fc.array(fc.tuple(minutos, carga), { minLength: 1, maxLength: 6 }),
        minutos,
        (previos, finNuevo) => {
          const params: ParametrosCapacidad = {
            personalCocina: 2,
            personalMostrador: 99,
            anchoFranjaMin: 15,
            factorSeguridad: 1,
          };

          const compromisos: CompromisoFranja[] = previos.map(
            ([min, c], i) => ({
              franjaId: `f${i}`,
              fin: enMinutos(min),
              minutosCocina: c,
              minutosDespacho: 0,
            }),
          );
          fc.pre(esRealizable(compromisos, AHORA, params));

          const franja = { franjaId: "nuevo", fin: enMinutos(finNuevo) };
          const h = holguraCocina({
            ahora: AHORA,
            franja,
            compromisos,
            params,
          });

          const pedir = (m: number) =>
            cabeConAnticipacion({
              ahora: AHORA,
              franjaDestino: franja,
              cocinaMin: m,
              despachoMin: 0,
              compromisos,
              params,
            }).cabe;

          // Justo la holgura entra; un minuto más, no.
          return pedir(h) && !pedir(h + 1);
        },
      ),
      { numRuns: 400 },
    );
  });
});

/** Comprobación independiente de la regla, escrita de la forma más obvia. */
function esRealizable(
  compromisos: CompromisoFranja[],
  ahora: Date,
  params: ParametrosCapacidad,
): boolean {
  const limites = [...new Set(compromisos.map((c) => c.fin.getTime()))];
  return limites.every((d) => {
    const trabajo = compromisos
      .filter((c) => c.fin.getTime() <= d)
      .reduce((a, c) => a + c.minutosCocina, 0);
    const disponible = Math.max(
      0,
      ((d - ahora.getTime()) / 60_000) *
        params.personalCocina *
        params.factorSeguridad,
    );
    return trabajo <= disponible + 1e-9;
  });
}
