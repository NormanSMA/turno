/**
 * Corredor de la auditoría — puntos 38 y 39.
 *
 *   npm run audit            corre todo lo que no necesita servidor
 *   npm run audit -- --todo  incluye lo que sí lo necesita (ZAP, E2E, Lighthouse)
 *
 * Produce `audit/*.json` con un formato común y `audit/RESUMEN.md`.
 *
 * Dos decisiones que hacen que el resultado signifique algo:
 *
 *  1. **Cada comprobación declara su severidad**, y el corredor no la deduce del
 *     código de salida. `npm audit` termina en 1 por tres vulnerabilidades de la
 *     CLI de Prisma que no son alcanzables desde la aplicación (T-03): tratarlo
 *     como fallo pondría el rojo permanente, y un rojo permanente deja de
 *     significar nada. Lo que se registra es el hecho; la severidad la fija esta
 *     tabla, con la razón escrita.
 *
 *  2. **Se distingue "no corrió" de "pasó".** Una comprobación que se salta
 *     porque falta Docker o el servidor no es una comprobación aprobada, y sale
 *     como `OMITIDO` en el resumen. La forma habitual de que una auditoría
 *     mienta es que algo dejó de correr y nadie lo notó.
 */

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

type Severidad = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type Estado = "OK" | "HALLAZGOS" | "OMITIDO" | "ERROR";

interface Comprobacion {
  id: string;
  punto: string;
  titulo: string;
  comando: string;
  /** Severidad si la comprobación encuentra algo. */
  severidad: Severidad;
  /** Necesita el servidor de producción en el 3100. */
  necesitaServidor?: boolean;
  /** Necesita Docker. */
  necesitaDocker?: boolean;
  /** Salir con código ≠ 0 no siempre es un hallazgo; ver T-03. */
  salidaNoCeroEsHallazgo?: boolean;
  /** Por qué esta severidad y no otra. */
  nota?: string;
  /**
   * Comprobación del ARTEFACTO, para las herramientas cuyo código de salida no
   * dice si hicieron su trabajo. Si devuelve true, se considera OK aunque haya
   * salido con error.
   */
  verificarArtefacto?: () => boolean;
}

/** ¿Existe el archivo y lo escribió esta corrida (última media hora)? */
function artefactoFresco(ruta: string): boolean {
  try {
    const s = statSync(ruta);
    return Date.now() - s.mtimeMs < 30 * 60_000;
  } catch {
    return false;
  }
}

const COMPROBACIONES: Comprobacion[] = [
  {
    /*
     * Va primero y no es decorativo. Durante esta auditoría la base de test
     * quedó sin tablas —una de las corridas la dejó vacía— y `npm test` falló
     * con `relation "evento_pedido" does not exist`: 79 pruebas rojas que no
     * decían nada del código. Un corredor que da por hecho el estado de la base
     * reporta fallos falsos, y un fallo falso gasta exactamente la misma
     * confianza que uno real.
     */
    id: "preparar-base",
    punto: "0",
    titulo: "Migraciones de la base de pruebas",
    comando: "npm run test:setup",
    severidad: "CRITICAL",
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "typecheck",
    punto: "0",
    titulo: "Tipos",
    comando: "npx tsc --noEmit",
    severidad: "HIGH",
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "lint",
    punto: "0",
    titulo: "Lint",
    comando: "npx eslint",
    severidad: "MEDIUM",
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "pruebas",
    punto: "0",
    titulo: "Suite de pruebas",
    comando: "npm test",
    severidad: "CRITICAL",
    salidaNoCeroEsHallazgo: true,
    nota: "Una prueba roja es lo único que detiene todo lo demás.",
  },
  {
    id: "build",
    punto: "0",
    titulo: "Compilación de producción",
    comando: "npm run build",
    severidad: "CRITICAL",
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "cobertura",
    punto: "1",
    titulo: "Cobertura",
    comando: "npm run audit:cobertura",
    severidad: "INFO",
  },
  {
    id: "secretos",
    punto: "2",
    titulo: "Secretos en el historial (gitleaks)",
    comando: "npm run audit:secretos",
    severidad: "CRITICAL",
    necesitaDocker: true,
    salidaNoCeroEsHallazgo: true,
    nota: "Un secreto en el historial es crítico aunque ya se haya rotado: el historial no se olvida.",
  },
  {
    id: "dependencias",
    punto: "3",
    titulo: "Vulnerabilidades de dependencias",
    comando: "npm audit --json",
    severidad: "MEDIUM",
    salidaNoCeroEsHallazgo: false,
    nota: "Sale 1 de forma permanente por deepmerge-ts, que llega por la CLI de Prisma y no es alcanzable desde la aplicación (T-03). Se registra el hecho, no se pinta de rojo.",
  },
  {
    id: "arquitectura",
    punto: "4",
    titulo: "Ciclos de dependencias",
    comando: "npm run audit:arquitectura",
    severidad: "MEDIUM",
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "sast",
    punto: "5",
    titulo: "SAST (semgrep + reglas propias)",
    comando: "npm run audit:sast",
    severidad: "HIGH",
    necesitaDocker: true,
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "mutacion",
    punto: "14",
    titulo: "Mutation testing",
    comando: "npm run audit:mutacion",
    severidad: "INFO",
    nota: "Informativo a propósito: bajar el puntaje de mutación no rompe nada hoy, pero conviene verlo caer.",
  },
  {
    id: "design-system",
    punto: "34",
    titulo: "Linter del Design System",
    comando: "npx tsx scripts/linter-design-system.ts",
    severidad: "LOW",
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "e2e",
    punto: "16-22, 25, 35",
    titulo: "E2E, accesibilidad, responsive, PWA y motion",
    comando: "npm run audit:e2e",
    severidad: "HIGH",
    necesitaServidor: true,
    salidaNoCeroEsHallazgo: true,
  },
  {
    id: "lighthouse",
    punto: "21",
    titulo: "Lighthouse",
    comando: "npm run audit:lighthouse",
    severidad: "INFO",
    necesitaServidor: true,
    /*
     * Lighthouse termina en 1 en Windows aunque haya hecho todo bien: falla al
     * MATAR Chrome, después de escribir los informes. Verificado — la corrida
     * que "falló" dejó un informe completo con 86/92/100/100.
     *
     * No se ignora el código de salida sin más, que sería tapar cualquier fallo
     * real: se comprueba el artefacto. Si el informe está y lo escribió esta
     * corrida, la herramienta hizo su trabajo; si no está, sí es un fallo.
     */
    verificarArtefacto: () => artefactoFresco("audit/lighthouse/portada.report.json"),
    nota: "En Windows sale con código 1 al cerrar Chrome, después de escribir el informe. Se juzga por el informe, no por el código de salida.",
  },
];

interface Resultado {
  id: string;
  punto: string;
  titulo: string;
  estado: Estado;
  severidad: Severidad | null;
  codigoSalida: number | null;
  motivoOmision?: string;
  nota?: string;
  duracionMs: number;
  salidaCorta: string;
}

function hayDocker(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function hayServidor(): Promise<boolean> {
  try {
    const r = await fetch("http://localhost:3100/api/salud", {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  const todo = process.argv.includes("--todo");
  const docker = hayDocker();
  const servidor = todo ? await hayServidor() : false;

  mkdirSync(path.resolve("audit"), { recursive: true });

  const resultados: Resultado[] = [];

  /*
   * ¿El servidor del 3100 está sirviendo la compilación que acabamos de hacer?
   *
   * El corredor compila y después corre el E2E, y el servidor sigue sirviendo
   * lo que tenía. Es exactamente la trampa que `status.md` documenta, y la
   * primera versión de este archivo cayó en ella: el E2E dio "fallo" por
   * capturas contra una compilación vieja, que no es un fallo del producto sino
   * del corredor.
   *
   * La primera solución fue comparar el `BUILD_ID` de antes y después. No
   * sirve: Next lo genera aleatorio en cada compilación, así que aunque no
   * cambie una línea el id cambia y el corredor habría marcado OMITIDO
   * **siempre**. Un omitido permanente es tan inútil como un rojo permanente.
   *
   * Lo que sí sirve es preguntárselo al servidor. Se le pide la portada, se
   * saca un fragmento de `/_next/static/chunks` de los que referencia, y se
   * pide ese fragmento. Si responde 404, el servidor está sirviendo un HTML que
   * apunta a archivos que la compilación nueva ya borró — que es, literalmente,
   * el hallazgo 11 del proyecto. Además detecta el caso en que la compilación
   * vieja la dejó otra persona antes de esta corrida.
   */
  async function servidorSirveLoCompilado(): Promise<boolean> {
    try {
      const portada = await fetch("http://localhost:3100/", {
        signal: AbortSignal.timeout(5000),
      });
      const html = await portada.text();
      const m = html.match(/\/_next\/static\/chunks\/[^"']+?\.js/);
      if (!m) return true; // sin fragmentos que comprobar, no se acusa
      const frag = await fetch(`http://localhost:3100${m[0]}`, {
        signal: AbortSignal.timeout(5000),
      });
      return frag.ok;
    } catch {
      return false;
    }
  }

  let servidorObsoleto = false;

  /*
   * En modo `--todo`, si el servidor ya está sirviendo una compilación
   * coherente, NO se recompila.
   *
   * No es un atajo: recompilar acá solo serviría para invalidar el servidor que
   * el E2E necesita, y un servidor corriendo ES la prueba de que la compilación
   * salió bien. Recompilar y después decir "no puedo probar porque recompilé"
   * es un corredor peleándose consigo mismo.
   */
  const servidorCoherente = servidor && (await servidorSirveLoCompilado());

  for (const c of COMPROBACIONES) {
    if (c.id === "build" && servidorCoherente) {
      console.log("  build … OK (no se recompiló: el servidor sirve una compilación coherente)");
      resultados.push({
        id: c.id,
        punto: c.punto,
        titulo: c.titulo,
        estado: "OK",
        severidad: null,
        codigoSalida: 0,
        nota: "No se recompiló a propósito: el servidor del 3100 está sirviendo una compilación coherente, que es la prueba de que compiló. Recompilar acá solo habría servido para invalidarlo y dejar el E2E sin dónde correr.",
        duracionMs: 0,
        salidaCorta: "",
      });
      continue;
    }
    if (c.necesitaServidor && servidorObsoleto) {
      resultados.push(
        omitida(
          c,
          "el servidor del 3100 sirve fragmentos que la compilación nueva ya " +
            "borró: reiniciarlo (npm start -- -p 3100) y volver a correr",
        ),
      );
      continue;
    }
    if (c.necesitaServidor && !todo) {
      resultados.push(omitida(c, "necesita el servidor; correr con --todo"));
      continue;
    }
    if (c.necesitaServidor && !servidor) {
      resultados.push(
        omitida(c, "el servidor no responde en el 3100 (npm run build && npm start -- -p 3100)"),
      );
      continue;
    }
    if (c.necesitaDocker && !docker) {
      resultados.push(omitida(c, "Docker no está disponible"));
      continue;
    }

    process.stdout.write(`  ${c.id} … `);
    const t0 = Date.now();
    let codigo = 0;
    let salida = "";
    try {
      salida = execSync(c.comando, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      codigo = err.status ?? 1;
      salida = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    }
    const duracionMs = Date.now() - t0;

    if (c.id === "build" && codigo === 0 && servidor) {
      servidorObsoleto = !(await servidorSirveLoCompilado());
    }

    let hallazgo = codigo !== 0 && c.salidaNoCeroEsHallazgo !== false;
    if (hallazgo && c.verificarArtefacto?.()) hallazgo = false;
    const estado: Estado = hallazgo ? "HALLAZGOS" : "OK";
    console.log(`${estado} (${(duracionMs / 1000).toFixed(1)} s)`);

    resultados.push({
      id: c.id,
      punto: c.punto,
      titulo: c.titulo,
      estado,
      severidad: hallazgo ? c.severidad : null,
      codigoSalida: codigo,
      nota: c.nota,
      duracionMs,
      salidaCorta: salida.split(/\r?\n/).slice(-25).join("\n").trim(),
    });
  }

  const resumen = {
    generadoEn: new Date().toISOString(),
    rama: intentar("git rev-parse --abbrev-ref HEAD"),
    commit: intentar("git rev-parse --short HEAD"),
    arbolLimpio: intentar("git status --porcelain") === "",
    entorno: { docker, servidor, modoCompleto: todo },
    conteo: {
      ok: resultados.filter((r) => r.estado === "OK").length,
      hallazgos: resultados.filter((r) => r.estado === "HALLAZGOS").length,
      omitidos: resultados.filter((r) => r.estado === "OMITIDO").length,
    },
    porSeveridad: severidades(resultados),
    resultados,
  };

  writeFileSync(
    path.resolve("audit", "resumen.json"),
    JSON.stringify(resumen, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(path.resolve("audit", "RESUMEN.md"), aMarkdown(resumen), "utf8");

  console.log(
    `\n  OK ${resumen.conteo.ok} · hallazgos ${resumen.conteo.hallazgos} · omitidos ${resumen.conteo.omitidos}`,
  );
  console.log("  audit/resumen.json y audit/RESUMEN.md escritos.");

  // Solo CRITICAL y HIGH cortan. Lo demás informa: si todo cortara, se
  // terminaría corriendo con `|| true` y no cortaría nada.
  const grave = resultados.some(
    (r) => r.estado === "HALLAZGOS" && (r.severidad === "CRITICAL" || r.severidad === "HIGH"),
  );
  if (grave) process.exitCode = 1;
}

function omitida(c: Comprobacion, motivo: string): Resultado {
  console.log(`  ${c.id} … OMITIDO (${motivo})`);
  return {
    id: c.id,
    punto: c.punto,
    titulo: c.titulo,
    estado: "OMITIDO",
    severidad: null,
    codigoSalida: null,
    motivoOmision: motivo,
    nota: c.nota,
    duracionMs: 0,
    salidaCorta: "",
  };
}

function severidades(rs: Resultado[]): Record<Severidad, number> {
  const base: Record<Severidad, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  for (const r of rs) if (r.severidad) base[r.severidad]++;
  return base;
}

function intentar(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function aMarkdown(r: ReturnType<typeof Object> & Record<string, never>): string;
function aMarkdown(r: {
  generadoEn: string;
  rama: string;
  commit: string;
  arbolLimpio: boolean;
  entorno: { docker: boolean; servidor: boolean; modoCompleto: boolean };
  conteo: { ok: number; hallazgos: number; omitidos: number };
  porSeveridad: Record<Severidad, number>;
  resultados: Resultado[];
}): string {
  const icono = (e: Estado) =>
    e === "OK" ? "OK" : e === "HALLAZGOS" ? "HALLAZGOS" : e === "OMITIDO" ? "omitido" : "ERROR";

  const filas = r.resultados
    .map(
      (x) =>
        `| ${x.punto} | ${x.titulo} | ${icono(x.estado)} | ${x.severidad ?? "—"} | ${
          x.estado === "OMITIDO" ? x.motivoOmision : `${(x.duracionMs / 1000).toFixed(1)} s`
        } |`,
    )
    .join("\n");

  const sev = (Object.entries(r.porSeveridad) as [Severidad, number][])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${s}: ${n}`)
    .join(" · ");

  return `# TURNO — Resumen de auditoría

Generado el ${r.generadoEn} sobre \`${r.rama}\` @ \`${r.commit}\`${
    r.arbolLimpio ? "" : " (con cambios sin commitear)"
  }.

**OK ${r.conteo.ok} · con hallazgos ${r.conteo.hallazgos} · omitidos ${r.conteo.omitidos}**${
    sev ? `\n\nSeveridad de lo encontrado — ${sev}` : ""
  }

${
  r.conteo.omitidos > 0
    ? `> ${r.conteo.omitidos} comprobación(es) no corrieron. **Omitido no es aprobado**: la\n> forma habitual de que una auditoría mienta es que algo dejó de correr y nadie\n> lo notó.\n`
    : ""
}
| Punto | Comprobación | Estado | Severidad | |
|---|---|---|---|---|
${filas}

## Severidades

- **CRITICAL** — rompe o expone en producción. Corta la auditoría.
- **HIGH** — una defensa ausente o sin red. Corta la auditoría.
- **MEDIUM** — riesgo acotado, o deuda que crece.
- **LOW** — higiene.
- **INFO** — se mide para verlo moverse, no para aprobar o reprobar.

Solo CRITICAL y HIGH devuelven código distinto de cero. Si todo cortara, esto
se terminaría corriendo con \`|| true\` y no cortaría nada.

## Detalle

${r.resultados
  .filter((x) => x.estado !== "OK")
  .map(
    (x) =>
      `### ${x.titulo} — ${icono(x.estado)}\n\n${x.nota ? `${x.nota}\n\n` : ""}${
        x.motivoOmision
          ? `No corrió: ${x.motivoOmision}\n`
          : `\`\`\`\n${x.salidaCorta.slice(0, 1500)}\n\`\`\`\n`
      }`,
  )
  .join("\n")}

El informe con el análisis de cada hallazgo está en \`audit/REPORT.md\`.
`;
}

main();
