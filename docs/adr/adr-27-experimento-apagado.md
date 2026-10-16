# ADR-27: El experimento A/B se apaga; todos operan como B

**Estado:** aceptada (Norman, 2026-10-15, plan fase 8.0). **Fecha:** 2026-10-15. **Ajusta:** §6.4 (condición experimental).

## Contexto
- TURNO dejó de ser tesis y va a un piloto comercial. El control A (elección libre) ya no sirve a ese objetivo.
- Los análisis de fricción piden preselección de franja con un toque para todos. Eso rompe el control A.
- La condición se guarda por usuario y por pedido (`condicion_experimental`).

## Decisión
1. Todos los usuarios nuevos reciben B (`asignarCondicion` devuelve `CONDICION_VIGENTE`).
2. Los usuarios que ya estaban en A operan como B: la sesión (`src/lib/auth.ts`) y la reserva (`src/core/reserva.ts`) usan `CONDICION_VIGENTE`.
3. Los pedidos nuevos guardan B. Los pedidos viejos conservan su condición original.
4. La columna, el simulador y las comparaciones A/B de `metricas` se conservan para leer los períodos anteriores. No se borra ningún dato.

## Consecuencias
- La comparación A/B del panel solo tiene datos hasta hoy. Después no hay grupo control.
- Para reactivar: restaurar `asignarCondicion` aleatoria y quitar los usos de `CONDICION_VIGENTE`.
- La preselección con un toque ya no necesita ramas para A.
