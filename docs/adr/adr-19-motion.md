# ADR-19 — El motion system se implementa con la plataforma

**Estado:** aceptada · **Fecha:** 2026-08-28 · **Extiende:**
[ADR-11](adr-11-movimiento.md) · **Implementa:** §16 del
[Design System](../design-system.md)

## Contexto

El Design System pide un nivel de movimiento que el sistema todavía no tenía:
transiciones compartidas entre tarjeta y detalle, el producto que vuela hacia
el carrito, hojas inferiores, toasts, esqueletos con brillo, progreso animado
del pedido y microinteracciones en cada acción.

La propuesta original de ese documento venía con un stack concreto:

- **Motion** (sucesor de Framer Motion) para la interfaz y `layoutId`
- **Rive** para una máquina de estados animada del pedido
- **Lottie** para ilustraciones de feedback

El ADR-11 ya había rechazado Framer Motion, pero por un caso distinto: en aquel
momento se pedía para efectos decorativos (spotlight, aurora, meteoros). Ahora
se pide para transiciones que **sí informan**, así que la decisión hay que
reabrirla con el caso nuevo en vez de citar la anterior.

## El costo, medido contra el usuario real

El perfil de uso no cambió: teléfono, datos móviles, caminando por el campus,
con un receso de veinte minutos. Sobre eso, el stack propuesto pesa
aproximadamente:

| Librería | Peso aprox. (gzip) | Para qué |
|---|---|---|
| Motion | ~110 KB | transiciones, layout, gestos |
| Rive (runtime) | ~150–200 KB | máquina de estados del pedido |
| Lottie | ~60 KB | ilustraciones de feedback |
| **Total** | **~320–370 KB** | |

Eso se paga en la primera carga, antes de ver un solo producto, y se paga otra
vez con cada despliegue nuevo porque cambia el hash del paquete.

## La pregunta correcta

No es *"¿queremos animaciones premium?"* — sí, queremos. Es:

> **¿Qué de todo esto NO se puede hacer con la plataforma?**

Y la respuesta, en 2026, es: casi nada.

| Efecto pedido | Plataforma | Costo |
|---|---|---|
| Transición compartida tarjeta → detalle | `view-transition-name` + View Transitions API | 0 KB |
| Transición entre páginas | `@view-transition { navigation: auto }` | 0 KB |
| Producto que vuela al carrito | Web Animations API sobre un clon | 0 KB |
| Contador que late | `element.animate()` | 0 KB |
| Entrada escalonada | `animation-delay` calculado | 0 KB |
| Hoja inferior, modal, toast | `<dialog>` + `@keyframes` | 0 KB |
| Esqueleto con brillo | gradiente animado | 0 KB |
| Progreso del pedido | `transition` sobre el ancho | 0 KB |
| Icono que cambia de significado | `morphicons` (ya adoptada, ~7 KB) | 0 KB nuevos |

`view-transition-name` es el equivalente nativo de `layoutId`, que era el
argumento principal a favor de Motion. Ya existía en el proyecto: el ADR-11 lo
usa para que la tarjeta de la cocina **viaje** de columna en vez de parpadear.

## Decisión

**El motion system se implementa con la plataforma.** No entra ninguna librería
de animación nueva.

Lo implementado vive en dos lugares:

- `src/lib/movimiento.ts` — `MOTION` (duraciones), `elementoCompartido`,
  `escalonado`, `pulso`, `volarAlCarrito`, `conTransicionDeVista`
- `src/app/globals.css` — `.hoja`, `.modal`, `.toast`, `.barra-carrito`,
  `.esqueleto-brillo`, y las reglas de `::view-transition`

Las duraciones son tokens (`--motion-rapido/normal/lento`) y se leen desde los
dos lados, para que una duración no exista en dos lugares con dos valores.

### Lo que se pierde, dicho sin adornos

- **Gestos de arrastre** con física (arrastrar una hoja para cerrarla con
  inercia). Se puede hacer con Pointer Events, pero cuesta bastante más código
  del que cuesta con Motion.
- **La máquina de estados animada de Rive.** El recorrido pedido → preparando →
  listo → recogido se resuelve hoy con la línea de progreso y el icono que se
  transforma; no con un personaje ilustrado que reacciona.
- **Ilustraciones de Lottie** para vacío, error y éxito. En su lugar hay SVG
  propios y el medidor de franja.

### Cuándo reabrir esto

Con un caso concreto, no con un catálogo — la misma regla que fijó el ADR-11.
Un motivo válido sería:

- una interacción que se probó con la plataforma y quedó demostrablemente peor
- una hoja inferior con arrastre que la gente intenta usar y no responde
- que Rive se cargue **solo** en la pantalla de retiro, con `import()`
  dinámico, y esa pantalla se abra una vez por pedido

Ese último caso es el más defendible de los tres, y es el que yo miraría
primero: la pantalla de "tu pedido está listo" es la que más se beneficia de
una animación con personalidad, se abre una sola vez, y su costo no se paga en
la carga inicial.

## Consecuencias

- Ninguna dependencia nueva. `package.json` sigue con una sola librería de UI
  (`morphicons`, MIT, ~7 KB), tal como lo dejó el ADR-11.
- El movimiento degrada correctamente: `prefers-reduced-motion` está respetado
  en CSS **y** en JavaScript, porque el CSS no puede tocar
  `element.animate()` ni una transición de vista.
- Las transiciones compartidas dependen de la View Transitions API, que no está
  en todos los navegadores. La ausencia se trata como el caso normal y no como
  un error: sin soporte, el cambio se aplica igual, sin animar.
- **La regla del ADR-11 sigue mandando**: el movimiento informa o no existe.
  Cada animación de este ADR tiene escrito en su comentario qué hecho comunica.
  `volarAlCarrito` existe porque el carrito está fuera del foco cuando alguien
  toca "+", no porque quede lindo.
