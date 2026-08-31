# ADR-14 — Web Push, y el sondeo solo con la pestaña a la vista

**Estado:** aceptada · **Fecha:** 2026-08-27 · **Modifica:**
[ADR-05](adr-05-sondeo.md) para el lado del estudiante ·
**Completa:** [ADR-13](adr-13-repetir-y-salir.md) ·
**Habilitado por:** [ADR-18](adr-18-infraestructura.md)

## Contexto

`src/lib/aviso.ts` ya dejaba escrito el diagnóstico y el límite:

> ALCANCE — esto es la Notification API, no Web Push. Funciona mientras la
> página siga cargada en alguna pestaña. Si el estudiante cerró todo, el aviso
> no llega, y el correo sigue siendo el respaldo. Web Push (que sí funciona con
> todo cerrado) exige claves VAPID, una tabla de suscripciones y un servicio de
> entrega; **es el paso siguiente, no éste.**

Ese paso siguiente ahora es obligatorio, y por una razón que no era visible
cuando se escribió esa nota. El ADR-18 midió el consumo del sondeo contra el
plan gratuito y encontró que el límite que se agota primero no es el
almacenamiento ni las invocaciones, sino la **CPU**: 4 horas-CPU repartidas
entre ~814 k invocaciones mensuales dan 17.7 ms por petición, que una consulta
con Prisma no respeta. El sondeo del lado del estudiante es dos tercios de eso.

Así que hay dos problemas con una sola causa:

1. **De producto** — el estudiante confirma el pedido, se guarda el teléfono y
   camina. La pantalla que sondea está en el bolsillo y no la ve nadie.
2. **De infraestructura** — esa misma pantalla invisible es la que gasta el
   presupuesto de cómputo.

**Web Push resuelve los dos**, y ese es el argumento: no se adopta por
comodidad, se adopta porque sin él el despliegue no cabe.

## Alternativas

| Opción | Con la app cerrada | Costo en cómputo | Veredicto |
|---|---|---|---|
| **Web Push + sondeo con la pestaña visible** | sí | ~40 k inv./mes | **Adoptada** |
| Seguir con Notification API | no | ~380 k inv./mes | Insuficiente: es el problema |
| WebSocket / SSE al estudiante | no | conexiones abiertas | Rompe el ADR-05 y no avisa cerrado |
| Solo correo | sí | ~0 | Ya existe; llega tarde y se ignora |

El correo **no se quita**: pasa a ser explícitamente el respaldo para quien no
instaló la aplicación o negó el permiso.

## Decisión

### 1. La bandeja de salida se comparte, no se duplica

Un mismo hecho ("tu pedido está listo") genera **dos filas** en `notificacion`,
una por canal. `CanalNotificacion` es nuevo y el UNIQUE pasa de
`(pedidoId, tipo)` a `(pedidoId, tipo, canal)`.

No se creó una tabla paralela a propósito: el patrón de bandeja de salida con
reintento y sin duplicados ya estaba construido y probado, y dos tablas con la
misma semántica se desincronizan.

El riesgo que introduce compartir la tabla es concreto y tiene su prueba: sin el
filtro por canal, `vaciarBandeja` intentaría "enviar por correo" una fila
destinada a un teléfono y la marcaría como entregada. Eso es
`tests/push.test.ts` → *«vaciar la bandeja de correo NO marca las filas de
push»*.

### 2. Dos caminos de entrega, no uno

La bandeja sola no alcanza acá. El correo tolera que el cron lo vacíe diez
minutos después; un aviso de "tu pedido está listo" con diez minutos de retraso
es **peor que no llegar**, porque el estudiante ya caminó hasta el mostrador.

- **`entregarPushDePedido`** — intento inmediato, justo después de que la
  transacción confirma, desde la ruta que cambió el estado. Es el que entrega en
  la práctica.
- **`vaciarBandejaPush`** — red de seguridad del cron, para lo que el intento
  inmediato no logró.

Los dos son idempotentes contra la misma fila, así que conviven sin duplicar el
aviso. El intento inmediato **nunca lanza**: que el servicio de push de Google
esté caído no puede impedir que la cocina marque un pedido como listo.

### 3. El sondeo se detiene cuando nadie mira

`useSondeo` (`src/lib/sondeo.ts`) para el temporizador cuando la pestaña se
oculta y lo reanuda —con una carga inmediata— cuando vuelve. Esa carga
inmediata importa: sin ella, quien desbloquea el teléfono vería el estado viejo
durante hasta diez segundos, justo en el momento en que más le importa.

**El tablero de cocina no cambia.** El ADR-05 sigue siendo correcto ahí: una
petición idempotente que se reintenta sola tolera mejor el WiFi del campus que
una conexión que hay que reconectar. Y los tableros son pocos —tres comercios,
tres pantallas—. El sondeo es caro multiplicado por cientos de estudiantes, no
por tres cocinas.

### 4. Revalidación condicional para el sondeo que queda

`GET /api/pedidos/:id` devuelve un `ETag` derivado de `actualizadoEn`, y el
service worker manda `If-None-Match`. Cuando coincide, la ruta corta **antes**
de la consulta pesada (items, eventos, franja, comercio) — que es donde está el
gasto de CPU que el ADR-18 midió. La respuesta baja de 783 a 19 bytes.

Los dos lados son necesarios: la API va con `Cache-Control: no-store`, así que
el navegador no revalida por su cuenta. Quien tiene la copia anterior es el
worker, que ya interceptaba `/api/pedidos`.

**No se usa 304, y la razón es empírica.** La primera implementación devolvía
`304 Not Modified`, que es lo correcto según HTTP. No funciona: en Next 16.3.2
un `NextResponse` con estado 304 devuelto desde un Route Handler **no llega al
cliente**. Se verificó contra el servidor de producción — el handler construye
el 304 (confirmado con instrumentación en el log) y la capa de red del navegador
registra un 200 con el cuerpo completo de 783 bytes.

Como los dos extremos son nuestros, no hace falta pelearse con el framework: la
ruta responde 200 con `{"sinCambios":true}` y la cabecera
`X-Turno-Sin-Cambios`, y el worker la traduce a "servir la copia vigente". El
ahorro que importaba se conserva entero, porque lo caro era la consulta.

Esa respuesta mínima **solo se produce cuando el cliente mandó `If-None-Match`**,
y el único que lo manda es el service worker. Ningún otro cliente la ve nunca.
Verificado en el navegador contra el servidor de producción: tres sondeos
consecutivos a través del worker devuelven el pedido completo, sin que el
marcador se filtre a la pantalla, y un cambio real del pedido invalida la copia
y llega a la primera.

Un detalle que parece menor y no lo es: **la respuesta sin cambios no se marca
con `X-Turno-Desde-Cache`**. Esa cabecera significa "puede estar viejo"; ésta
significa lo contrario — el servidor acaba de confirmar que sigue vigente.
Confundirlas haría aparecer el cartel de "sin conexión" en una pantalla
perfectamente actualizada.

### 5. En iOS, instalar deja de ser opcional

Apple solo entrega push a sitios **agregados a la pantalla de inicio**. Desde
una pestaña de Safari no llega nada, y como todos los navegadores de iOS usan
WebKit, Chrome tampoco lo arregla. Safari además no implementa
`beforeinstallprompt`, así que no existe un botón "Instalar" que ofrecer.

Por eso `EstadoPush` distingue `requiere-instalar` de `inactiva`, y la interfaz
explica el gesto en vez de mostrar un botón. Confundir los dos estados produce
el peor resultado posible: un botón que el estudiante toca, que falla en
silencio, y que le enseña que los avisos no funcionan.

## Consecuencias

- **Una dependencia nueva**: `web-push` 3.6.7, MIT, en el servidor. Implementar
  el cifrado del RFC 8291 a mano sería criptografía escrita a mano en el camino
  de un aviso — exactamente donde no corresponde. No afecta al ADR-11: no es
  una librería de interfaz y no viaja al navegador.
- **Consumo estimado**: ~814 k → ~483 k invocaciones al mes. El sondeo del
  estudiante baja de ~380 k a ~40 k.
- **Una suscripción muerta se borra**, no se reintenta: 404/410 elimina la fila
  de una, y cinco fallos consecutivos descartan el dispositivo.
- **Un endpoint pertenece a quien usa el aparato ahora.** El `upsert` por
  `endpoint` reasigna la suscripción al usuario que acaba de iniciar sesión: en
  un teléfono prestado, el dueño anterior deja de recibir avisos de sus pedidos.
- **`pushsubscriptionchange`** se maneja en el worker. El navegador puede rotar
  el endpoint por su cuenta, y sin esto los avisos se perderían en silencio —
  el peor modo de falla, porque nadie se entera hasta que alguien reclama.
- **Sin claves VAPID el sistema no envía y lo dice en el log**, igual que el
  controlador `consola` del correo. Es el modo por defecto en desarrollo y
  permite probar el flujo entero sin proveedor.
- **En desarrollo no hay push**, porque el service worker solo se registra en
  producción (`src/lib/sw-cliente.ts`). Para probarlo:
  `npm run build && npm start`.
- `src/lib/aviso.ts` **se conserva**. Sigue siendo el aviso inmediato cuando la
  pestaña está a la vista, y funciona donde Web Push no llega.

## Lo que queda pendiente

La instalación guiada en iOS está **explicada, no automatizada**: hoy es un
texto que aparece cuando corresponde. Detectar el momento óptimo —justo después
del primer pedido confirmado, no al aterrizar— es trabajo aparte, y es lo que
decide qué porcentaje de estudiantes llega a recibir un aviso.
