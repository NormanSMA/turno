/**
 * El código de retiro.
 *
 * Lo que protegen estas pruebas es que **las tres formas de introducir el mismo
 * código lleguen al mismo pedido**: escaneado del QR, dictado en el mostrador, o
 * tecleado. Si divergen, el fallo aparece en el peor momento posible —con el
 * estudiante delante y la comida lista— y parece un pedido perdido.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ALFABETO_CODIGO,
  LARGO_CODIGO,
  mismoCodigo,
  normalizarCodigo,
  pareceCompleto,
} from "@/core/codigo-retiro";

describe("normalizar", () => {
  it("las tres formas de escribir un código son la misma", () => {
    const formas = [
      "ABC-DEF", // como lo trae el QR y como se muestra
      "ABCDEF", // dictado, sin el guion
      "abc-def", // tecleado sin mayúsculas
      " ABC DEF ", // lector USB que intercala espacios
      "ABC—DEF", // guion largo del autocorrector del móvil
    ];

    for (const f of formas) {
      expect(normalizarCodigo(f), f).toBe("ABCDEF");
    }
  });

  it("no inventa equivalencias que el alfabeto no tiene", () => {
    /*
     * El alfabeto excluye O/0 e I/1 justamente para que nunca haya que decidir
     * cuál quiso decir la persona. Si esto llegara a "corregir" una O a un 0,
     * estaría resolviendo una ambigüedad inexistente y podría llevar al pedido
     * equivocado.
     */
    expect(normalizarCodigo("O")).toBe("O");
    expect(normalizarCodigo("0")).toBe("0");
    expect(mismoCodigo("ABCDEO", "ABCDE0")).toBe(false);
  });

  it("un texto vacío no coincide con nada", () => {
    // Sin esto, el campo recién abierto casaría con el primer pedido de la cola.
    expect(mismoCodigo("", "")).toBe(false);
    expect(mismoCodigo("---", "ABC-DEF")).toBe(false);
  });
});

describe("el alfabeto", () => {
  it("no contiene los caracteres que se confunden al leer o dictar", () => {
    for (const c of ["O", "0", "I", "1"]) {
      expect(ALFABETO_CODIGO.includes(c), c).toBe(false);
    }
  });

  it("no repite ningún carácter", () => {
    // Un carácter repetido sesga la generación hacia él sin que se note.
    expect(new Set(ALFABETO_CODIGO).size).toBe(ALFABETO_CODIGO.length);
  });
});

describe("saber cuándo dejar de esperar", () => {
  it("solo declara completo lo que tiene el largo del código", () => {
    expect(pareceCompleto("ABC")).toBe(false);
    expect(pareceCompleto("ABC-DE")).toBe(false);
    expect(pareceCompleto("ABC-DEF")).toBe(true);
    expect(pareceCompleto("abcdef")).toBe(true);
  });

  it("el guion no cuenta como carácter del código", () => {
    // "ABC-DE" son seis caracteres escritos pero cinco de código: si el guion
    // contara, la pantalla diría "no existe" antes de que terminen de teclear.
    expect("ABC-DE".length).toBe(LARGO_CODIGO);
    expect(pareceCompleto("ABC-DE")).toBe(false);
  });
});

describe("propiedades", () => {
  it("un código generado siempre se reconoce a sí mismo, escrito como sea", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ALFABETO_CODIGO), {
          minLength: LARGO_CODIGO,
          maxLength: LARGO_CODIGO,
        }),
        (letras) => {
          const crudo = letras.join("");
          const conGuion = `${crudo.slice(0, 3)}-${crudo.slice(3)}`;

          return (
            mismoCodigo(conGuion, crudo) &&
            mismoCodigo(conGuion, conGuion.toLowerCase()) &&
            mismoCodigo(conGuion, ` ${conGuion} `) &&
            pareceCompleto(conGuion)
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("normalizar dos veces da lo mismo que una", () => {
    // Idempotencia: el valor puede pasar por el normalizador en el campo y otra
    // vez al comparar, y eso no puede cambiar el resultado.
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalizarCodigo(normalizarCodigo(s))).toBe(normalizarCodigo(s));
      }),
    );
  });
});
