# ADR-10 — El simulador reutiliza el núcleo real, en TypeScript

**Estado:** aceptada · **Fecha:** 2026-08-24 · **Implementa:** §15 del documento maestro

## Contexto

El piloto es pequeño y no se puede experimentar con un negocio real: no se puede
probar qué pasa con 500 usuarios, ni comparar cuatro anchos de franja, ni
saturar deliberadamente al comercio. La simulación sola tampoco vale — sin
validez externa es un juguete. Las dos juntas sí.

El documento maestro proponía **SimPy** (Python).

## Alternativas

| Opción | Descripción |
|---|---|
| SimPy en Python | Lo previsto; biblioteca estándar de DES |
| Simulador propio en Python | Reimplementar la regla de admisión |
| **Simulador en TypeScript sobre el núcleo real** | Importar `core/admision.ts` |

## Decisión

Simulador en TypeScript que **importa el mismo módulo de admisión que la
reserva de producción**, y no una copia.

## Razones

La razón es una y decide sola: **si el simulador tuviera su propia
implementación de la regla, sus resultados no dirían nada sobre el sistema.**
Dirían algo sobre una segunda implementación que se le parece. Y las dos
divergirían — no en la primera semana, sino cuando alguien ajuste el cut-off en
un lado y olvide el otro. Entonces el capítulo de recomendaciones estaría
sustentado en un modelo de un sistema que ya no existe.

Por eso `core/admision.ts` es puro y recibe el reloj por parámetro: no es
elegancia, es lo que permite que `calcularOpcionesConCutoff` corra igual dentro
de una transacción de PostgreSQL que dentro de un bucle de simulación.

El costo es real: se pierde el ecosistema de SimPy (colas, recursos, estadística
integrada) y hay que escribir el motor de eventos. Para este modelo —franjas
discretas, una cocina, sin colas anidadas— ese motor son cincuenta líneas.

## Modelo de cumplimiento: dos errores descartados

El comportamiento del simulador se validó contra lo que la teoría predice, y
dos modelos plausibles quedaron descartados porque contradecían §6.2:

**Exigir que cada pedido se cocine dentro de los Δ minutos de su propia
franja.** Absurdo: la franja es la ventana de RETIRO, no la de cocción. Un plato
de 12 minutos nunca cumpliría en una franja de 10, y toda la tesis se apoya en
que la preparación ocurre antes, superpuesta con la clase.

**Dejar que la cocina trabaje con toda la anticipación que quiera.** Con eso α
deja de ser vinculante: si el sistema compromete α · C(f) y la cocina dispone de
C(f) por franja más un arranque libre, el trabajo siempre entra y el modelo
reporta 100% de cumplimiento para cualquier α — lo contrario de lo que §6.2
afirma.

El modelo que quedó: durante cada franja la cocina dispone de
`personal × Δ` minutos de trabajo, y lo que no alcanza a terminar se **arrastra**
a la siguiente. El incumplimiento tiene entonces una causa identificable: la
carga REAL superó la capacidad de reloj aunque la ESTIMADA cupiera bajo α. Esa
brecha es exactamente lo que α existe para absorber.

## Una trampa de interpretación que el código evita

Definir el techo de volumen como "el mayor número de INTENTOS con cumplimiento
≥ 90%" da un resultado alto y falso. El control de admisión mantiene el
cumplimiento **rechazando**: con 240 intentos diarios sigue cumpliendo el 97%,
porque admite el 14%. Decir "sostiene 240 pedidos diarios" sería mentir.

`volumenSostenible` devuelve pedidos **servidos** por día, la demanda a la que
se alcanza ese techo y la tasa de rechazo en ese punto. La conclusión honesta es
"sirve hasta N; por encima de M intentos rechaza el X%, y servir más exige
capacidad, no un α más alto".

## Consecuencias

- Una sola implementación de la regla de admisión en todo el proyecto
- Aleatoriedad reproducible por semilla: un experimento que no se repite no es
  un experimento
- `npm run simular -- --calibrar` toma t(p), personal, Δ, α y demanda observados
  de la base; los pesos de cada producto salen de cuántas veces se pidió
- `adherenciaB` y `variabilidadCocina` siguen siendo **supuestos declarados**
  hasta que el piloto los mida. Están marcados como tales en el código
- Verificado en `tests/simulador.test.ts`, incluidos los controles negativos:
  sin variabilidad α = 1 cumple, y con adherencia nula B se comporta como A
