# Matriz "¿Qué pasa si…?"

> Punto 37 de la auditoría técnica.
>
> Cada fila dice qué hace el sistema y **dónde está la prueba que lo demuestra**.
> Una fila sin prueba es una intención, no un comportamiento: las que no la
> tienen están marcadas y son trabajo pendiente, no afirmaciones.

---

## El estudiante

| ¿Qué pasa si… | El sistema | Prueba |
|---|---|---|
| …dos personas piden la última plaza a la vez | Entra quien gane el bloqueo; el otro recibe 409 **con alternativas**. La carga nunca supera α·C(f). | `api-carreras.test.ts` · `concurrencia.test.ts` |
| …hace doble clic en confirmar | Un solo pedido. La segunda respuesta es 200 con `reintento: true` y el **mismo** código. | `api-carreras.test.ts` |
| …se le corta la red al confirmar y reintenta | Igual que el doble clic: la `Idempotency-Key` lo hace reconocible. Y el reintento **no gasta cuota** de rate limit. | `api-carreras.test.ts` |
| …manda dos pedidos distintos con la misma clave | **409 `IDEMPOTENCIA_EN_CONFLICTO`.** No se devuelve el pedido viejo: entregaría un código de retiro equivocado. | `api-idempotencia.test.ts` |
| …presenta la clave de idempotencia de otra persona | **409 `IDEMPOTENCIA_AJENA`**, y la respuesta no lleva ni el código ni el id ajenos. | `api-idempotencia.test.ts` |
| …reintenta con otra franja tras un rechazo por capacidad | Se acepta: ese rechazo no creó nada, así que es el mismo intento. La huella no incluye la franja a propósito. | `api-idempotencia.test.ts` |
| …ya tiene el máximo de pedidos activos | 409 `LIMITE_PEDIDOS_ACTIVOS` con texto accionable, y **no** abre la hoja de "franja agotada". | `api-idempotencia.test.ts` · corregido en `5e61c31` |
| …lanza varios pedidos a la vez para saltarse ese tope | No lo consigue: la fila del usuario se bloquea antes de contar. | `api-carreras.test.ts` (T-17) |
| …pide algo que se agota mientras arma el carrito | El producto se relee dentro de la transacción: el pedido no entra. | `api-carreras.test.ts` |
| …el comercio se pausa mientras confirma | 409 `COMERCIO_NO_DISPONIBLE`, con el carrito guardado. | `api-carreras.test.ts` |
| …vuelve horas después con el carrito a medias | Se restaura dentro de una ventana de 4 h, y se revalidan precios y disponibilidad **contra los de ahora**. | `carrito-guardado.test.ts` · `revalidar.test.ts` |
| …llega justo en el límite del cutoff | Entra. Un milisegundo después, no. | `api-tiempo-y-eventos.test.ts` |
| …abre el pedido de otra persona cambiando el id | 403, con el **mismo** mensaje que si no existiera: el endpoint no es un oráculo. | `api-autorizacion.test.ts` · `flujo.spec.ts` |
| …intenta marcar su propio pedido como LISTO | 403. Puede cancelar, no declarar cumplida la promesa que se está midiendo. | `api-autorizacion.test.ts` |
| …no retira el pedido | NO_SHOW a los `minutosNoShow` desde `listoEn`, no desde el fin de la franja: si la cocina se atrasó, su reloj no corre antes. Y se le avisa **antes** de perderlo. | `estados.test.ts` · `invariantes.test.ts` · `urgencia.test.ts` |
| …le presentan el código dos veces en el mostrador | El segundo RETIRADO es 409 y **no reescribe** la hora del primero. | `api-tiempo-y-eventos.test.ts` |
| …entra sin sesión a la portada | Ve el menú completo (RF-04) y **no se dispara ninguna llamada que vaya a dar 401**. | `interfaz.spec.ts` |

## La sesión

| ¿Qué pasa si… | El sistema | Prueba |
|---|---|---|
| …su sesión expiró | 401, y la interfaz explica qué pasó, qué se conservó y qué hacer. | `api-sesion.test.ts` · `HojaSesion` |
| …la sesión fue revocada pero no expiró | 401 igual. | `api-sesion.test.ts` |
| …alguien roba el contenido de la tabla `sesion` | No sirve: ahí solo hay hashes, y presentar el hash no autentica. | `api-sesion.test.ts` |
| …a un ADMIN lo degradan con la sesión abierta | Pierde el panel en la petición siguiente: el rol se lee cada vez, no se congela. | `api-sesion.test.ts` |
| …cambia su contraseña | Se revocan las **otras** sesiones y se conserva la que hizo el cambio. | `api-sesion.test.ts` |
| …abre el enlace mágico dos veces | Una sola sesión: el token se marca usado en la misma transacción que la crea. | `identidad.test.ts` |
| …el enlace mágico lleva `?volver=https://sitio-falso` | Se descarta y va a la portada. Cuatro capas, cada una con su prueba. | `capas-de-defensa.test.ts` |

## El comercio y la operación

| ¿Qué pasa si… | El sistema | Prueba |
|---|---|---|
| …un comercio toca datos de otro | 403 en todos los endpoints, con el mismo error para "no existe" y "no es tuyo". | `api-autorizacion.test.ts` (22 endpoints × 4 actores) |
| …un ADMIN intenta operar la cocina | 403: observa el piloto, no lo opera (ADR-09). | `api-autorizacion.test.ts` |
| …alguien llama al cron sin el secreto | 401, aunque sea ADMIN. Y sin `CRON_SECRET` configurado **falla cerrado**. | `api-autorizacion.test.ts` |
| …el cron se invoca por GET | Corre. Aceptar solo POST habría dado 405 en silencio y el barrido nunca habría ocurrido. | `api-autorizacion.test.ts` (hallazgo 8) |
| …sube una imagen que no es WebP | 415/400/413 según el caso; se comprueba la **firma** del archivo, no el `Content-Type`. | verificado a mano (punto 31) |
| …no puede preparar un pedido | Lo cancela con motivo, se libera la capacidad y queda el registro. | `ciclo-vida.test.ts` |

## La plataforma

| ¿Qué pasa si… | El sistema | Prueba |
|---|---|---|
| …se despliega mientras alguien tiene la app abierta | Reconoce el `ChunkLoadError`, dice que se publicó una versión, borra cachés y recarga sola. Con marca para no entrar en bucle. | `version-vieja.test.ts` |
| …el service worker tiene una versión vieja | El nombre del caché se deriva del sello de compilación; `activate` borra lo anterior. | `interfaz.spec.ts` (PWA) |
| …se pierde la conexión | Pantalla de respaldo y aviso en tres contextos; el pedido en curso sigue visible. | `interfaz.spec.ts` · `AvisoSinConexion` |
| …el usuario desactivó las animaciones | Nada se mueve. Verificado en los dos sentidos, para que el caso no pase por no animar nunca. | `interfaz.spec.ts` (motion) |
| …no hay SMTP configurado en producción | Se grita en el registro —nadie está recibiendo correo— y **el enlace mágico va con el token oculto**. | `capas-de-defensa.test.ts` (T-24) |
| …no hay claves VAPID | No se envía push, se dice en el log, y el correo sigue como respaldo. | `push.test.ts` |
| …la base devuelve un hash de contraseña corrupto | `false`. Nunca `true`, nunca una excepción: un dato corrupto no puede tumbar el acceso. | `capas-de-defensa.test.ts` |
| …llega un error no previsto a un handler | 500 genérico. El detalle va al registro del servidor, **no** a la respuesta. | `lib/http.ts` · `api-autorizacion.test.ts` |

---

## Filas sin prueba todavía

Se listan porque una matriz que solo muestra lo que ya está cubierto es
propaganda:

- **La base se cae a mitad de una transacción.** Postgres la deshace, pero no
  hay una prueba que lo ejerza.
- **Dos pestañas del mismo estudiante confirman a la vez.** Cubierto por la
  idempotencia solo si comparten la clave; si cada pestaña genera la suya, son
  dos pedidos legítimos y el tope de activos es lo único que los limita.
- **El reloj del servidor se desfasa.** Todo el cutoff depende de él y no hay
  nada que lo vigile.
- **Vercel reintenta un cron ya corrido.** El barrido debería ser idempotente;
  no está probado que lo sea.
