# ADR-26: Entregar un pedido exige su código de retiro

**Estado:** aceptada (Norman, 2026-10-15, plan fase 8.0). **Fecha:** 2026-10-15. **Complementa:** ADR-09.

## Contexto
- La búsqueda y el escáner de cocina comparan el código solo en el cliente.
- El PATCH `/api/pedidos/[id]/estado` aceptaba RETIRADO con solo el id del pedido.
- Con varios pedidos en el mostrador, un toque en la tarjeta equivocada marcaba entregado el pedido de otro.

## Decisión
1. RETIRADO desde el comercio exige `codigo` en el cuerpo. Se compara con `mismoCodigo` (minúsculas, sin guion).
2. Sin código y sin declaración, el servidor responde 400 `CODIGO_REQUERIDO`. Con código ajeno, 403 `CODIGO_INCORRECTO`. El pedido no cambia.
3. Excepción: `sinCodigo: true`. Sirve cuando el estudiante no puede mostrar el código. El evento guarda la nota "Entregado sin verificar el código".
4. La búsqueda y el escáner de cocina envían el código leído. El botón de la tarjeta envía `sinCodigo`.
5. El ADMIN no opera pedidos (`puedeOperarPedido`), así que no tiene excepción.

## Consecuencias
- El historial distingue entregas verificadas de entregas declaradas sin código. El informe del piloto puede contarlas.
- El código de 6 caracteres (32^6, unas 1.07e9 combinaciones) no se acorta. Sin emojis.
- Revertir: quitar el bloque `RETIRADO` de la ruta de estado.
