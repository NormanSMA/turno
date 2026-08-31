/**
 * Invariantes del modelo, con generación aleatoria (fast-check).
 *
 * Puntos 12 y 13 de la auditoría técnica.
 *
 * La diferencia con las pruebas nominales que ya existen: aquellas comprueban
 * casos que alguien pensó, y por eso solo encuentran los errores que alguien ya
 * imaginó. Acá se declara la **propiedad** —lo que tiene que valer siempre— y
 * la biblioteca busca el contraejemplo, incluidos los valores que a nadie se le
 * ocurre escribir a mano: cero, negativos, `NaN` donde se puede colar, un
 * pedido con quince líneas de cantidad diez.
 *
 * Cuando falla, `fast-check` **reduce** el contraejemplo al más pequeño que
 * sigue fallando, que es lo que lo vuelve útil en vez de anecdótico.
 *
 * El núcleo es puro y recibe el reloj por parámetro, así que todo esto corre
 * sin base y sin servidor.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  ESTADOS_ACTIVOS,
  ESTADOS_TERMINALES,
  correspondeNoShow,
  esTerminal,
  evaluarCumplimiento,
  exigirTransicion,
  ocupaCapacidad,
  puedeCancelar,
  puedeTransicionar,
  transicionesDesde,
  TransicionInvalida,
  type EstadoPedido,
} from "@/core/estados";
import {
  cabeEnFranja,
  capacidadEfectiva,
  cargaPedido,
  holgura,
  ocupacionProyectada,
  type FranjaCapacidad,
  type LineaPedido,
} from "@/core/admision";
import { huellaSolicitud } from "@/core/reserva";

const ESTADOS: EstadoPedido[] = [
  "RECIBIDO",
  "EN_PREPARACION",
  "LISTO",
  "RETIRADO",
  "NO_SHOW",
  "CANCELADO",
];

const unEstado = fc.constantFrom(...ESTADOS);
const unActor = fc.constantFrom("USUARIO" as const, "COMERCIO" as const, "ADMIN" as const);
const unaFecha = fc.date({
  min: new Date("2026-01-01T00:00:00Z"),
  max: new Date("2027-01-01T00:00:00Z"),
  noInvalidDate: true,
});

const unaFranja = (): fc.Arbitrary<FranjaCapacidad> =>
  fc.record({
    id: fc.uuid(),
    inicio: unaFecha,
    fin: unaFecha,
    capacidadMinutos: fc.integer({ min: 0, max: 600 }),
    cargaAsignada: fc.integer({ min: 0, max: 600 }),
    abierta: fc.boolean(),
  }) as unknown as fc.Arbitrary<FranjaCapacidad>;

const unAlfa = fc.double({ min: 0, max: 1, noNaN: true });

const unaLinea = (): fc.Arbitrary<LineaPedido> =>
  fc.record({
    cantidad: fc.integer({ min: 1, max: 10 }),
    producto: fc.record({
      id: fc.uuid(),
      tiempoPreparacionMin: fc.integer({ min: 0, max: 60 }),
      anticipable: fc.boolean(),
      disponible: fc.boolean(),
      precio: fc.constant("100.00"),
    }),
  }) as unknown as fc.Arbitrary<LineaPedido>;

// ===========================================================================
describe("máquina de estados · invariantes", () => {
  it("un estado terminal no tiene ninguna salida", () => {
    fc.assert(
      fc.property(unEstado, unEstado, (desde, hacia) => {
        if (!esTerminal(desde)) return true;
        return puedeTransicionar(desde, hacia) === false;
      }),
    );
  });

  it("terminal y ocupar capacidad son mutuamente excluyentes, y cubren todo", () => {
    // No puede haber un estado que ni ocupe capacidad ni sea terminal: sería un
    // pedido en el limbo, sin cocina reservada y sin cerrar. Tampoco uno que
    // sea las dos cosas: capacidad reservada para siempre.
    fc.assert(
      fc.property(unEstado, (e) => esTerminal(e) !== ocupaCapacidad(e)),
    );
    expect(new Set([...ESTADOS_ACTIVOS, ...ESTADOS_TERMINALES]).size).toBe(
      ESTADOS.length,
    );
  });

  it("ninguna transición vuelve al mismo estado", () => {
    fc.assert(fc.property(unEstado, (e) => !puedeTransicionar(e, e)));
  });

  it("desde cualquier estado no terminal se llega a un terminal", () => {
    // Sin esto podría existir un ciclo que atrapa un pedido para siempre.
    const alcanzaTerminal = (inicio: EstadoPedido, vistos = new Set<EstadoPedido>()): boolean => {
      if (esTerminal(inicio)) return true;
      if (vistos.has(inicio)) return false;
      vistos.add(inicio);
      return transicionesDesde(inicio).some((s) => alcanzaTerminal(s, new Set(vistos)));
    };
    fc.assert(fc.property(unEstado, (e) => alcanzaTerminal(e)));
  });

  it("exigirTransicion lanza exactamente cuando puedeTransicionar dice que no", () => {
    fc.assert(
      fc.property(unEstado, unEstado, (desde, hacia) => {
        const permitida = puedeTransicionar(desde, hacia);
        try {
          exigirTransicion(desde, hacia);
          return permitida;
        } catch (e) {
          return !permitida && e instanceof TransicionInvalida;
        }
      }),
    );
  });

  it("el usuario nunca puede cancelar más que el comercio", () => {
    // La regla de producto: el usuario cancela solo antes de que la cocina
    // gaste el insumo (S-01). Nunca al revés.
    fc.assert(
      fc.property(unEstado, (e) => {
        if (!puedeCancelar(e, "USUARIO")) return true;
        return puedeCancelar(e, "COMERCIO") && puedeCancelar(e, "ADMIN");
      }),
    );
  });

  it("nadie puede cancelar un pedido ya terminal", () => {
    fc.assert(
      fc.property(unEstado, unActor, (e, actor) =>
        esTerminal(e) ? !puedeCancelar(e, actor) : true,
      ),
    );
  });
});

// ===========================================================================
describe("cumplimiento · invariantes (indicador 2)", () => {
  it("siempre devuelve uno de los cuatro valores declarados", () => {
    fc.assert(
      fc.property(unEstado, fc.option(unaFecha), unaFecha, unaFecha, (estado, listoEn, finFranja, ahora) => {
        const r = evaluarCumplimiento({ estado, listoEn, finFranja, ahora });
        return ["PENDIENTE", "CUMPLIDO", "INCUMPLIDO", "NO_APLICA"].includes(r);
      }),
    );
  });

  it("con `listoEn` puesto, el veredicto solo depende de listoEn vs finFranja", () => {
    // Y en particular NO del reloj: una vez que el pedido estuvo listo, mirar
    // el informe más tarde no puede cambiar si se cumplió. Si dependiera de
    // `ahora`, el Capítulo V daría un número distinto cada vez que se corre.
    fc.assert(
      fc.property(
        fc.constantFrom<EstadoPedido>("RECIBIDO", "EN_PREPARACION", "LISTO", "RETIRADO", "NO_SHOW"),
        unaFecha,
        unaFecha,
        unaFecha,
        unaFecha,
        (estado, listoEn, finFranja, ahora1, ahora2) => {
          const a = evaluarCumplimiento({ estado, listoEn, finFranja, ahora: ahora1 });
          const b = evaluarCumplimiento({ estado, listoEn, finFranja, ahora: ahora2 });
          return a === b && a === (listoEn <= finFranja ? "CUMPLIDO" : "INCUMPLIDO");
        },
      ),
    );
  });

  it("sin `listoEn`, nunca puede decir CUMPLIDO", () => {
    // Un pedido que nunca estuvo listo no cumplió la promesa, se mire cuando
    // se mire.
    fc.assert(
      fc.property(
        fc.constantFrom<EstadoPedido>("RECIBIDO", "EN_PREPARACION", "LISTO", "RETIRADO", "NO_SHOW"),
        unaFecha,
        unaFecha,
        (estado, finFranja, ahora) =>
          evaluarCumplimiento({ estado, listoEn: null, finFranja, ahora }) !== "CUMPLIDO",
      ),
    );
  });

  it("PENDIENTE es imposible una vez pasada la franja", () => {
    fc.assert(
      fc.property(unEstado, fc.option(unaFecha), unaFecha, (estado, listoEn, finFranja) => {
        const despues = new Date(finFranja.getTime() + 60_000);
        return (
          evaluarCumplimiento({ estado, listoEn, finFranja, ahora: despues }) !== "PENDIENTE"
        );
      }),
    );
  });
});

// ===========================================================================
describe("no-show · invariantes", () => {
  it("solo se marca desde LISTO y con `listoEn`", () => {
    fc.assert(
      fc.property(
        unEstado,
        fc.option(unaFecha),
        fc.integer({ min: 0, max: 120 }),
        unaFecha,
        (estado, listoEn, minutosNoShow, ahora) => {
          const r = correspondeNoShow({ estado, listoEn, minutosNoShow, ahora });
          return r ? estado === "LISTO" && listoEn !== null : true;
        },
      ),
    );
  });

  it("es monótono en el tiempo: si corresponde ahora, corresponde después", () => {
    // Sin esta propiedad, el barrido del cron podría "des-marcar" un no-show al
    // correr más tarde, y el análisis dependería de a qué hora se corrió.
    fc.assert(
      fc.property(
        unaFecha,
        fc.integer({ min: 0, max: 120 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (listoEn, minutosNoShow, d1, d2) => {
          const t1 = new Date(listoEn.getTime() + Math.min(d1, d2));
          const t2 = new Date(listoEn.getTime() + Math.max(d1, d2));
          const a = correspondeNoShow({ estado: "LISTO", listoEn, minutosNoShow, ahora: t1 });
          const b = correspondeNoShow({ estado: "LISTO", listoEn, minutosNoShow, ahora: t2 });
          return a ? b : true;
        },
      ),
    );
  });

  it("nunca corresponde antes de que pase el umbral", () => {
    fc.assert(
      fc.property(unaFecha, fc.integer({ min: 1, max: 120 }), (listoEn, minutosNoShow) => {
        const justoAntes = new Date(listoEn.getTime() + minutosNoShow * 60_000 - 1);
        return !correspondeNoShow({ estado: "LISTO", listoEn, minutosNoShow, ahora: justoAntes });
      }),
    );
  });
});

// ===========================================================================
describe("admisión · invariantes de capacidad (indicador 9)", () => {
  it("la holgura nunca es negativa", () => {
    fc.assert(fc.property(unaFranja(), unAlfa, (f, a) => holgura(f, a) >= 0));
  });

  it("si cabe, admitirlo no rompe el techo α·C(f)", () => {
    // ES el invariante del indicador 9, escrito como propiedad: no hay ninguna
    // combinación de capacidad, carga previa, α y peso del pedido que pase la
    // comprobación y deje la franja sobrevendida.
    fc.assert(
      fc.property(unaFranja(), unAlfa, fc.integer({ min: 0, max: 600 }), (f, a, carga) => {
        if (!cabeEnFranja(f, carga, a)) return true;
        return f.cargaAsignada + carga <= capacidadEfectiva(f, a);
      }),
    );
  });

  it("una franja cerrada nunca admite nada, ni con carga cero", () => {
    fc.assert(
      fc.property(unaFranja(), unAlfa, fc.integer({ min: 0, max: 600 }), (f, a, carga) =>
        f.abierta ? true : !cabeEnFranja({ ...f, abierta: false }, carga, a),
      ),
    );
  });

  it("cabeEnFranja es monótona: si no cabe un pedido, no cabe uno mayor", () => {
    fc.assert(
      fc.property(
        unaFranja(),
        unAlfa,
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 0, max: 300 }),
        (f, a, c1, extra) => {
          if (cabeEnFranja(f, c1 + extra, a)) return cabeEnFranja(f, c1, a);
          return true;
        },
      ),
    );
  });

  it("la ocupación proyectada crece con la carga y nunca es NaN", () => {
    fc.assert(
      fc.property(
        unaFranja(),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 1, max: 300 }),
        (f, a, c, extra) => {
          const o1 = ocupacionProyectada(f, c, a);
          const o2 = ocupacionProyectada(f, c + extra, a);
          if (Number.isNaN(o1) || Number.isNaN(o2)) return false;
          return o2 >= o1;
        },
      ),
    );
  });

  it("la carga de un pedido es la suma de sus líneas, y quitar una nunca la sube", () => {
    fc.assert(
      fc.property(fc.array(unaLinea(), { minLength: 1, maxLength: 15 }), (lineas) => {
        const total = cargaPedido(lineas);
        const sinLaPrimera = cargaPedido(lineas.slice(1));
        return total >= sinLaPrimera && total >= 0 && Number.isFinite(total);
      }),
    );
  });

  it("un carrito vacío pesa cero", () => {
    expect(cargaPedido([])).toBe(0);
  });
});

// ===========================================================================
describe("huella de idempotencia · invariantes (T-13)", () => {
  const unosItems = fc.array(
    fc.record({ productoId: fc.uuid(), cantidad: fc.integer({ min: 1, max: 10 }) }),
    { minLength: 1, maxLength: 15 },
  );

  it("no depende del orden de las líneas", () => {
    fc.assert(
      fc.property(fc.uuid(), unosItems, (c, items) => {
        const revuelto = [...items].reverse();
        return huellaSolicitud(c, items) === huellaSolicitud(c, revuelto);
      }),
    );
  });

  it("dos pedidos distintos nunca comparten huella", () => {
    // La propiedad que sostiene el arreglo de T-13: si la huella colisionara,
    // un pedido distinto pasaría como reintento y se devolvería el código de
    // retiro equivocado.
    fc.assert(
      fc.property(fc.uuid(), unosItems, unosItems, (c, a, b) => {
        const clave = (xs: typeof a) =>
          JSON.stringify([...xs].map((i) => [i.productoId, i.cantidad]).sort());
        if (clave(a) === clave(b)) return true;
        return huellaSolicitud(c, a) !== huellaSolicitud(c, b);
      }),
    );
  });

  it("cambiar de comercio siempre cambia la huella", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), unosItems, (c1, c2, items) =>
        c1 === c2 ? true : huellaSolicitud(c1, items) !== huellaSolicitud(c2, items),
      ),
    );
  });
});
