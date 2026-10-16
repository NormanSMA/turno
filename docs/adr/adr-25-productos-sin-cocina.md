# ADR-25: Productos sin cocina (tiempo 0) entran a pedidos anticipados

**Estado:** aceptada (Norman, 2026-10-15, plan fase 8.0). **Fecha:** 2026-10-15. **Ajusta:** ADR-02 (criterio de elegibilidad, §6.3).

## Contexto
- ADR-02 exige t(p) >= t_min para pedir por anticipado. Un producto casi instantáneo ocupaba una hora de retiro sin ahorrar tiempo.
- Resultado: bebidas frías y snacks envasados (t = 0) iban a "Solo en el mostrador" y no viajaban con la comida.
- En el receso con la cocina al tope, el estudiante no podía reservar ni una bebida junto con su almuerzo.

## Decisión
1. t = 0 significa "sin cocina". Es elegible aunque t_min sea mayor.
2. 0 < t < t_min sigue sin ser elegible. El argumento de ADR-02 aplica ahí: consume minutos y no ahorra tiempo.
3. Un pedido con carga 0 cabe en una franja abierta que no pasa del techo α·C. No suma carga. Si una franja quedó por encima del techo (por ejemplo, se redujo la capacidad), tampoco admite pedidos de carga 0: se mantiene el invariante de admisión.
4. Un pedido solo de t = 0 es válido. Decisión de Norman. Riesgo conocido: reserva una hora de retiro que no ahorra cola de cocina. Se mide en el piloto.
5. La regla vive en `tiempoElegible` (`src/core/admision.ts`). La usan el motor, el admin del comercio y el formulario de producto.

## Efecto en métricas
- `informe.ts` y `metricas.ts` no comparan tiempo real contra declarado: no dividen por el tiempo declarado.
- `cargaMin = 0` suma 0 minutos cocinados y cuenta como venta. Sin NaN ni Infinity (pruebas en `tests/informe.test.ts`).
- El simulador (`simulador.ts`) fijaba un tiempo real mínimo de 1 minuto. Con w = 0 ahora el tiempo real es 0.

## Consecuencias
- Cambia el texto "Solo en el mostrador": ahora aplica a 0 < t < t_min.
- Revertir: quitar la rama `t === 0` de `tiempoElegible` y de `cabeEnFranja`.
