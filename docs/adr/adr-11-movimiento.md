# ADR-11 — Movimiento con la plataforma; una sola librería de UI

**Estado:** aceptada · **Fecha:** 2026-08-24 · **Afecta:** cocina, línea de tiempo, panel de indicadores

## Contexto

Se pidió elevar el nivel de la interfaz y se propusieron cuatro fuentes de
componentes y animación. Hasta ese momento `package.json` no tenía ninguna
dependencia de UI: todo el diseño era CSS y SVG propios.

Dos restricciones que no son negociables acá:

1. **El código de esta tesis es un artefacto de evidencia.** Un tribunal tiene
   que poder clonar el repositorio y reproducir el sistema. Toda dependencia
   debe tener procedencia verificable y licencia declarada.
2. **El perfil de uso es teléfono, datos móviles, caminando por el campus.**
   Cada kilobyte de JavaScript se paga con el usuario esperando.

## Alternativas

| Fuente | Licencia | Distribución | Peso | Veredicto |
|---|---|---|---|---|
| morphicons 1.7.0 | MIT | npm, cero dependencias de ejecución | ~7 KB gzip | **Adoptada**, en un punto |
| thinking-orbs 0.3.1 | MIT | npm, cero dependencias | ~55 KB sin comprimir | Descartada |
| Aceternity UI | no declarada | copiar y pegar | exige Framer Motion (~110 KB gzip) | Descartada |
| animmasterlib.dev | **no declarada** | **Google Drive, de pago** | desconocido | **Descartada** |
| La plataforma (View Transitions, rAF, CSS) | — | ninguna | 0 | **Adoptada** para el resto |

## Decisión

Se adopta **morphicons** en un solo lugar y se construye todo lo demás con la
plataforma.

### Por qué se descartaron las otras tres

**animmasterlib** es la exclusión importante, y el motivo no es estético: se
distribuye por un enlace de Google Drive, sin repositorio público, sin licencia
publicada y sin registro en npm. Su procedencia no se puede verificar ni
auditar, y sin licencia declarada no se puede redistribuir junto con el
trabajo. Eso rompe la restricción 1 de forma directa.

**Aceternity** obliga a Framer Motion para efectos mayormente decorativos
(spotlight, aurora, meteoros). Rompe la restricción 2 sin contrapartida.

**thinking-orbs** está bien construida, pero su vocabulario de estados
(*working, searching, solving, listening, composing, shaping*) es el de una
interfaz conversacional de IA. Los estados de TURNO son `RECIBIDO`,
`EN_PREPARACION`, `LISTO`, `ENTREGADO`, y ya se comunican por columna, color y
código. Un orbe ahí competiría con la lectura rápida que la cocina necesita.

### Por qué morphicons sí, y por qué en un solo lugar

Su aporte no son los iconos: `MorphIcon` acepta un atributo `d` crudo, así que
el sistema conserva sus propios trazos de 24×24 y no adopta ninguna familia de
iconos. El aporte es la **interpolación entre dos formas por análisis de
Procrustes**, y eso paga exactamente donde un icono cambia de significado en su
sitio.

Ese lugar es el botón de avance del tablero de cocina (`IconoEstado`): al
apuntarlo, el icono del estado actual se transforma en el del destino —
reloj → llama → campana → palomita. Es una vista previa del resultado antes de
comprometerlo, en un tablero donde el toque es irreversible.

**No** se usa en la navegación: ahí los iconos son constantes y un `<path>`
suelto pesa menos y hace lo mismo.

### Lo demás, sin dependencias (`src/lib/movimiento.ts`)

- **View Transition API** — la tarjeta viaja de columna en vez de parpadear.
  Necesita `view-transition-name` estable por tarjeta (el id del pedido) y
  `flushSync` dentro del callback, porque el navegador captura el "después"
  apenas éste retorna.
- **`NumeroAnimado`** — conteo de cifras, solo en el panel de indicadores. En
  cocina y en el pedido los números son operativos y uno que se mueve mientras
  se lee con prisa estorba. Arranca en el valor final, así el HTML del servidor
  ya trae el dato correcto aunque el JavaScript nunca llegue.
- **`.traza` / `.traza-palomita`** — el trazo que se dibuja en la línea de
  tiempo, escalonado de arriba hacia abajo, que es el orden en que el pedido
  recorrió los pasos.

`prefers-reduced-motion` se respeta **en JavaScript además de en CSS**: el
bloque de `globals.css` acorta transiciones declarativas pero no puede tocar un
bucle de `requestAnimationFrame` ni una transición de vista. Todo degrada al
resultado final instantáneo, que es la degradación correcta — se ve el estado
nuevo, sin el viaje.

## Consecuencias

- Una dependencia de UI, MIT, sin dependencias de ejecución propias.
- Ninguna animación depende de una librería de animación.
- Queda una regla explícita para lo que venga: **el movimiento informa o no
  existe**. Durante esta misma implementación la regla obligó a corregir la
  primera versión, que ataba la transformación al tiempo de espera de la
  petición: medida en el navegador, esa espera duraba ~50 ms y la animación no
  se llegaba a ver nunca. Era adorno con coartada. Se reancló al puntero.
- El costo: los efectos de Aceternity y animmasterlib no están disponibles. Si
  alguno hiciera falta más adelante, habría que reabrir esta decisión con un
  caso concreto — no con un catálogo.
