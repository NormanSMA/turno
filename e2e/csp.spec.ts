/**
 * Prueba de CSP (ADR-23).
 *
 * Las librerías de la v2 (Motion, Lottie, Sonner, Vaul) inyectan scripts y
 * estilos. Esta prueba corre sobre la compilación de producción, que es la que
 * lleva nonce y `strict-dynamic`, y falla si cualquier ruta:
 *   - dispara un `securitypolicyviolation`,
 *   - pide algo a otro origen,
 *   - o sirve una CSP más débil que la acordada (`unsafe-eval`, sin nonce...).
 *
 * El control negativo demuestra que la prueba sabe ver una violación: sin él,
 * "cero violaciones" podría significar "el detector no funciona".
 */
import { expect, test, type Page } from "@playwright/test";
import { consultar, entrar } from "./sesion";

const ESTUDIANTE = "estudiante001@uam.edu.ni";
const COMERCIO = "jaguar@uamv.edu.ni";
const ADMIN = "admin@uamv.edu.ni";
const SLUG = "comedor-el-jaguar";

type Violacion = { directiva: string; bloqueada: string };

async function vigilarCsp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: Violacion[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__csp.push({
        directiva: e.violatedDirective,
        bloqueada: e.blockedURI,
      });
    });
  });
}

const leerViolaciones = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp: Violacion[] }).__csp);

type Ruta = {
  nombre: string;
  ruta: () => Promise<string | null>;
  correo?: string;
  /** Selector que prueba que la ruta llegó a su estado final. */
  listo: string;
};

const RUTAS: Ruta[] = [
  { nombre: "portada", ruta: async () => "/", listo: "h1" },
  { nombre: "identidad con personajes", ruta: async () => "/identidad", listo: "svg[role=img]" },
  { nombre: "explorar", ruta: async () => "/explorar", listo: "main" },
  { nombre: "comercio publico", ruta: async () => `/c/${SLUG}`, listo: "main" },
  // La 404 monta la animación Lottie: es la ruta que prueba el build light.
  {
    nombre: "estado vacio con Lottie",
    ruta: async () => "/ruta-que-no-existe-csp",
    listo: "svg[width][height] g",
  },
  {
    nombre: "pedido",
    correo: ESTUDIANTE,
    ruta: async () => {
      const [fila] = await consultar<{ id: string }>(
        `SELECT p.id FROM pedido p JOIN usuario u ON u.id = p."usuarioId"
         WHERE u.correo = $1 ORDER BY p."creadoEn" DESC LIMIT 1`,
        [ESTUDIANTE],
      );
      return fila ? `/pedido/${fila.id}` : null;
    },
    listo: "main",
  },
  { nombre: "cocina", correo: COMERCIO, ruta: async () => `/cocina/${SLUG}`, listo: "main" },
  {
    nombre: "informe del comercio",
    correo: COMERCIO,
    ruta: async () => `/comercio/${SLUG}/informe`,
    listo: "main",
  },
  { nombre: "panel", correo: ADMIN, ruta: async () => "/panel", listo: "main" },
];

for (const modo of ["reduce", "no-preference"] as const) {
  test.describe(`CSP con movimiento ${modo}`, () => {
    test.use({ contextOptions: { reducedMotion: modo } });

    for (const r of RUTAS) {
      test(`${r.nombre}: sin violaciones ni orígenes externos`, async ({
        page,
        context,
        baseURL,
      }) => {
        const destino = await r.ruta();
        test.skip(destino === null, `sin datos demo para ${r.nombre}`);

        if (r.correo) await entrar(context, r.correo);
        await vigilarCsp(page);

        const externas: string[] = [];
        const origen = new URL(baseURL ?? "http://localhost:3100").origin;
        page.on("request", (req) => {
          const u = req.url();
          if (!u.startsWith("data:") && !u.startsWith("blob:") && new URL(u).origin !== origen) {
            externas.push(u);
          }
        });
        const errores: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error" && /content security policy/i.test(m.text())) {
            errores.push(m.text());
          }
        });

        const respuesta = await page.goto(destino as string);
        await expect(page.locator(r.listo).first()).toBeVisible();
        await page.waitForLoadState("networkidle");

        const csp = respuesta?.headers()["content-security-policy"] ?? "";
        expect(csp, "la cabecera CSP debe existir").not.toBe("");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).toMatch(/'nonce-[^']+'/);
        expect(csp).toContain("'strict-dynamic'");
        expect(csp).not.toContain("unsafe-eval");
        expect(csp).not.toContain("wasm-unsafe-eval");
        expect(csp).not.toMatch(/(script|connect|worker)-src[^;]*https?:\/\//);

        expect(await leerViolaciones(page)).toEqual([]);
        expect(errores).toEqual([]);
        expect(externas).toEqual([]);
      });
    }
  });
}

test("control negativo: lo externo SÍ se bloquea y se registra", async ({ page }) => {
  await vigilarCsp(page);
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();

  // Un script inyectado desde la consola de pruebas no sirve de control: con
  // `strict-dynamic` el navegador lo trata como de confianza. Se usan dos
  // directivas que no tienen esa excepción.
  await page.evaluate(async () => {
    await fetch("https://ejemplo.invalid/datos").catch(() => undefined);
    const estilo = document.createElement("style");
    estilo.textContent = "body { outline: 1px solid red }";
    document.head.appendChild(estilo);
  });
  await expect
    .poll(async () => (await leerViolaciones(page)).map((v) => v.directiva), {
      timeout: 5_000,
    })
    .toEqual(expect.arrayContaining(["connect-src", "style-src-elem"]));
});
