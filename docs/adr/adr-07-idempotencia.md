# ADR-07 — Idempotencia con clave provista por el cliente

**Estado:** aceptada · **Fecha:** 2026-08-24

## Contexto

El control transaccional (ADR-03) evita que dos usuarios sobrevendan una franja,
pero **no** evita que un mismo usuario cree dos pedidos: doble clic, o un
reintento después de que la respuesta se perdiera en una red mala. Son problemas
distintos y necesitan controles distintos.

## Alternativas

| Opción | Descripción |
|---|---|
| Nada | Confiar en que el usuario no toque dos veces |
| Deduplicación heurística | Rechazar pedidos "iguales" en una ventana de tiempo |
| Clave generada en el servidor | Un token por formulario |
| **`Idempotency-Key` del cliente** | UUID por intento de compra, `UNIQUE` en base |

## Criterios

Corrección ante reintentos · capacidad del cliente de reintentar con seguridad ·
falsos positivos.

## Decisión

Cabecera `Idempotency-Key` obligatoria, con restricción `UNIQUE` sobre
`pedido.idempotencyKey`.

## Razones

La deduplicación heurística produce falsos positivos: un estudiante que
legítimamente pide dos cafés iguales en dos minutos vería el segundo rechazado.

Exigir la clave al cliente —en vez de generarla en el servidor— es lo que
permite que el **reintento sea reconocible como tal**. El cliente fija la clave
una vez por intento de compra y la reutiliza en cada reintento, así que un
timeout deja de significar "no sé si llegó".

## Consecuencias

- Tres capas: camino rápido fuera de la transacción, relectura dentro, y el
  `UNIQUE` como última línea
- Ante colisión no se inspecciona la forma del error: se comprueba el **hecho**
  de que el pedido exista con esa clave
- **Un reintento nunca puede ser rechazado por una cuota** — ni por el tope de
  pedidos activos ni por el rate limit. Ambos casos aparecieron probando contra
  el servidor real y están cubiertos por pruebas de regresión
- Verificado en `tests/integridad.test.ts`
