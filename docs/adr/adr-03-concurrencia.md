# ADR-03 — Bloqueo pesimista en la reserva de franja

**Estado:** aceptada · **Fecha:** 2026-08-24

## Contexto

Dos usuarios reservan el último espacio de una franja en el mismo instante. Si
ambos leen la carga antes de que cualquiera escriba, ambos concluyen que cabe y
la franja termina sobrevendida — el comercio no puede cumplir y el indicador 2
se desploma.

## Alternativas

| Opción | Descripción |
|---|---|
| Sin control | Leer, decidir, escribir |
| Bloqueo optimista | Versionado con reintento |
| **Bloqueo pesimista** | `SELECT … FOR UPDATE` dentro de la transacción |

## Criterios

Integridad ante reservas simultáneas · latencia · complejidad.

## Decisión

Bloqueo pesimista sobre las filas de franja candidatas, adquiridas en orden
determinista por `inicio`.

## Razones

Sin control **sobrevende de forma demostrable** — no es una hipótesis: está
implementado en `tests/control-negativo.test.ts` y falla el invariante bajo la
misma carga que la versión correcta sostiene.

El bloqueo optimista funcionaría, pero bajo contención alta (todos pidiendo para
las 12:00) degenera en una tormenta de reintentos justo en el momento de mayor
demanda, que es cuando el sistema tiene que responder bien.

El orden determinista de adquisición evita el deadlock: dos transacciones nunca
toman los mismos locks en orden distinto.

## Consecuencias

- La contención se serializa **por franja**: usuarios en franjas distintas no se
  bloquean entre sí
- La reverificación bajo el lock es la fuente de verdad, no el cálculo previo
- La cancelación necesita el mismo cuidado en espejo, más la bandera
  `capacidadLiberada` contra la doble liberación
- Verificado en `tests/concurrencia.test.ts` — indicador 9: cero sobreventas
