# ADR-13 — Pedir lo mismo, avisar cuando esté listo, y poder salir

**Estado:** aceptada · **Fecha:** 2026-08-24

## Contexto

Tres huecos de uso, encontrados recorriendo la aplicación como la recorrería un
estudiante y no como la recorre quien la escribió.

## 1. No se podía cerrar sesión

No existía el botón, en ninguna pantalla. La ausencia no es menor: el ADR-08
justifica usar contraseña para operación en que **la pantalla de cocina es
compartida**. Una pantalla compartida donde se puede entrar pero no salir deja
la sesión del turno anterior abierta para el siguiente. Lo mismo vale para el
teléfono que se presta entre compañeros.

Se agregó en la barra de escritorio (donde vive la cocina) y al pie de *Mis
pedidos* (donde vive el estudiante). No va en la barra inferior del móvil: esa
es de navegación, y una acción destructiva ahí se toca sin querer.

Cerrar sesión **también borra los cachés locales**, por lo dicho en el ADR-12.

## 2. Repetir un pedido obligaba a recorrer el menú entero

En un comercio de campus el mismo estudiante pide casi siempre lo mismo.
`/c/<slug>?repetir=<id>` rearma el carrito con un pedido pasado.

La regla vive en `src/core/repetir.ts`, no en el componente, porque tiene casos
límite que hay que poder probar sin montar una pantalla. En una línea: **se
repite lo que todavía se puede pedir, y lo que no, se dice por su nombre.**

El detalle que importa es *cuándo* se filtra. Un producto pudo archivarse,
agotarse, o dejar de ser anticipable —el comercio pudo subirle el tiempo de
preparación por encima del ancho de franja—. Metido igual al carrito, el sistema
lo aceptaría hasta el momento de confirmar y ahí devolvería un rechazo
inexplicable, después de que el estudiante ya eligió hora. Filtrar al rearmar
mueve esa noticia al principio, cuando todavía es barata.

Ocho pruebas en `tests/repetir.test.ts` cubren: agotado, no anticipable, borrado
del menú, líneas repetidas del mismo producto (se suman), avisos duplicados (se
dicen una vez), cantidades no positivas, y el pedido entero de productos
retirados.

## 3. El cambio a LISTO no avisaba a nadie

El comentario de la pantalla de seguimiento describe el uso real: *"es la
pantalla que el estudiante deja abierta mientras camina al comercio"*. Pero
caminando nadie mira el teléfono. El sondeo detectaba el cambio a `LISTO` y no
hacía nada con él salvo repintar una pantalla que en ese momento nadie está
viendo.

Ahora el teléfono **vibra y notifica** en la transición a `LISTO` — en la
transición, no cada vez que se ve el estado, o cada sondeo volvería a avisar lo
mismo. Tampoco se avisa desde una copia sin conexión: eso no es noticia nueva.

El permiso **no se pide al cargar**. Un navegador que pregunta por
notificaciones antes de que exista un motivo recibe un "no" casi siempre, y ese
"no" cuesta revertirlo. Se pide con un botón, cuando ya hay un pedido en curso y
el motivo es evidente.

### Alcance, dicho de frente

Esto es la Notification API, **no Web Push**. Funciona mientras la página siga
cargada en alguna pestaña. Si el estudiante cerró todo, el aviso no llega y el
correo sigue siendo el respaldo. Web Push —que sí funciona con todo cerrado—
exige claves VAPID, una tabla de suscripciones y un servicio de entrega; es el
paso siguiente, no éste.

## Otros

- **Salto al contenido** en el layout: sin él, navegar con teclado o lector de
  pantalla obliga a recorrer toda la navegación en cada página.
- `GET /api/pedidos` y `GET /api/pedidos/[id]` ahora exponen `comercioSlug` y
  `productoId`. El nombre del producto es una instantánea histórica y no sirve
  para volver a armar un carrito.
