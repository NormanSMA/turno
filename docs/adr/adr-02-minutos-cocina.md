# ADR-02 — La capacidad se mide en minutos-cocina

**Estado:** aceptada · **Fecha:** 2026-08-24

## Contexto

Hay que decidir cuántos pedidos admite una franja de retiro sin incumplir la
hora prometida.

## Alternativas

| Opción | Descripción |
|---|---|
| Sin límite | Aceptar todo lo que llegue |
| Conteo de pedidos | N pedidos por franja |
| **Minutos-cocina** | C(f) = personal × Δ; cada pedido cuesta w(i) = Σ t(p) |

## Criterios

Precisión de la promesa · riesgo de incumplimiento · complejidad de medición.

## Decisión

Minutos-cocina.

## Razones

El tiempo de preparación **no es uniforme**. Diez cafés de 3 minutos son 30
minutos de cocina; diez almuerzos de 12 son 120. Un contador de pedidos trata
ambos casos como "diez" y produce promesas incumplibles en el segundo.

Sin límite no es una opción: concentraría la demanda en vez de distribuirla, que
es exactamente el problema que el sistema existe para resolver.

El costo de la opción elegida es que exige **medir t(p) con cronómetro** sobre la
preparación real. Ese costo es la fase 1 de calibración, y produce además un
parámetro que el simulador necesita.

## Consecuencias

- `producto.tiempoPreparacionMin` es un dato medido, no estimado
- El paralelismo de la cocina se modela en C(f), no en w(i): ambos lados de la
  desigualdad están en la misma unidad de trabajo
- **Supuesto declarado:** el trabajo se asume divisible y transferible entre el
  personal. Falla si hay un recurso físico único, como una sola plancha
- Verificado en `tests/admision.test.ts`
