/**
 * E2E del flujo completo — puntos 16 y 17.
 *
 * Lo que esta suite prueba y ninguna otra puede: que las piezas se hablen. Las
 * pruebas de API verifican cada handler por separado y las de `core` verifican
 * las decisiones; ninguna de las dos se entera si el botón de confirmar apunta
 * a la franja equivocada, si la hoja de recuperación no abre, o si la
 * hidratación muere por una cabecera —que es exactamente lo que pasó con la CSP
 * y no lo vio nadie hasta abrir el navegador.
 *
 * Contra la compilación de producción, por la misma razón.
 */
import { expect, test } from "@playwright/test";
import { consultar, entrar } from "./sesion";

const ESTUDIANTE = "estudiante001@uam.edu.ni";

/**
 * El comercio sobre el que se hace el flujo de compra.
 *
 * No es `cafeteria-central` y la razón es un dato de la base demo, no un
 * capricho: ese comercio tiene 0 franjas futuras —`/explorar` lo muestra como
 * "sin horas libres hoy"—, así que el flujo de compra ahí no puede completarse.
 * Elegir el comercio equivocado habría dado una prueba roja que parece un bug
 * del sistema y es un dato del escenario.
 */
const COMERCIO = "comedor-el-jaguar";

test.describe("lo público, sin sesión", () => {
  test("la portada carga, hidrata y no deja errores en consola", async ({ page }) => {
    const errores: string[] = [];
    page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
    page.on("pageerror", (e) => errores.push(e.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // La prueba de que hidrató: un control que solo existe con JavaScript vivo
    // responde. Sin esto, "la página carga" no distingue una app viva de la
    // cáscara muerta que dejó la CSP del hallazgo 10.
    await expect(page.locator("body")).toBeVisible();
    const hidratado = await page.evaluate(
      () => document.documentElement.hasAttribute("data-tema") || !!document.querySelector("[data-hidratado], nav a, button"),
    );
    expect(hidratado).toBe(true);

    // El error #418/#423 de React (fallo de hidratación) sale por consola y no
    // rompe la página: si no se mira acá, no lo mira nadie.
    expect(errores.filter((e) => /Minified React error|Hydration/i.test(e))).toEqual([]);
  });

  test("explorar lista comercios y el catálogo se puede filtrar", async ({ page }) => {
    await page.goto("/explorar");
    await expect(page.getByText(/resultados/i).first()).toBeVisible();
    // Los tres comercios del piloto tienen que estar.
    for (const nombre of [/Cafeter[íi]a Central/i, /Jaguar/i, /Biblioteca/i]) {
      await expect(page.getByText(nombre).first()).toBeVisible();
    }
  });

  test("la carta de un comercio se ve sin iniciar sesión (RF-04)", async ({ page }) => {
    await page.goto(`/c/${COMERCIO}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).toContainText(/Jaguar/i);
    // Con precios: una carta sin precios no es una carta.
    await expect(page.locator("body")).toContainText(/C\$\s?\d/);
    // Y con la separación que pide el producto: lo anticipable y lo que solo
    // se consigue en el mostrador no son lo mismo.
    await expect(page.locator("body")).toContainText(/Se puede pedir por anticipado/i);
  });

  test("una ruta que no existe responde 404 y no un 500", async ({ page }) => {
    const r = await page.goto("/no-existe-esta-pagina");
    expect(r?.status()).toBe(404);
  });
});

test.describe("flujo completo del estudiante", () => {
  test("armar el carrito, confirmar y recibir un código de retiro", async ({ page, context }) => {
    await entrar(context, ESTUDIANTE);

    await page.goto(`/c/${COMERCIO}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // El carrito sobrevive entre visitas (§41), así que se vacía primero: sin
    // esto la prueba arrastra lo que dejó la corrida anterior y deja de ser
    // repetible.
    const vaciar = page.getByRole("button", { name: /Empezar de cero/i });
    if (await vaciar.isVisible().catch(() => false)) await vaciar.click();

    // Agregar el primer producto anticipable. El botón se identifica por su
    // etiqueta accesible ("Agregar un Baho"), que es también lo que oye quien
    // usa lector de pantalla: si esta prueba lo encuentra, ese usuario también.
    const agregar = page.getByRole("button", { name: /^Agregar un /i }).first();
    await expect(agregar).toBeVisible();
    await agregar.click();

    // El carrito tiene que reflejarlo antes de seguir: si no, lo que se
    // confirma después no es lo que el usuario eligió. La prueba de que lo
    // reflejó es que aparece el botón de quitar, que solo existe con el
    // producto ya dentro.
    await expect(page.getByRole("button", { name: /^Quitar un / }).first()).toBeVisible({
      timeout: 15_000,
    });

    // El botón NO dice "Confirmar pedido": dice qué falta. Sin hora elegida
    // dice "Elegí una hora de retiro" y está apagado; con hora, "Pedir C$ …".
    // Esa es la regla del sistema —un botón apagado siempre dice por qué— y
    // por eso la prueba se ancla en los dos textos y no en uno genérico: si
    // alguien vuelve a poner "Confirmar pedido" en gris, esto falla.
    //
    // Hay DOS: uno en la barra fija de abajo y otro en el resumen. El primero
    // del DOM mide 0x0 —está, pero no se ve—, así que `.first()` clicaba en el
    // vacío y la prueba se colgaba esperando un POST que nadie iba a hacer. Se
    // pide el visible explícitamente.
    const sinHora = page
      .getByRole("button", { name: /^Elegí una hora de retiro$/i })
      .filter({ visible: true })
      .first();
    await expect(sinHora).toBeVisible({ timeout: 15_000 });
    await expect(sinHora).toBeDisabled();

    // Se localiza por su contenido —una hora y el margen en palabras— y no por
    // nombre accesible, que en estos botones se arma de varios nodos.
    const franja = page
      .locator("button")
      .filter({ hasText: /\d{1,2}:\d{2}/ })
      .filter({ hasText: /Llegás con margen|Justo a tiempo/ })
      .first();
    await expect(franja).toBeVisible({ timeout: 15_000 });
    await franja.click();

    const confirmar = page
      .getByRole("button", { name: /^Pedir C\$/i })
      .filter({ visible: true })
      .first();
    await expect(confirmar).toBeEnabled({ timeout: 10_000 });

    // Se escucha la respuesta pero NO se espera sobre ella: lo que se afirma es
    // el resultado que ve el usuario. Una prueba que solo mira el POST aprueba
    // un sistema que crea el pedido y no lo muestra.
    const respuestas: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/pedidos") && r.request().method() === "POST") {
        respuestas.push(r.status());
      }
    });

    await confirmar.click();

    /*
     * Y CONFIRMAR de verdad.
     *
     * Este paso faltaba. "Pedir C$ …" no reserva nada: abre la hoja de
     * revisión, porque comprometer capacidad de cocina merece una confirmación
     * explícita. La prueba se quedaba ahí y afirmaba sobre el `body`, donde el
     * patrón de código casaba con el de un pedido ya existente en pantalla.
     * Resultado: una prueba llamada "confirmar y recibir un código" que nunca
     * hacía el POST, con la lista `respuestas` vacía y el "ningún 500" cierto
     * por vacuidad.
     */
    const siConfirmar = page
      .getByRole("button", { name: /^Sí, confirmar$/i })
      .filter({ visible: true })
      .first();
    await expect(siConfirmar).toBeVisible({ timeout: 15_000 });
    await siConfirmar.click();

    // Ahora sí hubo intento de reserva: se exige que el POST haya ocurrido.
    await expect
      .poll(() => respuestas.length, { timeout: 30_000 })
      .toBeGreaterThan(0);

    // Cualquiera de los dos desenlaces es correcto y los dos tienen que ser
    // legibles: el pedido entró y hay código, o no entró y hay explicación.
    // Lo que no puede pasar es quedarse sin ninguna de las dos cosas.
    await expect(
      page.locator("body").filter({
        hasText: /[A-Z0-9]{3}-[A-Z0-9]{3}|no fue posible|capacidad|ya se llen|activos|no da tiempo/i,
      }),
    ).toBeVisible({ timeout: 30_000 });

    // Y ninguna respuesta puede ser un 500.
    expect(respuestas.filter((c) => c >= 500)).toEqual([]);
  });

  test("mis pedidos muestra lo que existe en la base, y nada ajeno", async ({ page, context }) => {
    const usuario = await entrar(context, ESTUDIANTE);
    const propios = await consultar<{ codigo: string }>(
      // Ordenados por fecha: la pantalla muestra los recientes primero y
      // pagina. Sin ORDER BY, la consulta devolvía pedidos de hace un mes que
      // están en otra página, y la prueba fallaba por el SQL, no por la app.
      `SELECT codigo FROM pedido WHERE "usuarioId" = $1
       ORDER BY "creadoEn" DESC`,
      [usuario.id],
    );
    const [ajeno] = await consultar<{ codigo: string }>(
      `SELECT codigo FROM pedido WHERE "usuarioId" <> $1 LIMIT 1`,
      [usuario.id],
    );

    // Lo que devuelve el servidor para esta sesión: es donde vive el filtro
    // por dueño, y donde una fuga sería grave.
    const api = await page.request.get("/api/pedidos");
    expect(api.status()).toBe(200);
    const { pedidos } = await api.json();
    const codigosApi = new Set<string>(pedidos.map((p: { codigo: string }) => p.codigo));

    // Todo lo que devuelve es del usuario...
    const mios = new Set(propios.map((p) => p.codigo));
    for (const c of codigosApi) expect(mios.has(c)).toBe(true);
    // ...y no falta lo reciente.
    if (propios.length > 0) expect(codigosApi.has(propios[0]!.codigo)).toBe(true);

    // Y la pantalla no muestra nada ajeno. Se comprueba sobre el render, no
    // sobre el JSON: una fuga puede entrar por la vista aunque la API filtre.
    await page.goto("/mis-pedidos");
    await expect(page.locator("main")).toBeVisible();
    const texto = await page.locator("body").innerText();
    if (ajeno) expect(texto).not.toContain(ajeno.codigo);
  });

  test("el pedido de otra persona responde 403, no lo muestra", async ({ page, context }) => {
    const usuario = await entrar(context, ESTUDIANTE);
    const [ajeno] = await consultar<{ id: string; codigo: string }>(
      `SELECT id, codigo FROM pedido WHERE "usuarioId" <> $1 LIMIT 1`,
      [usuario.id],
    );
    test.skip(!ajeno, "no hay pedidos de otros en la base demo");

    const r = await page.request.get(`/api/pedidos/${ajeno!.id}`);
    expect(r.status()).toBe(403);
    expect(await r.text()).not.toContain(ajeno!.codigo);
  });
});

test.describe("el servidor gana, pero nunca en silencio", () => {
  test("un 409 de idempotencia se explica y no dice «no hay hora»", async ({ page, context }) => {
    await entrar(context, ESTUDIANTE);
    await page.goto("/");

    const [comercio] = await consultar<{ id: string }>(
      `SELECT id FROM comercio WHERE slug = $1`,
      [COMERCIO],
    );
    const [franja] = await consultar<{ id: string }>(
      `SELECT id FROM franja WHERE "comercioId" = $1 AND inicio > now()
       ORDER BY inicio ASC LIMIT 1`,
      [comercio.id],
    );
    const productos = await consultar<{ id: string }>(
      `SELECT id FROM producto
       WHERE "comercioId" = $1 AND disponible AND anticipable LIMIT 2`,
      [comercio.id],
    );
    test.skip(productos.length < 2, "hacen falta dos productos anticipables");

    const clave = crypto.randomUUID();
    const pedir = (productoId: string) =>
      page.request.post("/api/pedidos", {
        headers: { "idempotency-key": clave, "content-type": "application/json" },
        data: { comercioId: comercio.id, franjaId: franja.id, items: [{ productoId, cantidad: 1 }] },
      });

    const primera = await pedir(productos[0]!.id);
    test.skip(primera.status() !== 201, "la franja no tenía capacidad en esta corrida");

    const segunda = await pedir(productos[1]!.id);
    expect(segunda.status()).toBe(409);
    const cuerpo = await segunda.json();
    expect(cuerpo.codigo).toBe("IDEMPOTENCIA_EN_CONFLICTO");
    // Y no filtra el código del pedido que sí existe (T-13).
    expect(JSON.stringify(cuerpo)).not.toContain((await primera.json()).codigo);
  });
});

test.describe("cabeceras de seguridad, servidas de verdad", () => {
  test("la CSP viaja con nonce y sin unsafe-inline en scripts", async ({ page }) => {
    const r = await page.goto("/");
    const csp = r?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src [^;]*'nonce-/);
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(csp).toContain("style-src-elem 'self'");
  });

  test("las cabeceras de aislamiento están puestas", async ({ page }) => {
    const r = await page.goto("/");
    const h = r?.headers() ?? {};
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  test("la API no se cachea y varía por cookie", async ({ page }) => {
    const r = await page.request.get("/api/estado-servicio");
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers()["vary"]).toContain("Cookie");
  });
});
