# ADR-12 — La aplicación funciona sin conexión, y la CSP usa nonce

**Estado:** aceptada · **Fecha:** 2026-08-24 · **Corrige:** un fallo de producción no detectado

## Contexto

Dos problemas que salieron juntos, porque el segundo se descubrió al probar el primero.

### 1. La aplicación dependía de la red para mostrar cualquier cosa

El ADR-05 ya reconocía que el WiFi del campus se corta: es la razón del sondeo
en vez de WebSocket. Pero el reconocimiento se quedaba en el transporte. La
aplicación seguía necesitando red para pintar una pantalla, y eso falla en el
peor momento posible: el estudiante camina al comercio con el seguimiento
abierto, pierde la señal en un pasillo, y llega al mostrador **sin su código de
retiro** — lo único que necesitaba ahí.

### 2. La compilación de producción llegaba muerta

Al compilar para probar lo anterior, la aplicación cargaba pero no respondía. La
causa: la CSP de `next.config.ts` declaraba `script-src 'self'` en producción, y
Next.js emite **scripts en línea** para arrancar la hidratación y transmitir el
árbol de servidor. El navegador los bloqueaba todos.

No se había detectado porque la misma configuración añadía `'unsafe-inline'` en
desarrollo —el recargado en caliente lo necesita— y ahí todo funcionaba. **La
única compilación que importaba era justo la que no se probaba.**

## Decisión

### Service worker con tres estrategias

| Qué se pide | Estrategia | Por qué |
|---|---|---|
| `/_next/static` | Caché primero | Llevan hash: un archivo dado nunca cambia de contenido |
| Navegaciones | Red primero → copia → `/sin-conexion` | El estado cambia; la copia existe para que la app abra igual |
| `GET /api/pedidos/...` | Red primero → copia marcada | Es lo que hace sobrevivir el código de retiro |

Lo que **nunca** se guarda: nada que no sea `GET`, y nada de `/api/auth`. Un
token en un caché de disco es una credencial esperando.

Una copia servida sin red viaja con la cabecera `X-Turno-Desde-Cache`, y la
pantalla lo dice: *"Sin conexión. Esto es lo último que supimos del pedido. Tu
código y tu hora siguen siendo válidos en el mostrador."* Mostrar datos viejos
sin avisar sería peor que no mostrarlos.

### CSP con nonce por respuesta, en `src/middleware.ts`

`'unsafe-inline'` habría arreglado la pantalla anulando la defensa: es
exactamente el permiso que un XSS necesita. El nonce la conserva — el navegador
ejecuta los scripts en línea que llevan el número de esa respuesta y ninguno
más, y no se puede adivinar porque cambia en cada petición. `'strict-dynamic'`
deja que los scripts ya confiados carguen sus propios fragmentos, que es como
funciona la división de código de Next.

## Consecuencias

### El renderizado pasa a ser dinámico en toda la aplicación

Descubierto al verificar: el nonce **no llega a las páginas prerenderizadas**,
porque se generan al compilar, cuando no existe la petición de la que sale. Sus
scripts quedaban sin marcar y el navegador los bloqueaba. El síntoma era una
pantalla que cargaba y no respondía, solo en las rutas estáticas.

El costo es bajo acá y conviene decir por qué: **no había ninguna página que se
sirviera igual para todos.** Todas dependen de la sesión y piden sus datos al
montarse, así que el HTML estático solo era una cáscara vacía. Esa cáscara la
guarda ahora el service worker, que además la sirve sin conexión — cosa que el
prerenderizado no hacía.

### Los cachés se versionan por compilación

También descubierto al verificar, y es un fallo que el service worker
introducía por sí mismo: los fragmentos de `/_next/static` llevan hash, así que
una compilación nueva borra los viejos del servidor. Una página guardada de la
compilación **anterior** pide fragmentos que ya no existen, y quien vuelve
después de un despliegue recibe una pantalla rota que solo se repara vaciando el
caché a mano.

Se corrigió derivando el nombre de los cachés del `?v=` con que la página
registra el worker, y ese valor es un sello de compilación
(`NEXT_PUBLIC_SW_VERSION` en `next.config.ts`). Un despliegue nuevo cambia la
URL del worker, el navegador lo reinstala, y `activate` borra todo lo de la
versión anterior.

### Cerrar sesión ahora borra los cachés

Los pedidos guardados llevan código, comercio y hora de quien inició sesión: son
datos personales, y el teléfono se presta. Sin ese borrado, cerrar sesión no
significaría lo que la gente cree. *(Y hasta ahora no había forma de cerrar
sesión. Ver ADR-13.)*

### Lo que esto NO resuelve

Sin conexión no se puede **crear** un pedido, y es correcto que así sea: la
regla de admisión decide contra la carga real de la franja en ese instante, con
bloqueo en la base (ADR-03). Un pedido "encolado" para enviarse al recuperar
señal sería una promesa que el sistema no puede sostener — exactamente lo que
TURNO existe para evitar.

## Verificación

Con el servidor **apagado**, la pantalla de seguimiento carga desde la copia
local y muestra el código `AA-100`, el comercio, el total y la ventana horaria,
con el aviso de desconexión. Tras recompilar, los cachés de la versión anterior
desaparecen y quedan solo los nuevos. En las cuatro rutas comprobadas, cero
scripts en línea sin nonce.
