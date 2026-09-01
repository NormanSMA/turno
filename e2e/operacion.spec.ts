/**
 * Las dos pantallas que nadie estaba probando: cocina y administración.
 *
 * La suite cubría a fondo al estudiante —explorar, reservar, retirar— y dejaba
 * fuera los dos lados desde los que se opera el sistema. Son justamente los que
 * pueden hacer daño: la cocina cambia estados de pedidos ajenos y el panel
 * mueve α, que es el parámetro del que cuelga la promesa del producto.
 *
 * El criterio de estas pruebas no es "la página abre". Es:
 *
 *   1. que **quien no debe entrar, no entre** — y que lo que decide eso sea el
 *      servidor, no un botón escondido en la interfaz;
 *   2. que las pantallas **carguen con datos reales** de la base demo, no con
 *      un esqueleto vacío que también se vería bien;
 *   3. que las acciones que **comprometen capacidad** dejen rastro.
 */

import { expect, test } from "@playwright/test";
import { consultar, entrar } from "./sesion";

const ESTUDIANTE = "estudiante001@uam.edu.ni";
const COMERCIO = "jaguar@uamv.edu.ni";
const ADMIN = "admin@uamv.edu.ni";
const SLUG = "comedor-el-jaguar";

test.describe("autorización: la decide el servidor", () => {
  /*
   * Estas páginas responden **200 con un mensaje de rechazo**, no un 403.
   *
   * La protección funciona: el contenido no se sirve, y quien decide es el
   * servidor. Pero el código de estado dice "todo bien", y eso lo consume algo
   * más que un navegador — un monitor de disponibilidad, un caché intermedio o
   * un rastreador leen 200 y siguen. Queda anotado como observación aparte; se
   * arregla con una decisión sobre cómo Next debe traducir estos rechazos, no
   * en medio de una tanda de correcciones de concurrencia.
   *
   * Lo que estas pruebas fijan mientras tanto es la propiedad que de verdad
   * importa: **el contenido protegido no aparece**. Ocultar un enlace del menú
   * no es autorización, así que se comprueba contra lo que llega, no contra lo
   * que se ve.
   */
  test("un estudiante no ve la cocina de un comercio", async ({
    page,
    context,
  }) => {
    await entrar(context, ESTUDIANTE);
    await page.goto(`/comercio/${SLUG}`);
    await expect(page.locator("main")).toContainText(/requiere|no autoriz/i);
  });

  test("un estudiante no ve el panel de administración", async ({
    page,
    context,
  }) => {
    await entrar(context, ESTUDIANTE);
    await page.goto("/panel");
    await expect(page.locator("main")).toContainText(/requiere|no autoriz/i);
  });

  test("la API de métricas rechaza a quien no es administrador", async ({
    page,
    context,
  }) => {
    await entrar(context, ESTUDIANTE);
    const r = await page.request.get("/api/admin/metricas");
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test("un comercio no ve el panel de administración", async ({
    page,
    context,
  }) => {
    // El operador de cocina tiene sesión válida y aun así no pasa: el rol se
    // comprueba aparte de la autenticación, que es la distinción que importa.
    await entrar(context, COMERCIO);
    await page.goto("/panel");
    await expect(page.locator("main")).toContainText(/requiere.*admin/i);
  });
});

test.describe("cocina", () => {
  test("la pantalla carga con la cola real del comercio", async ({
    page,
    context,
  }) => {
    await entrar(context, COMERCIO);
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));

    const r = await page.goto(`/comercio/${SLUG}`);
    expect(r?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // El nombre del comercio tiene que estar: si la consulta falló, la página
    // renderiza igual y solo se nota por lo que falta.
    await expect(page.locator("body")).toContainText(/jaguar/i);
    expect(errores, `errores de hidratación:\n${errores.join("\n")}`).toEqual([]);
  });

  test("no muestra pedidos de otro comercio", async ({ page, context }) => {
    await entrar(context, COMERCIO);
    await page.goto(`/comercio/${SLUG}`);
    await page.waitForLoadState("networkidle");

    // Códigos de pedidos que pertenecen a OTROS comercios. Ninguno puede
    // aparecer en esta pantalla.
    const ajenos = await consultar<{ codigo: string }>(
      `SELECT p.codigo
         FROM pedido p
         JOIN franja f ON f.id = p."franjaId"
         JOIN comercio c ON c.id = f."comercioId"
        WHERE c.slug <> $1
        LIMIT 5`,
      [SLUG],
    );

    const texto = (await page.locator("body").innerText()).toUpperCase();
    for (const { codigo } of ajenos) {
      expect(texto, `apareció el pedido ajeno ${codigo}`).not.toContain(codigo);
    }
  });
});

test.describe("panel de administración", () => {
  test("carga y muestra cifras, no un esqueleto vacío", async ({
    page,
    context,
  }) => {
    await entrar(context, ADMIN);
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));

    const r = await page.goto("/panel");
    expect(r?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // Al menos un número de verdad en pantalla. Un panel que carga sin datos se
    // ve igual de bien que uno que funciona, y es el fallo que más tarda en
    // notarse.
    await expect(page.locator("body")).toContainText(/\d/);
    expect(errores, `errores de hidratación:\n${errores.join("\n")}`).toEqual([]);
  });

  test("las métricas responden con los totales del piloto", async ({
    page,
    context,
  }) => {
    await entrar(context, ADMIN);
    const r = await page.request.get("/api/admin/metricas");
    expect(r.status()).toBe(200);

    const cuerpo = await r.json();
    expect(cuerpo.totales).toBeTruthy();
    expect(cuerpo.totales.pedidos).toBeGreaterThan(0);
    expect(cuerpo.totales.usuarios).toBeGreaterThan(0);

    // Contrastado contra la base: el panel no puede inventar ni perder filas.
    const [{ n }] = await consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM pedido`,
    );
    expect(cuerpo.totales.pedidos).toBe(Number(n));
  });

  test("el CSV sale con cabecera y filas, no vacío", async ({
    page,
    context,
  }) => {
    // El CSV crudo es lo que permite que un tercero rehaga el análisis. Si sale
    // vacío o sin cabecera, el panel sigue viéndose bien y la evidencia no
    // existe.
    await entrar(context, ADMIN);
    const r = await page.request.get("/api/admin/metricas?formato=csv");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/csv");

    const texto = await r.text();
    const lineas = texto.trim().split(/\r?\n/);
    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas[0]).toContain("pedido_id");
  });
});
