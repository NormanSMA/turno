/**
 * Linter del Design System — punto 34 de la auditoría técnica.
 *
 *   npm run audit:design
 *
 * Qué busca y por qué cada regla existe:
 *
 *   1. **Colores fuera de token.** Un `#c91525` escrito a mano en un componente
 *      no cambia cuando cambia el tema, así que en modo oscuro queda el color de
 *      modo claro. Es exactamente lo que pasó con `text-[#9a9a9a]` en
 *      `ModoMostrador`, que además arrastraba un contraste de 2.81:1.
 *
 *   2. **Radios y alturas fuera de la escala.** La escala es de 4 px. Un
 *      `rounded-[7px]` o un `h-[37px]` no se ven mal solos; se ven mal al lado
 *      de los que sí siguen la escala, y nadie sabe decir por qué.
 *
 *   3. **Emojis.** Regla de producto de Norman, sin excepciones.
 *
 * Lo que este linter NO comprueba, y conviene decirlo para que nadie lo dé por
 * cubierto: la regla de "el color nunca va solo" —que todo estado se comunique
 * además con número o palabra— no se puede decidir mirando una línea de texto,
 * porque hace falta saber si el elemento tiene contenido accesible. Eso lo
 * cubre el barrido de axe del punto 20, que sí mira el DOM renderizado.
 *
 * El linter NO falla por cosas que ya están decididas: `audit/design-system.
 * excepciones.json` lleva las exclusiones con su motivo escrito, para que una
 * excepción sea una decisión visible y no un silencio.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

interface Hallazgo {
  archivo: string;
  linea: number;
  regla: string;
  texto: string;
  detalle: string;
}

const RAIZ = path.resolve(process.cwd(), "src");

/** Los hex que el propio Design System declara: verlos ahí es correcto. */
function hexDeclarados(): Set<string> {
  const css = readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");
  const s = new Set<string>();
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) s.add(m[0].toLowerCase());
  return s;
}

function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "generated") continue;
      archivos(p, acc);
    } else if (/\.tsx?$/.test(e)) {
      acc.push(p);
    }
  }
  return acc;
}

/** La escala es de 4 px. Se aceptan además los valores de 1 y 2 px (bordes). */
function fueraDeEscala(px: number): boolean {
  return px > 2 && px % 4 !== 0;
}

interface Excepcion {
  archivo: string;
  regla: string;
  motivo: string;
}

function excepciones(): Excepcion[] {
  const p = path.resolve(process.cwd(), "audit", "design-system.excepciones.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8")) as Excepcion[];
}

/**
 * Las proporciones de imagen permitidas (fase 8 del rediseño).
 *
 * Cerrada a propósito: agregar una es una decisión de diseño con consecuencias
 * en pantallas chicas, no un detalle de implementación. Quien necesite otra,
 * que la discuta y la documente acá.
 */
const PROPORCIONES = new Set(["4/3", "16/10", "3/1"]);

export function analizar(): Hallazgo[] {
  const declarados = hexDeclarados();
  const exentos = excepciones();
  const hallazgos: Hallazgo[] = [];

  const eximido = (archivo: string, regla: string) =>
    exentos.some(
      (e) => archivo.replace(/\\/g, "/").endsWith(e.archivo) && e.regla === regla,
    );

  for (const abs of archivos(RAIZ)) {
    const rel = path.relative(process.cwd(), abs).replace(/\\/g, "/");
    // El propio archivo de tokens y los iconos generados quedan fuera: es donde
    // los valores literales viven por definición.
    if (rel.endsWith("globals.css")) continue;

    const lineas = readFileSync(abs, "utf8").split(/\r?\n/);
    lineas.forEach((linea, i) => {
      const n = i + 1;
      const codigo = linea.replace(/\/\/.*$/, "");

      // 1 — color literal fuera de token
      if (!eximido(rel, "color-literal")) {
        for (const m of codigo.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
          const hex = m[0].toLowerCase();
          // Si el hex ES uno de los declarados en globals.css, sigue siendo un
          // literal: el problema no es el valor, es que no pasa por el token.
          hallazgos.push({
            archivo: rel,
            linea: n,
            regla: "color-literal",
            texto: m[0],
            detalle: declarados.has(hex)
              ? `es el valor de un token declarado: usar la variable, no el hex`
              : `color fuera del Design System`,
          });
        }
      }

      // 2 — radios y alturas arbitrarias
      if (!eximido(rel, "escala-4px")) {
        for (const m of codigo.matchAll(
          /\b(?:rounded|h|w|min-h|min-w|p|px|py|m|mx|my|gap|top|bottom|left|right)-\[(\d+(?:\.\d+)?)px\]/g,
        )) {
          const px = Number(m[1]);
          if (fueraDeEscala(px)) {
            hallazgos.push({
              archivo: rel,
              linea: n,
              regla: "escala-4px",
              texto: m[0],
              detalle: `${px}px no está en la escala de 4`,
            });
          }
        }
      }

      /*
       * 3 — proporción de imagen fuera de contrato
       *
       * Las tres proporciones están elegidas con razón documentada: 4:3 en la
       * tarjeta (§43), 16:10 con `max-h-[32dvh]` en la hoja para que el botón
       * no se salga en teléfonos chicos, y 3:1 en la tira del comercio. Un
       * "contrato mejorado" a 3:2 rompe la hoja en un iPhone SE, y eso solo se
       * descubre en el teléfono de alguien.
       */
      if (!eximido(rel, "proporcion-imagen")) {
        for (const m of codigo.matchAll(/\baspect-\[([^\]]+)\]/g)) {
          if (!PROPORCIONES.has(m[1])) {
            hallazgos.push({
              archivo: rel,
              linea: n,
              regla: "proporcion-imagen",
              texto: m[0],
              detalle: `fuera del contrato de imagen: ${[...PROPORCIONES].join(", ")}`,
            });
          }
        }
      }

      // 4 — emojis
      if (!eximido(rel, "sin-emojis")) {
        for (const m of linea.matchAll(/[\u{1F000}-\u{1FAFF}]|\u{FE0F}/gu)) {
          hallazgos.push({
            archivo: rel,
            linea: n,
            regla: "sin-emojis",
            texto: m[0],
            detalle: "regla de producto: nunca emojis",
          });
        }
      }
    });
  }

  return hallazgos;
}

function main() {
  const hallazgos = analizar();
  const porRegla = new Map<string, Hallazgo[]>();
  for (const h of hallazgos) {
    porRegla.set(h.regla, [...(porRegla.get(h.regla) ?? []), h]);
  }

  if (hallazgos.length === 0) {
    console.log("Design System: sin hallazgos.");
    return;
  }

  for (const [regla, lista] of [...porRegla].sort()) {
    console.log(`\n── ${regla} · ${lista.length} ${lista.length === 1 ? "caso" : "casos"}`);
    for (const h of lista) {
      console.log(`   ${h.archivo}:${h.linea}  ${h.texto}  — ${h.detalle}`);
    }
  }
  console.log(`\nTotal: ${hallazgos.length}`);
  process.exitCode = 1;
}

if (process.argv[1]?.includes("linter-design-system")) main();
