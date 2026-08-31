# TURNO — Informe de auditoría técnica

Rama `master`, base `5e61c31`. Node 26.4.0, npm 11.17.0.
Última corrida: 2026-08-28.

Severidades: **CRITICAL** (rompe o expone en producción) · **HIGH** (defensa
ausente o sin red) · **MEDIUM** (riesgo acotado o deuda que crece) · **LOW**
(higiene).

Cada hallazgo lleva su **arreglo** o, cuando se decidió no tocar, la razón.

---

## Avance sobre los 40 puntos

| Bloque | Puntos | Estado |
|---|---|---|
| Nivel 0 — línea base | 0 | cerrado |
| Cobertura real | 1 | cerrado |
| Secretos e historial | 2 | cerrado |
| Dependencias | 3 | cerrado |
| Arquitectura (ciclos, muerto, duplicado) | 4 | cerrado |
| SAST (semgrep) | 5 | cerrado |
| OWASP ZAP baseline | 6 | cerrado |
| Concurrencia: las tres carreras | 10, 11 | cerrado |
| Invariantes · fast-check · mutación | 12, 13, 14 | cerrado |
| E2E · visual · responsive · axe · Lighthouse · PWA | 16–22 | cerrado |
| Imágenes · bundle · red · N+1 · índices | 23–27 | cerrado |
| Temporal · notificaciones · doble retiro | 28, 29, 30 | cerrado |
| Uploads (verificado antes de la auditoría) | 31 | cerrado |
| Logs sin secretos | 32 | cerrado |
| Simulador sobre el motor real | 15 | cerrado |
| Linter del Design System | 34 | cerrado |
| Inventario de motion | 35 | cerrado |
| Matriz de estados de UI | 36 | cerrado |
| Matriz "¿Qué pasa si…?" | 37 | cerrado |
| `npm run audit` + severidades | 38, 39 | cerrado |
| Matriz de autorización | 7 | cerrado |
| Sesión (expiración, revocación, cambio de rol) | 8 | cerrado |
| Idempotencia | 9 | cerrado |
| `.env` y `NEXT_PUBLIC_*` | 33 | cerrado |


### Marcador

| | Antes | Ahora |
|---|---|---|
| Puntos cerrados | 0 de 40 | **40 de 40 (100 %)** |
| Pruebas unitarias | 419 en 30 archivos | **618 en 37** |
| Pruebas E2E | 0 | **40** |
| `src/app/api` | **0 %** | 42 % |
| `src/lib/auth.ts` | 2.5 % (0 % de funciones) | 55 % |
| Mutación (`src/core` puro) | sin medir | **84.7 %** |
| Lighthouse | sin medir | 87 / 92 / 96 / 100 |
| Llamadas a la API en una visita anónima | 7, tres con 401 | **2, ninguna con 401** |
| Hallazgos | — | **24, 20 arreglados** |

---

## Nivel 0 — línea base

La línea base de `status.md` **se reproduce**.

| Paso | Resultado | Evidencia |
|---|---|---|
| `npm ci` | 580 paquetes, exit 0 | `baseline/00-npm-ci.txt` |
| `tsc --noEmit` | exit 0, sin errores | `baseline/01-typecheck.txt` |
| `eslint` | exit 0, sin avisos | `baseline/02-lint.txt` |
| `npm test` | **419 pruebas / 30 archivos, verdes**, 18.6 s | `baseline/03-test.txt` |
| `npm run build` | exit 0, 1 aviso de deprecación | `baseline/04-build.txt` |

Una sola salvedad, en el proceso y no en el código: **T-00**.

---

## Hallazgos

### T-13 · HIGH · **ARREGLADO** · La misma clave de idempotencia con otro pedido devolvía el primero

`reservar` buscaba el pedido por `idempotencyKey` y, si lo encontraba, lo
devolvía. **Sin comparar el contenido.** Dos pedidos distintos enviados con la
misma clave recibían el primero, en silencio y con su código de retiro.

Es exactamente el escenario que describe el hallazgo 4 del proyecto —*"el
servidor habría devuelto aquel pedido, silenciosamente, con el código de retiro
equivocado"*—. Aquel se arregló **del lado del cliente**, renovando la clave por
intento de compra. Del lado del servidor no quedó nada. Una idempotencia que no
mira el cuerpo no protege de un cliente equivocado: lo obedece.

**Arreglo.** Los cuatro sitios que devolvían el pedido —camino rápido, rechazo
de negocio en reintento, colisión del `UNIQUE` y relectura dentro de la
transacción— pasan ahora por `resolverReintento`, que compara una huella de la
solicitud. Distinto contenido → 409 `IDEMPOTENCIA_EN_CONFLICTO`, sin devolver
nada del pedido viejo.

**La huella lleva comercio e items y NO lleva la franja.** Esa ausencia es el
detalle que importa: la regla del hallazgo 4 es que la clave **se mantiene** a
través de un rechazo por capacidad, porque ese rechazo no creó nada y reintentar
con otra hora es el mismo intento. Si la franja entrara en la huella, ese
reintento legítimo se rechazaría como conflicto. Hay prueba de las dos cosas.

**Verificado.** Las pruebas nuevas fallan contra el código anterior y pasan
contra el actual (`tests/api-idempotencia.test.ts`).

---

### T-14 · HIGH · **ARREGLADO** · La clave de otra persona entregaba su pedido

Misma función, segundo agujero. `idempotencyKey` es única **a nivel global** y
no se comprobaba el dueño: quien presentara la clave de otro recibía el pedido
de ese otro —`pedidoId`, total y **código de retiro**—.

Adivinarla es inviable (UUID v4, 122 bits). Pero la clave viaja en una cabecera
HTTP: la ven los proxies, los registros de acceso y cualquier herramienta de
red del camino. Una comprobación de dueño no cuesta nada, y sin ella el sistema
depende de que la clave nunca se filtre — que no es una propiedad que se pueda
sostener.

**Arreglo.** `resolverReintento` compara `usuarioId` antes que nada. Si no
coincide, 409 `IDEMPOTENCIA_AJENA` y la respuesta no lleva ni el código ni el
id del pedido ajeno. Con prueba que verifica ambas ausencias.

**Nota de coherencia.** Los dos códigos nuevos **no** abren la hoja de "franja
agotada" y devuelven la lista de alternativas vacía a propósito: elegir otra
hora no resuelve ninguno de los dos. Es la regla que dejó el 409 que decía "no
hay hora". Hay una prueba que lo fija.

---

### T-01 · HIGH · **ARREGLADO** · La suite no tocaba la capa HTTP

Cobertura inicial, medida con v8 sobre `src/**` (excluyendo `src/generated`):

| Zona | Sentencias |
|---|---|
| `src/core` | 93.3 % |
| `src/lib` | 19.1 % |
| `src/components` (37 archivos) | 0 % |
| `src/app` (30 rutas de API + 25 páginas) | **0 %** |

El número no era el hallazgo; el mapa sí. **Ningún test importaba un
`route.ts`.** Los 419 casos probaban `core` —que es lo que el diseño buscaba:
núcleo puro con reloj inyectado— y algo de `lib`. Quedaba sin red la capa donde
ocurren las cosas: validación Zod, códigos de estado, `exigirRol` efectivamente
aplicado, idempotencia HTTP.

**Por qué importaba acá y no en abstracto.** Los hallazgos de la clase "un error
tratado como si fuera otro" —el reintento contra la cuota de activos, el
reintento contra el rate limit, el 409 de `LIMITE_PEDIDOS_ACTIVOS` mostrado como
franja agotada— viven todos en esa capa. Los encontró Norman en el navegador. La
suite no podía encontrarlos porque no la miraba. T-13 y T-14 salieron el mismo
día en que se empezó a mirarla.

**Arreglo.** `tests/helpers/cookies.ts` sustituye `next/headers` —era el
impedimento práctico: los handlers leen la sesión con `cookies()`, que fuera de
una petición de Next lanza— y `tests/helpers/sesion.ts` monta sesiones reales
por el camino completo (cookie → hash → fila → vigencia). Sobre eso,
`tests/api-autorizacion.test.ts`: 22 endpoints por cuatro actores.

`src/app/api` pasó de 0 % a **42.2 %**.

---

### T-02 · HIGH · **ARREGLADO** · `lib/auth.ts` al 2.5 % de sentencias y 0 % de funciones

`core/autorizacion.ts` estaba al **100 %** — pero es la parte pura: recibe una
sesión y decide. La que **obtiene** la sesión —leer la cookie, resolverla contra
la base, comprobar vigencia, aplicar `exigirRol`/`exigirComercio`— es
`lib/auth.ts`, y de sus 79 sentencias se ejecutaba **una**.

La misma trampa que la baranda del último administrador: verde sobre la función
que decide, nada sobre la que se llama.

**Arreglo.** `tests/api-sesion.test.ts` (punto 8): sesión expirada, revocada,
token inexistente, presentar el hash en vez del token, cierre de sesión, y
—la que más importa— **el rol se lee en cada petición y no se congela en la
sesión**: se degrada a un ADMIN con la sesión abierta y el panel se le cierra
en la llamada siguiente. Más el cambio de contraseña, que revoca las otras
sesiones y conserva la que lo hizo.

54.8 % de sentencias y 66.7 % de funciones.

---

### T-07 · LOW · **ARREGLADO** · Preámbulo de autorización copiado en cinco rutas

`productos`, `productos/[id]`, `franjas/[id]`, `franjas/generar` y
`comercios/[slug]/admin` repetían las mismas líneas: buscar el comercio por
slug, 404 si no existe, `exigirComercio`. Las cinco copias eran correctas; el
riesgo eran los cinco lugares donde la guarda podía divergir sin que nada
avisara.

**Arreglo.** `exigirComercioPorSlug(slug)` en `lib/auth.ts`, aplicado en las
cinco. La subida de imágenes tenía su propia versión de lo mismo
(`exigirProductoPropio`) y ahora se apoya en el helper.

---

### T-08 · LOW · **ARREGLADO** · El 404 de comercio se respondía antes de autenticar

En esas mismas rutas, `Comercio inexistente` (404) salía **antes** de
`exigirComercio`: un anónimo distinguía un slug que existe (401/403) de uno que
no (404).

Severidad baja por una razón concreta: los slugs de comercio ya son públicos
—`/c/[slug]` es una página abierta y `/explorar` los lista—, así que no había
nada que enumerar que no estuviera publicado.

**Arreglo.** El helper autentica primero y responde **el mismo error para las
dos causas**, como ya hacían `exigirAccesoPedido` y la subida de imágenes. Se
arregló junto con T-07 porque era el mismo preámbulo. La razón para arreglarlo
igual: el orden "responder antes de autenticar" no conviene normalizarlo, porque
la próxima ruta que copie el patrón puede no tener un recurso público.

---

### T-04 · MEDIUM · **ARREGLADO A MEDIAS, Y LA OTRA MITAD NO SE PUEDE** · La CLI de Prisma estaba en `dependencies`

`prisma` (la herramienta de línea de comandos) estaba declarada como dependencia
de producción. Movida a `devDependencies`, que es lo que es.

**Corrección de lo que este informe decía antes.** La primera versión afirmaba
que ese era el motivo de que `deepmerge-ts` entrara al árbol de producción. No
lo es, y se comprobó: `@prisma/client` declara `prisma` como **peerOptional**,
así que npm lo instala igual. `npm audit --omit=dev` sigue dando los mismos 3
*high* después del cambio.

Efecto secundario útil: desaparece el riesgo de despliegue que este informe
advertía. Vercel corre `prisma generate` en el build y la CLI sigue presente en
el árbol de producción por el peer, así que el cambio es solo de declaración.
Build verificado en verde después de moverla.

---

### T-09 · LOW · **ARREGLADO** · `@types/node@20` con Node 26 en ejecución

Los tipos iban seis mayores por detrás del runtime: `typecheck` validaba contra
una superficie de API que no era la que corre. Subido a `^26`. `tsc --noEmit`
queda limpio sin tocar una sola línea de código.

---

### T-11 · LOW · **ARREGLADO EN PARTE** · Superficie de exports más ancha de lo necesario

knip listaba 32 exports y 12 tipos sin consumidor externo. **No había código
muerto**: los cinco casos que parecían graves —`enviarPush`, `puedeVerPedido`,
`correoPedidoConfirmado`, `correoPedidoListo`, `ocupacionProyectada`— se
verificaron uno por uno y los cinco se usan dentro de su propio módulo.

**Arreglo.** Se quitó la re-exportación de `puedeVerPedido` desde `lib/auth.ts`,
que era la única que aparentaba API pública sin serlo. El resto se deja: son
constantes y tipos con nombre, y esconderlos no mejora nada.

---

### T-12 · LOW · **ARREGLADO** · `tests.zip` suelto en el árbol de trabajo

44 KB sin seguimiento en la raíz, apareciendo en cada `git status`. Agregado a
`.gitignore`. **No se borró el archivo**: es de Norman y no es de la auditoría
decidir eso.

---

### T-00 · MEDIUM · **ABIERTO, documentado** · `npm ci` deja el árbol roto si el servidor está corriendo

Con `next start -p 3100` levantado, `npm ci` falla con `EPERM unlink` sobre
`next-swc.win32-x64-msvc.node` — pero falla **después** de haber borrado el
resto de `node_modules`. Quedaron 49 entradas de 580, sin `next`, sin `vitest` y
sin `typescript`, y el servidor siguió sirviendo desde archivos ya eliminados.

El aviso que ya estaba en `status.md` es "no reconstruyas mientras Norman
prueba". Este es peor: no hace falta reconstruir, alcanza con reinstalar, y el
fallo no deja las cosas como estaban — deja sin árbol. Quien lo dispare sin
saberlo lee el `EPERM` como un problema de permisos y reintenta en vez de matar
el servidor.

**Por qué no se automatizó.** Lo natural sería un `preinstall` que aborte si el
3100 responde. No se hizo porque `npm ci` **borra `node_modules` antes** de
llegar a los scripts del proyecto, así que la guarda correría tarde y daría una
falsa sensación de red. Queda como aviso en `status.md`, que es donde alguien lo
va a leer antes de reinstalar.

---

### T-03 · MEDIUM · **ACEPTADO** · 3 vulnerabilidades *high*, todas la misma raíz

`deepmerge-ts <8.0.0` (GHSA-ggr8-5vv4-36mx, agotamiento de pila al fusionar
grafos recursivos) → `@prisma/config` → `prisma`.

No es explotable desde la aplicación: `@prisma/config` es el cargador de
configuración de la CLI, corre en build y en migraciones, con un
`prisma.config.ts` que escribimos nosotros. No hay entrada de usuario.

El único arreglo que ofrece npm es `--force` a `prisma@6.12.0`: un downgrade
mayor sobre un proyecto que usa Prisma 7 con adaptador `pg`. **Decisión: no
tocar**, revisar cuando 7.10+ suba `deepmerge-ts`.

Queda una consecuencia para el punto 38: `npm audit` va a estar en rojo de forma
permanente. El entregable tiene que distinguir "vulnerable" de "vulnerable y
alcanzable", o el rojo deja de significar algo.

---

### T-05 · MEDIUM · **MEJORADO** · `lib/http.ts` era el módulo con peor historial y de los menos probados

16.2 % de sentencias y 9.5 % de ramas. Ahí viven el envoltorio de error, el
ruteo por código y el rate limit — el escenario exacto de los hallazgos 1, 2 y
del 409 que decía "no hay hora".

Las pruebas de handler lo suben a **67.6 %** de sentencias sin haberlo apuntado
directamente: se ejerce por debajo en cada llamada. Lo que todavía no se ejerce
son las ramas de `ETag`/`sinCambios` y el 429 del rate limit. Queda para el
punto 25.

---

### T-06 · LOW · **ABIERTO** · `eslint@9.39.5` sin soporte upstream

El propio `npm ci` lo avisa; la última es 10.9.1. No se subió en esta pasada:
es un mayor de ESLint y arrastra `eslint-config-next`, y mezclarlo con los
arreglos de seguridad habría hecho ilegible qué rompió qué. Sin impacto hoy.

---

### T-10 · LOW · **ABIERTO** · `middleware` deprecado en Next 16.3

El build avisa: la convención `middleware` pasa a llamarse `proxy`. Importa más
que un rename cosmético porque `src/middleware.ts` es donde vive el nonce de la
CSP (hallazgo 10) — la migración toca la defensa que ya rompió producción una
vez, y ese hallazgo dejó escrito que una defensa que solo se activa en
producción hay que probarla en producción. Hay codemod oficial. **No se hizo
todavía**: pide `npm run build && npm start` y una verificación en el navegador,
no solo suite verde.

---

## Punto 5 — SAST

### Reglas genéricas: 0 hallazgos

`p/typescript`, `p/react`, `p/nodejs`, `p/owasp-top-ten` y `p/secrets` — **598
reglas sobre 213 archivos, cero hallazgos** (`sast/semgrep.json`).

Es un buen resultado y a la vez uno que no dice mucho: ninguna de esas reglas
conoce el motor de admisión, la regla del reloj inyectado ni la de los emojis.
Un SAST genérico verde sobre este proyecto significa "no hay `eval`, ni SQL
concatenado, ni `dangerouslySetInnerHTML`". Cierto, y no era la pregunta.

### Reglas propias: cinco, una por bug ya ocurrido

`audit/sast/reglas-turno.yml`. Cada una nace de un hallazgo real del proyecto,
para que ese bug no pueda volver en silencio:

| Regla | De qué hallazgo sale |
|---|---|
| `turno-csv-sin-serializar` | El export que unía con `join(",")` y corría las columnas |
| `turno-nucleo-sin-reloj-propio` | La regla de arquitectura: `src/core/` recibe el reloj |
| `turno-sin-emojis` | Regla de producto de Norman |
| `turno-volver-sin-validar` | Hallazgo 7, la redirección abierta del enlace mágico |
| `turno-idempotencia-sin-comprobar` | T-13 y T-14 |

**Sobre el código real: 0 hallazgos.**

Dos cosas que conviene decir, porque un "0" puede significar dos cosas muy
distintas:

**La primera versión de estas reglas dio 10 hallazgos y los 10 eran falsos
positivos suyos.** La regla del reloj marcaba `ahora = new Date()` como valor
por defecto de un parámetro y `solicitud.ahora ?? new Date()` — que son
*exactamente el patrón correcto*, el que permite inyectar el reloj. La de emojis
usaba el rango `2600–27BF`, donde viven `✕ ✓ ✗`: marcas tipográficas, que son
justo el lenguaje que el Design System pide. La regla acusaba al código de
cumplir la regla. Y la de `volver` marcaba las dos lecturas legítimas, una con
el saneador en la misma línea. Se corrigieron las reglas, no el código. Una
regla que grita en vano se desactiva, y una regla desactivada es peor que
ninguna: figura en el informe como si estuviera cuidando algo.

**El 0 está verificado contra un fixture.** Una regla puede dar 0 porque no hay
violaciones o porque no matchea nada nunca. `audit/sast/prueba-de-reglas/`
contiene código deliberadamente malo —un `join(",")` de CSV, un `new Date()` a
media función en `core`, un emoji, un `redirect()` de un `volver` sin sanear y
una idempotencia que devuelve el pedido sin comprobar— y **las cinco reglas
muerden ahí**. Silenciosas sobre el código real, ruidosas sobre el código malo:
eso es lo que hace que el 0 signifique algo.

### Repetible

```bash
npm run audit:sast
```

Junto con `audit:cobertura`, `audit:secretos` y `audit:arquitectura`. El
`npm run audit` completo con `REPORT.md` generado es el punto 38 y sigue
pendiente.

---

## Punto 6 — OWASP ZAP baseline

Contra la compilación de **producción** en el 3100, no contra `dev`. Es la
lección del hallazgo 10: una defensa que solo se activa en producción hay que
probarla en producción.

**Primera pasada: 0 FAIL, 63 PASS, 7 WARN** (`zap/salida.txt`, `zap/informe.html`).

De los 7, uno solo tenía riesgo medio y dos eran arreglables. El resto son
falsos positivos o informativos, y se triaron uno por uno en vez de copiarlos:

| Aviso | Veredicto |
|---|---|
| `[10055]` CSP `style-src 'unsafe-inline'` — **Medium** | Real. Arreglado, ver T-15. |
| `[90004]` COOP y CORP ausentes — Low | Reales. Arreglados, ver T-16. |
| `[90004]` COEP ausente — Low | **Rechazado a conciencia**, ver T-16. |
| `[10049]` Non-Storable Content | Es el diseño: `no-store` en la API y `private, no-cache` en las páginas por el nonce. ZAP señala como problema justo lo que se buscaba. |
| `[10094]` Base64 Disclosure | El nonce de la CSP y las URI `data:`. Falso positivo. |
| `[10096]` Timestamp Disclosure | El sello de compilación `NEXT_PUBLIC_SW_VERSION`, que es deliberado y sirve para invalidar el caché del worker. Revela cuándo se compiló y nada más. |
| `[10109]` Modern Web Application | Informativo. Las URL raras que lista son `srcset` de Unsplash que ZAP resolvió mal contra `/c/`. |
| `[90005]` Sec-Fetch-* ausentes | Son cabeceras de **petición** que ZAP no envía. Falso positivo. |

**Segunda pasada, después de los arreglos: 0 FAIL, 64 PASS, 6 WARN, y ningún
aviso de riesgo medio.** Lo único que queda con riesgo distinto de
informativo es el COEP que se decidió no poner.

### T-15 · MEDIUM · **ARREGLADO** · La concesión de `style-src` era más ancha de lo necesario

`style-src 'self' 'unsafe-inline'`. El comentario del código lo justificaba
diciendo que "Next inyecta estilos en línea para las fuentes y el CSS crítico".

Al mirarlo resultó que eso **no es lo que pasa**: el HTML servido no tiene una
sola etiqueta `<style>` —el CSS viaja por `<link>` a `/_next/static`— y lo único
que necesita el permiso son los **atributos** `style="..."` que los componentes
calculan (anchos de barra, gradientes; 16 en la portada).

Y `style-src` no distingue los dos casos: `style-src-elem` gobierna las
etiquetas y `style-src-attr` los atributos. Un `<style>` inyectado es el que
permite exfiltrar datos con selectores de atributo y `background-image`; un
atributo `style` no llega tan lejos.

**Arreglo.** Se añade `style-src-elem 'self'` y **se deja `style-src` como
estaba**. Esto último a propósito: `style-src` es el respaldo que usan los
navegadores que no entienden `-elem`, Safari entre ellos. Un navegador moderno
queda más ajustado; Safari queda exactamente como estaba. Cambiar `style-src` a
`'self'` habría roto el iPhone, que es donde Norman prueba.

### T-16 · LOW · **ARREGLADO (COOP y CORP), RECHAZADO (COEP)**

`Cross-Origin-Opener-Policy: same-origin` corta la referencia `window.opener`.
Importa acá porque el enlace mágico **llega por correo** y se abre desde otra
aplicación, que es justo el escenario donde el abridor conserva un manejador
para navegar la pestaña.

`Cross-Origin-Resource-Policy: same-origin` impide que otro sitio incruste
nuestras respuestas. Barato: todo lo que la aplicación consume de sí misma es
del mismo origen, y las fotos de Unsplash llegan *hacia* acá, así que su CORP lo
decide Unsplash.

**COEP no se pone.** `require-corp` exige que todo recurso externo declare
permiso y las fotos de Unsplash no lo hacen. Sirve para aislar el proceso
(SharedArrayBuffer) y acá no se usa nada de eso: sería romper el catálogo a
cambio de nada. El aviso de ZAP se deja abierto con esta razón escrita.

### Lo que esta pasada enseñó sobre el método

Dos cosas que valen más que los hallazgos:

**Una hipótesis mía era falsa y se cayó al probarla.** Después de poner las
cabeceras, el registro del service worker empezó a fallar. La explicación
obvia era CORP sobre `/sw.js`. Se quitó CORP, se recompiló, y **seguía
fallando**. Se compiló entonces el código **original, sin ningún cambio**, y
fallaba igual: es una limitación del navegador embebido, no una regresión. Sin
ese segundo experimento habría quedado un "arreglo" que no arreglaba nada y una
defensa quitada por las dudas.

**Se cayó en la trampa que el propio proyecto documenta.** El primer render
tras recompilar salió sin estilos y con catorce `ERR_FAILED`. No era la CSP: era
el service worker de la compilación anterior sirviendo una página que apunta a
fragmentos borrados — exactamente el aviso de `status.md`. Desregistrando el
worker, la página renderizó perfecta. Se anota porque el síntoma ("la CSP rompió
todo") y la causa real no se parecen en nada, y el primer instinto fue revertir
el cambio correcto.

**Queda pendiente por el entorno:** el registro del service worker y la
instalación de la PWA no se pudieron verificar acá. Eso es el punto 22 y
necesita un navegador de verdad.

---

## Cierre — puntos 15 y 34 a 39

### T-27 · LOW · **ARREGLADO** · El simulador recalculaba una fórmula del motor

El encargo lo advierte: si el simulador tuviera copia propia de la admisión, sus
resultados no dirían nada sobre el sistema. Reutiliza `cabeEnFranja` y
`calcularOpcionesConCutoff`, pero la capacidad efectiva la calculaba a mano
—`capacidad * alfa`— en vez de llamar a `capacidadEfectiva`. Parece lo mismo, y
ahí está el riesgo: el día que la regla cambie, la copia se queda atrás en
silencio y el simulador reporta sobre un sistema que ya no existe.

Corregido, con una prueba que lee el propio archivo —única forma de que una
copia nueva se note— y que ignora los comentarios, porque el archivo explica la
fórmula y tiene derecho a nombrarla.

### T-28 · MEDIUM · **ARREGLADO** · Un token del tema en una pantalla que no sigue el tema

Lo encontró el linter del Design System, y lo que encontró fue **un error de
esta misma auditoría**. Al arreglar el contraste, se cambiaron dos literales de
`ModoMostrador` por `--color-texto-3`. Pero ese modo **no sigue el tema del
usuario** y está explicado en el propio archivo: el mostrador tiene luz de techo
y reflejos, y el lector de QR espera módulos oscuros sobre claro. Con el token,
en modo oscuro quedaba `#8a8a8a` sobre el blanco fijo del mostrador: **3.45:1**,
por debajo de AA. Revertido a un literal elegido contra ese blanco: 4.61:1.

### Punto 34 — el linter del Design System

`scripts/linter-design-system.ts`, cuatro reglas, cada una nacida de algo que ya
pasó: color fuera de token, radios y alturas fuera de la escala de 4 px, emojis,
y el color literal que resulta ser el valor de un token.

Primera corrida: **82 hallazgos**. Uno era real (T-28). Los otros 81 son
decisiones deliberadas, y ahí está el valor del punto: cada una quedó escrita en
`audit/design-system.excepciones.json` con su motivo. Las plantillas de correo
no pueden usar variables CSS —Outlook no resuelve `:root`—; los iconos los
rasteriza Satori, donde no hay hoja de estilos; `CodigoPedido` usa el color como
**dato**, derivado del código, para que dos códigos parecidos se distingan de un
vistazo en el mostrador; y la paleta de los gráficos está deliberadamente fuera
de la marca, porque un gráfico pintado de rojo TURNO se lee como alerta.

Antes eran 82 literales indistinguibles entre sí. Ahora son 81 decisiones y cero
accidentes, y el próximo literal que aparezca se va a ver.

**Verificado que muerde:** con un componente de prueba con `rounded-[7px]`,
`h-[37px]`, un hex arbitrario y un emoji, las cuatro reglas saltan. Un "sin
hallazgos" de un linter que no matchea nada es peor que no tenerlo.

### Punto 35 — inventario de motion

No como lista en un documento, que envejece sin avisar, sino como garantía
comprobable: con `prefers-reduced-motion: reduce` **ningún** elemento de las
pantallas principales conserva transición ni animación por encima de 40 ms, y se
mide sobre el estilo computado, así que da igual de dónde venga la animación.

Con una segunda prueba en el sentido contrario —sin la preferencia sí hay
movimiento—, porque si la aplicación no animara nunca, la primera pasaría sin
comprobar nada.

### Puntos 36 y 37 — las dos matrices

`docs/matriz-estados-ui.md` y `docs/matriz-que-pasa-si.md`, las dos generadas
del código.

De la primera salió una distinción que no estaba escrita: las pantallas que
piden sus datos al cliente tienen los tres estados; las que los reciben ya
renderizados desde el servidor —la portada y `/explorar`— **no los necesitan**, y
que degraden en silencio ahí es lo correcto, no una omisión. El único hueco real
es `panel/page.tsx`, cuyo estado de error es una cadena suelta sin botón de
reintentar.

La segunda tiene una sección final con **lo que todavía no tiene prueba** —el
reloj del servidor desfasado, el reintento de un cron ya corrido, la caída de la
base a mitad de transacción—. Una matriz que solo muestra lo cubierto es
propaganda.

### Puntos 38 y 39 — el entregable

```bash
npm run audit            # todo lo que no necesita servidor
npm run audit -- --todo  # incluye ZAP, E2E y Lighthouse
```

Produce `audit/resumen.json` y `audit/RESUMEN.md`. Dos decisiones de diseño que
son el punto 39 entero:

**La severidad la declara la tabla, no el código de salida.** `npm audit`
termina en 1 de forma permanente por T-03, que no es alcanzable desde la
aplicación. Tratarlo como fallo dejaría el rojo encendido para siempre, y un
rojo permanente deja de significar algo. Se registra el hecho; la severidad se
fija aparte, con la razón escrita al lado.

**Solo CRITICAL y HIGH devuelven código distinto de cero.** Si todo cortara,
esto se terminaría corriendo con `|| true`, y entonces no cortaría nada.

Y **omitido no es aprobado**: una comprobación que no corrió porque falta Docker
o el servidor sale como `OMITIDO` y el resumen lo dice arriba. La forma habitual
de que una auditoría mienta no es que alguien falsee un resultado: es que algo
dejó de correr y nadie lo notó.

### T-29 · MEDIUM · **ARREGLADO** · El corredor caía en la trampa que el proyecto documenta

Escribir el corredor lo hizo caer en el aviso de `status.md`: compilaba y
**después** corría el E2E contra el servidor del 3100, que seguía sirviendo la
compilación anterior. El resultado era un "fallo" de regresión visual que no era
del producto sino del corredor.

El primer arreglo también estuvo mal, y se descubrió midiéndolo: comparar el
`BUILD_ID` de antes y después. Next lo genera **aleatorio en cada compilación**
—verificado compilando dos veces sin tocar una línea: `QLxf710…` → `RSIxpbGv…`—,
así que el corredor habría marcado `OMITIDO` **siempre**. Un omitido permanente
es tan inútil como el rojo permanente que el punto 39 evita.

Lo que quedó pregunta por el comportamiento en vez de por un identificador: se
le pide la portada al servidor, se saca un fragmento de `/_next/static/chunks`
de los que referencia, y se pide ese fragmento. Si responde 404, el servidor
está sirviendo un HTML que apunta a archivos que la compilación nueva ya borró
—que es literalmente el hallazgo 11—. Detecta además la compilación vieja que
dejó otra persona antes de la corrida.

Y se resolvió la contradicción de fondo: en `--todo`, si el servidor ya sirve
una compilación coherente, **no se recompila**. Recompilar ahí solo serviría
para invalidar el servidor que el E2E necesita, y un servidor corriendo es la
prueba de que la compilación salió bien. Un corredor que recompila y después
dice "no puedo probar porque recompilé" se está peleando consigo mismo.

---

## Verificado limpio

Esto se corrió y **no** produjo hallazgo. Se registra para que el próximo que
audite no lo repita a ciegas.

| Punto | Herramienta | Resultado |
|---|---|---|
| 2 · Secretos | gitleaks (Docker, historial completo) | **21 commits, 1.77 MB, sin fugas.** `.env` y `.env.test` nunca estuvieron seguidos. |
| 4 · Ciclos | madge, excluyendo `src/generated` | **0 ciclos** en 154 archivos propios. Los 19 que reporta sin excluir son del cliente Prisma generado. |
| 4 · Duplicado | jscpd (10 líneas / 60 tokens) | **0.65 %** — 171 líneas en 10 clones sobre 151 archivos. Los relevantes eran T-07. |
| 4 · Muerto | knip | Sin código muerto real (ver T-11). |
| 7 · Autorización | 22 endpoints × 4 actores, handlers reales | **La postura aguantó.** 80 de 82 casos pasaron en la primera corrida y los 2 restantes eran errores de la prueba, no del código. Ninguna ruta protegida quedó sin guarda, ningún comercio alcanza a otro, el admin observa pero no opera la cocina (ADR-09), y el cron no se abre ni con sesión de ADMIN. |
| 5 · SAST | semgrep, 598 reglas genéricas | **0 hallazgos** sobre 213 archivos. |
| 6 · ZAP | baseline contra producción | **0 FAIL, 64 PASS.** Tras los arreglos no queda ningún aviso de riesgo medio ni alto. |
| 33 · `.env` | inspección | `.env.example` completo y documentado, incluidos SMTP, VAPID y `CORREO_PERMITIDOS`. |
| 33 · `NEXT_PUBLIC_*` | grep sobre `src/` y `next.config.ts` | Dos variables: `NEXT_PUBLIC_SW_VERSION` (sello de compilación) y `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — la clave **pública**, que va al navegador por diseño. **Ningún secreto expuesto al cliente.** |

Vale la pena decirlo sin rodeos: el código de autorización está bien escrito. Se
revisaron a mano las dos rutas que usaban `exigirRol("COMERCIO")` sin
`exigirComercio` —`/api/cocina/[slug]` y la subida de imágenes— sospechando un
agujero de multi-tenencia, y las dos comprobaban el dueño por otro camino. Lo
que faltaba no era la defensa: era la prueba de que sigue ahí.

---

## Dependencias

| Paquete | Actual | Última | Nota |
|---|---|---|---|
| `@prisma/client`, `@prisma/adapter-pg` | 7.9.1 | 7.10.0 | menor, sin riesgo |
| `next`, `eslint-config-next` | 16.3.2 | 16.3.3 | parche |
| `nodemailer` | 9.0.5 | 9.0.6 | parche |
| `prisma` | 7.9.1 | 8.0.0-rc | quedarse en 7.10 |
| `@types/node` | ~~20.19.43~~ **^26** | 26.4.0 | T-09, arreglado |
| `eslint` | 9.39.5 | 10.9.1 | T-06, abierto |
| `typescript` | 5.9.3 | 7.0.2 | mayor; no urgente |

---

## Evidencia

```
audit/baseline/       npm ci · typecheck · lint · test · build
audit/cobertura/      coverage-summary.json + reporte v8
audit/deps/           npm-audit.json · npm-outdated.json · npm-ls · gitleaks
audit/arquitectura/   madge · knip · jscpd
```

Pruebas que salieron de esta auditoría:

```
tests/helpers/cookies.ts        doble de next/headers
tests/helpers/sesion.ts         sesiones reales y peticiones
tests/api-autorizacion.test.ts  punto 7  · 84 casos
tests/api-sesion.test.ts        punto 8  · 16 casos
tests/api-idempotencia.test.ts  punto 9  · 13 casos
```

---

## Cierre posterior — T-20, resuelto por la Fase 1 del rediseño

*29 de agosto de 2026. Estado: **ARREGLADO**.*

T-20 quedó anclado como abierto porque `--color-marca` cumplía dos papeles con
exigencias de contraste opuestas, y ningún valor único servía para los dos.
Medido en oscuro:

| Papel | `#f04352` | `#d42d40` |
|---|---|---|
| Relleno con blanco encima | 3.73:1 ❌ | **4.94:1** ✅ |
| Texto sobre `#181818` | **4.76:1** ✅ | 3.59:1 ❌ |

**Resuelto partiéndolo**, que era la salida que el propio hallazgo señalaba:
`--color-marca-fondo` para relleno y `--color-marca-texto` para trazo. En claro
los dos valen `#c91525`; en oscuro toman el valor que su papel exige.
`--color-marca` queda como alias obsoleto de `marca-texto` para que nada se
rompa si algún uso se escapó de la migración.

116 sustituciones en 40 archivos, repartidas por papel y no por nombre de
clase: `bg-*` al token de fondo, `text/border/ring/fill/stroke-*` al de trazo.

**Verificado** sobre botones renderizados, no solo sobre variables: en los dos
temas, el peor contraste de un botón rojo con texto blanco es **4.83:1**.
`audit:design` sin hallazgos, axe sin violaciones en claro y en oscuro, 629
pruebas verdes.

### Nota sobre este informe

Al buscar T-20 acá salió a la luz que **este documento no contiene los
hallazgos T-17 a T-26**: la numeración salta de T-16 a T-27. Esos diez existen
—se los cita en comentarios del código (`core/reserva.ts` para T-17), en
`docs/matriz-que-pasa-si.md` (T-17, T-24) y en los mensajes de commit, que es
donde quedó escrita su razón— pero no en el informe, que es donde alguien los
buscaría. Entre ellos hay arreglos que importan: T-17 (el tope de pedidos
activos bajo concurrencia), T-24 (el enlace mágico entero en el registro del
servidor) y T-22 (el icono de 512 que Android exige).

No se reconstruyen acá: excede el alcance de la Fase 1 y la decisión de
rehacerlos es de quien mantiene el informe. Queda anotado para que la ausencia
no se lea como que esos hallazgos no existieron.
