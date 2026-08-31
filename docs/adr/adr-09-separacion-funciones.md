# ADR-09 — El administrador no opera la cocina

**Estado:** aceptada · **Fecha:** 2026-08-24

## Contexto

El rol ADMIN empezó con acceso total, incluida la vista de cocina y el cambio de
estado de cualquier pedido. Parecía cómodo. No lo es.

## Decisión

Solo el rol `COMERCIO` opera la cocina de su propio comercio. El `ADMIN`
observa el piloto y configura, pero **no puede** abrir el tablero de cocina ni
cambiar el estado operativo de un pedido.

## Razones

**Quien mide el piloto no debe producir los datos que mide.** El indicador 2 —
tasa de cumplimiento de la promesa — es el resultado central del trabajo, y se
calcula a partir de cuándo el comercio marcó un pedido como listo. Si el
investigador puede marcar pedidos, el dato deja de ser una observación y pasa a
ser, en el mejor caso, sospechoso. No hace falta mala fe: basta con "lo marqué
yo porque el operador estaba ocupado" para que el número ya no signifique lo que
la tesis dice que significa.

**Trazabilidad.** `evento_pedido.actorId` tiene que poder responder "¿quién dijo
que estaba listo?" con el operador real.

El costo es real y se acepta: para depurar un pedido en el piloto hay que entrar
con la cuenta del comercio. Es preferible a una métrica contaminada.

## Consecuencias

- `puedeOperarPedido` y `puedeVerCocina` exigen rol `COMERCIO` y comercio propio
- El enlace "Cocina" no aparece en la navegación del administrador
- `/cocina` sin comercio redirige al panel si quien entra es administrador
- El administrador conserva lectura completa: `puedeVerPedido` le sigue diciendo
  que sí, porque observar no contamina
- Verificado en `tests/identidad.test.ts`
