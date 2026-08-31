# TURNO — notas de desarrollo

Documento de trabajo: cómo se levanta el entorno, cómo entra cada rol, cómo se
prueba y qué decisiones hay detrás. Es el material de referencia técnica del
proyecto, no la presentación — esa está en el [README](../README.md).

Antes vivía en el README, pero mezclaba dos audiencias: quien quiere entender
qué es TURNO y quien va a tocar el código. Son documentos distintos.

---

## Arrancar en local

Requiere Node 20+ y Docker.

```bash
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Abre <http://localhost:3000>.

Sin proveedor de correo configurado, el enlace mágico se muestra como un botón
en la pantalla de entrada en vez de enviarse. En cuanto hay proveedor, el token
deja de devolverse **incluso en desarrollo**: si no, la prueba local no
verificaría lo que va a producción.

## Cómo entra cada quien

Dos métodos, según el rol (ADR-08). No es una inconsistencia: son dos contextos
de uso distintos.

| Rol | Método | Dónde | Por qué |
|---|---|---|---|
| **ESTUDIANTE** | Enlace mágico al correo | `/entrar` | Entra una vez por semestre, desde su teléfono. No hay contraseña que olvide ni que robarle |
| **COMERCIO** | Correo y contraseña | `/acceso` | La pantalla de cocina es compartida: pedir un enlace a un buzón personal en hora pico no funciona |
| **ADMIN** | Correo y contraseña | `/acceso` | El panel necesita acceso determinista, sin depender de que el correo llegue |

El administrador **no** opera la cocina (ADR-09): quien mide el piloto no debe
producir los datos que mide. Observa todo, no toca nada.

Las cuentas de operación **no** pueden pedir enlace mágico, y un estudiante **no**
puede entrar por `/acceso`. El rol decide el método.

### Crear cuentas de operación

No hay auto-registro para estas cuentas: las crea el equipo.

```bash
npm run cuenta -- --correo=vos@uamv.edu.ni --rol=ADMIN
```

```bash
npm run cuenta -- --correo=cocina@uamv.edu.ni --rol=COMERCIO --comercio=cafeteria-central
```

Sin `--password` se genera una y se imprime **una sola vez**. La cuenta queda
marcada para cambiarla en el primer acceso. Si la perdés, volvé a correr el
comando: reemplaza la contraseña.

## Correo

Con `RESEND_API_KEY` sin configurar, el sistema **no envía nada**: imprime los
correos en la consola del servidor y la pantalla de acceso muestra el enlace
como botón. Es el modo por defecto en desarrollo, y permite probar el flujo
completo sin proveedor.

### Opción corta: SMTP con contraseña de aplicación

Es el camino para el piloto. Al autenticarse **como** el buzón institucional no
hace falta verificar ningún dominio — que es justo el trámite imposible cuando
`uam.edu.ni` no es tuyo.

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=tu@uamv.edu.ni
SMTP_PASS="xxxx xxxx xxxx xxxx"
```

La contraseña **normal de la cuenta no sirve**: hace falta una contraseña de
aplicación de 16 caracteres, y para generarla la cuenta necesita verificación en
dos pasos activada. Si es Google Workspace, el administrador del dominio puede
tener bloqueado el acceso SMTP.

### Opción de producción: Resend

Mejor entregabilidad y métricas, pero exige **un dominio propio verificado** más
`RESEND_API_KEY` y `CORREO_REMITENTE`. Con el remitente de prueba de Resend solo
se puede escribir a la dirección con la que se creó la cuenta.

Si están las dos configuraciones, gana SMTP.

```bash
npm run correo:probar -- --para=vos@uamv.edu.ni
```

Reporta el controlador activo y, si falla, el error exacto del proveedor.

Las notificaciones de pedido no se envían en el momento: se escriben en la tabla
`notificacion` dentro de la misma transacción del pedido y las vacía el cron. La
creación del pedido nunca depende de que el correo salga.

## Avisos al teléfono (Web Push)

El correo llega, pero tarde y a un buzón que nadie mira caminando por el campus.
Web Push avisa **con la aplicación cerrada**, y de paso es lo que permite dejar
de sondear desde el teléfono del estudiante — ver [ADR-14](./adr/adr-14-web-push.md)
y [ADR-18](./adr/adr-18-infraestructura.md).

```bash
npm run push:claves
```

Copiá el resultado a `.env`. **Sin estas variables el sistema no envía push y lo
dice en el log**; el correo sigue funcionando como respaldo. Es el modo por
defecto en desarrollo y permite probar el flujo entero sin proveedor.

Un mismo hecho ("tu pedido está listo") genera dos filas en `notificacion`, una
por canal. El push se intenta **de inmediato** al cambiar el estado, y el cron
solo reintenta lo que ese intento no logró: un aviso de listo que llega diez
minutos tarde es peor que no llegar.

> **En desarrollo no hay push.** El service worker solo se registra en
> producción (ver `src/lib/sw-cliente.ts`). Para probarlo de verdad:
> `npm run build && npm start`.

> **En iPhone y iPad los avisos solo llegan si el sitio está agregado a la
> pantalla de inicio.** Desde una pestaña de Safari no llega nada, y Chrome
> tampoco lo arregla porque en iOS todos los navegadores usan WebKit. La
> interfaz detecta ese caso y explica el gesto en vez de mostrar un botón que
> fallaría en silencio.

## Pruebas

```bash
npm test
```

Usa una base separada (`turno_test`, puerto 55433, en tmpfs) que se limpia entre
casos. La primera vez:

```bash
npm run test:setup
```

---

## El núcleo

La regla de admisión, en una línea:

```
admitir el pedido i en la franja f  ⟺  carga_actual(f) + w(i) ≤ α · C(f)
```

- **C(f)** = personal de cocina × Δ, en **minutos-cocina**. No en cantidad de
  pedidos: diez cafés no son diez almuerzos.
- **w(i)** = Σ t(p) × cantidad. El costo del pedido, en la misma unidad.
- **α** = factor de seguridad. No se deduce, **se calibra** con la tasa de
  cumplimiento observada.
- **Δ** = ancho de franja. Es una variable experimental, no una constante.

El paralelismo de la cocina está modelado en **C(f)**, no en w(i): con dos
personas y Δ=10 hay 20 minutos-cocina en una ventana de 10 minutos de reloj.
Ambos lados de la desigualdad miden trabajo. La simplificación declarada es que
el trabajo se asume divisible y transferible entre el personal — supuesto que
falla si hay un único recurso físico, como una sola plancha.

Si el pedido no cabe, el sistema **no rechaza**: propone la siguiente franja con
espacio. Ahí está el aplanamiento.

### Mapa del código

| Archivo | Qué contiene |
|---|---|
| `src/core/admision.ts` | La regla, el criterio t(p) ≥ t_mín, las condiciones A/B, el cut-off. **Puro**: sin base de datos ni reloj implícito, para que lo reutilice el simulador de §15 |
| `src/core/reserva.ts` | La transacción con `SELECT … FOR UPDATE` (ADR-03) |
| `src/core/estados.ts` | Máquina de estados y evaluación de cumplimiento |
| `src/core/ciclo-vida.ts` | Transiciones, liberación de capacidad, barrido de vencidos |
| `src/core/franjas.ts` | Generación de franjas y C(f) |
| `src/core/identidad.ts` | Enlace mágico, tokens, asignación experimental |
| `src/core/limites.ts` | Rate limiting persistido |
| `src/core/metricas.ts` | Los indicadores de §14.5 y la comparación A/B |
| `src/core/autorizacion.ts` | Reglas de acceso, puras y verificables sin levantar Next |
| `src/core/administracion.ts` | Reglas del panel del comercio: lo que impide romper el invariante desde la configuración |
| `src/core/simulador.ts` | Simulación de eventos discretos (§15), **sobre el mismo módulo de admisión** |

| Archivo | Qué contiene |
|---|---|
| `src/lib/push.ts` | Web Push del lado del servidor: envío, limpieza de suscripciones muertas, bandeja (ADR-14) |
| `src/lib/push-cliente.ts` | Suscripción del navegador y los seis estados posibles, incluido el de iOS sin instalar |
| `src/lib/sondeo.ts` | `useSondeo`: sondea solo con la pestaña a la vista |
| `public/sw.js` | Service worker: sin conexión, revalidación con `ETag`, y la recepción del push |

Todo lo que está en `core/` es puro o recibe el cliente de base de datos por
parámetro. Eso es lo que permite probarlo y reutilizarlo en el simulador.

---

## Concurrencia: cuatro niveles

| Nivel | Conflicto | Control | Prueba |
|---|---|---|---|
| 1 | Dos usuarios por la última plaza de una franja | `SELECT … FOR UPDATE` | `tests/concurrencia.test.ts` |
| 2 | Un producto se agota mientras se pide | Relectura del producto dentro de la transacción | `tests/integridad.test.ts` |
| 3 | El mismo usuario envía el pedido dos veces | `idempotencyKey` con `UNIQUE` y recuperación ante colisión | `tests/integridad.test.ts` |
| 4 | El comercio cambia precio o t(p) durante la compra | Snapshot en `item_pedido` | `tests/integridad.test.ts` |

Y la cancelación es el invariante leído al revés: dos cancelaciones simultáneas
del mismo pedido liberarían capacidad dos veces — sobreventa por la puerta de
atrás. Se controla con lock de la fila del pedido más la bandera
`capacidadLiberada`.

### El control negativo

`tests/control-negativo.test.ts` implementa la versión **ingenua** de la reserva
(leer → decidir → escribir, lo que hace una herramienta no-code) y verifica que
bajo la misma carga concurrente **sí** rompe el invariante.

Sin ese control, la prueba de cero sobreventas no demuestra que el lock sirva:
solo demuestra que el test pasa. Con él, mismo escenario y dos implementaciones
dan resultados distintos — que es la evidencia citable en el Capítulo IV.

---

## Requisitos

La matriz completa está en [requisitos.md](./requisitos.md): 24 requisitos
funcionales y 23 no funcionales, cada uno con origen, prioridad, criterio de
aceptación y **el archivo de prueba que lo verifica**.

Una lista de viñetas sin criterio medible es el error 03 del instructivo. Lo que
separa un 70 de un 90 es poder señalar, para cada requisito, la prueba que se
ejecuta con `npm test`.

## Seguridad: control → evidencia

| Amenaza | Control | Evidencia |
|---|---|---|
| Sobreventa bajo concurrencia | Transacción con bloqueo pesimista | `tests/concurrencia.test.ts` + control negativo |
| Pedido duplicado por reintento | `Idempotency-Key` obligatoria | `tests/integridad.test.ts` |
| Leer el pedido de otro (IDOR) | `exigirAccesoPedido` server-side | `tests/identidad.test.ts` |
| Operar el pedido de otro | Autorización por acción, no solo por pertenencia | ruta `PATCH /api/pedidos/:id/estado` |
| Enumerar qué pedidos existen | Mismo 403 para inexistente y ajeno | verificado end-to-end |
| Token de acceso reutilizado | Un solo uso, marcado dentro de la transacción del canje | `tests/auth.test.ts` |
| Token filtrado desde la base | Solo se almacena SHA-256; el claro nunca se persiste ni se registra | `tests/auth.test.ts` |
| Abuso del correo transaccional | Límite por buzón y por IP, persistido | `tests/auth.test.ts` |
| Manipulación de precio o carga | El servidor recalcula todo desde la base | `src/core/reserva.ts` |
| Robo de sesión vía XSS | Cookie `httpOnly`, `secure`, `sameSite=lax` | `src/lib/auth.ts` |
| Fuerza bruta contra una cuenta de operación | Límite por cuenta y por IP | `src/core/limites.ts` |
| Enumerar qué correos son cuentas de operación | Mismo 401 y mismo tiempo de respuesta (hash señuelo) | `src/lib/auth.ts` |
| Contraseña filtrada desde la base | scrypt con sal por usuario y coste versionado | `tests/credenciales.test.ts` |
| Sesión robada convertida en toma de cuenta | El cambio de contraseña exige la actual y revoca las demás sesiones | `src/lib/auth.ts` |
| Redirección abierta tras el inicio de sesión | `volver` solo acepta rutas relativas de este sitio | `tests/rutas.test.ts` |
| Secuestro de clics sobre los botones de cocina | `frame-ancestors 'none'` y `X-Frame-Options: DENY` | `next.config.ts` |
| Respuesta de sesión cacheada por un proxy | `Cache-Control: no-store` y `Vary: Cookie` en toda la API | `next.config.ts` |
| Correo a direcciones ficticias desde la cuenta real | Fuera de producción solo se escribe a la cuenta remitente | `tests/correo.test.ts` |
| Credenciales vencidas acumuladas | Purga diaria de tokens y sesiones en el cron | `src/core/limites.ts` |

El cliente manda **IDs y cantidades**. Nunca precios, cargas ni tiempos de
preparación.

---

## Instrumentación (§12)

Los campos que habilitan el Capítulo V están en el modelo **desde el diseño**,
no agregados después:

`condicionExperimental` · `franjaSolicitadaId` · `franjaId` ·
`franjasOfrecidas` · `motivoAsignacion` · `cargaEstimadaMin` · `creadoEn` ·
`listoEn` · `retiradoEn` · `canceladoEn` · `estado` · `cumplimiento` ·
`canalCaptacion` · `usuario.primerPedidoEn`

Más `evento_pedido`, que reconstruye la línea de tiempo completa.

**Toda marca de tiempo es `timestamptz`.** Un `timestamp` sin zona produce
números plausibles y equivocados al comparar instantes, y el error es
silencioso.

`estado` y `cumplimiento` son campos distintos a propósito: un pedido puede
seguir `EN_PREPARACION` y ya estar `INCUMPLIDO`. Mezclarlos haría imposible
medir el indicador 2.

---

## Decisiones que conviene poder defender

**Por qué la franja elegida se respeta siempre.** Cuando el pedido cabe donde el
usuario pidió, se admite ahí. La condición B interviene en **qué se sugiere
antes de elegir**, no en imponer un destino distinto al confirmado: reasignar
por detrás confundiría el efecto medido con una reasignación forzada.

**Por qué no hay carritos que reserven capacidad.** La capacidad se toca
únicamente al confirmar. No hay reservas temporales que expiren, así que no hay
capacidad desperdiciada por gente que abandona la pantalla — ni un sistema de
expiración que mantener.

**Por qué las franjas llenas se muestran tachadas y no ocultas.** Que el
estudiante vea por qué no puede tener las 12:00 es lo que produce el
aplanamiento. Si desaparecieran, la interfaz escondería el mecanismo evaluado.

**Por qué el rate limiting está en PostgreSQL.** En serverless cada invocación
puede caer en una instancia distinta: un contador en memoria daría sensación de
control sin control.

**Por qué sondeo y no WebSocket** (ADR-05). La cola tiene decenas de filas y el
WiFi del campus se corta. Una petición idempotente que se reintenta sola es más
robusta que una conexión persistente que hay que reconectar, y no agrega
infraestructura.

---

## Fuera del alcance

App móvil nativa · pagos en línea · comisiones · múltiples comercios simultáneos
· cupones · pedidos grupales · chat · inventario · recomendaciones ·
microservicios.

Nueve funciones. Si la lista crece, algo tiene que salir.

---

## Simulación (§15)

```bash
npm run simular -- --calibrar
```

Responde lo que el piloto no puede: cuál es el Δ óptimo, qué α sirve más pedidos
sin bajar del 90% de cumplimiento, y hasta qué volumen aguanta el comercio.

El simulador **importa el mismo módulo de admisión que la reserva real** (ADR-10).
Si tuviera su propia copia de la regla, sus resultados no dirían nada sobre el
sistema: dirían algo sobre una segunda implementación que se le parece.

Con `--calibrar` toma de la base los t(p) medidos, el personal, Δ, α y la demanda
observada; los pesos de cada producto salen de cuántas veces se pidió de verdad.
`adherenciaB` y `variabilidadCocina` siguen siendo supuestos declarados hasta que
el piloto los mida — están marcados como tales en el código.

## Evidencia de los nueve indicadores

| # | Indicador | Cómo se obtiene |
|---|---|---|
| 1 | Tiempo de receso recuperado | `tiempoRecuperadoMin` + línea base de campo |
| 2 | Cumplimiento de la promesa | Panel y CSV; `cumplimiento` separado del estado operativo |
| 3 | Pico/promedio de carga | Panel, comparación A/B; simulador para el contrafáctico |
| 4 | Tasa de no-show | Panel; barrido automático a los N minutos del `listoEn` |
| 5 | Throughput del comercio | CSV de pedidos crudos |
| 6 | Conversión del embudo QR | Panel, por canal; carteles en `/comercio/[slug]/carteles` |
| 7 | Usabilidad (SUS) | `/sus` al cierre + micro-encuesta tras cada retiro |
| 8 | Tiempo de respuesta P95 | `npm run carga` |
| 9 | Integridad bajo concurrencia | `tests/concurrencia.test.ts` + control negativo |

```bash
npm run carga -- --usuarios=40 --duracion=20
```

Reporta P95 por endpoint, no promedio: el promedio esconde justo la cola que al
usuario le duele. Y cuenta los errores, porque un P95 bajo con 500 rápidos no es
una prueba aprobada.

## Carteles con QR

Cada cartel lleva su propio parámetro `canal`, que viaja hasta
`usuario.canalCaptacion` y `pedido.canalCaptacion`. Sin eso, el panel puede decir
cuánta gente se registró pero no de dónde vino — y "¿qué canal capta mejor?" es
un resultado del estudio (§14.4), no un detalle de decoración.

Se imprimen desde el panel del comercio. Antes de imprimir, comprobá que `APP_URL`
apunte al despliegue real y no a `localhost`.

## Producción

```bash
curl https://tu-despliegue/api/salud
```

Toca la base con una consulta real: un endpoint que devuelve "ok" sin consultar
nada da tranquilidad falsa, porque el proceso puede estar vivo con la base
inalcanzable — que es justo el modo de fallo del riesgo 8 de §17.

`vercel.json` programa el barrido cada 10 minutos. El endpoint acepta **GET y
POST**: el programador de Vercel invoca por GET, y sin ese método el cron
devolvería 405 en silencio y los NO_SHOW nunca aparecerían en el análisis.

Antes de desplegar:

- `APP_URL` apuntando al dominio real (los carteles con QR lo usan)
- `CRON_SECRET` con un valor propio
- La cadena de conexión **con pooling** de Neon, no la directa (§10.2)

## Pendiente

- Envío real de correo (la bandeja de salida `notificacion` ya persiste los
  envíos pendientes con reintento; falta el proveedor)
