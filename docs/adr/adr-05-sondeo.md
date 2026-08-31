# ADR-05 — Sondeo periódico para la vista de cocina

**Estado:** aceptada · **Fecha:** 2026-08-24

## Contexto

La pantalla del comercio debe reflejar los pedidos entrantes sin que el operador
la refresque a mano.

## Alternativas

| Opción | Descripción |
|---|---|
| WebSocket | Conexión bidireccional persistente |
| SSE | Flujo unidireccional del servidor |
| **Sondeo 5 s** | `GET` periódico |

## Criterios

Suficiencia frente al requisito · complejidad operativa · tolerancia a la
reconexión en el WiFi del campus.

## Decisión

Sondeo cada 5 segundos.

## Razones

La cola tiene decenas de filas, no miles, y un retraso de 5 segundos es
irrelevante para una cocina cuyo ciclo de trabajo son minutos.

El WiFi del campus se corta. Una petición idempotente que se reintenta sola es
más robusta que una conexión persistente que hay que reconectar con backoff, y
no agrega infraestructura ni un canal que mantener.

Y hay una consecuencia de diseño concreta: ante un fallo de red la vista
**conserva la última cola conocida** con un aviso de desactualización, en vez de
vaciarse. Una pantalla en blanco en hora pico es peor que una desactualizada.

## Consecuencias

- Carga previsible: una consulta por operador cada 5 s
- Si el piloto revelara que 5 s es demasiado, el intervalo es un parámetro, no
  un cambio de arquitectura
