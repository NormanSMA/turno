# ADR-21 — La capacidad de cocina es un flujo, no una casilla por franja

**Estado:** aceptada · **Fecha:** 2026-09-01 · **Revisa:** [ADR-02](adr-02-minutos-cocina.md)

## Contexto

El ADR-02 decidió medir la capacidad en minutos-cocina, y eso sigue siendo
correcto. Lo que no decidió —y quedó incrustado en el código sin declararse— es
**en qué ventana de tiempo se produce ese trabajo**.

La generación de franjas lo fijó así:

```
capacidadMinutos = personalCocina × anchoFranjaMin
```

Esa fórmula afirma que el trabajo de un pedido ocurre dentro de su ventana de
retiro. Nadie lo escribió como supuesto y no aparece en la lista de supuestos
declarados del ADR-02, pero es la consecuencia de la fórmula.

Es falso justo en el caso que le da sentido al producto. Un pedido hecho a las
12:00 para retirar a las 12:45 le da a la cocina cuarenta y cinco minutos; el
modelo le reconocía los quince de la franja. Con un cocinero y franjas de
quince minutos, eso admite **una** pizza — no porque la cocina no pueda hacer
más, sino porque el modelo miraba la ventana equivocada.

El efecto es doble y va en contra de los dos lados del sistema: el comercio
vende menos de lo que puede producir, y al estudiante le aparece "sin espacio"
en una franja donde sí había.

## Alternativas

| Opción | Descripción |
|---|---|
| Exponer `capacidadMinutos` | Dejar que el comercio suba a mano la capacidad de cada franja |
| Producción anticipada | La capacidad se consume del tiempo disponible hasta el retiro |
| **Flujo + despacho** | Dos restricciones separadas: cocina acumulada y mostrador por franja |

## Criterios

Que no se prometa lo incumplible · que no se rechace lo que sí cabe ·
exactitud demostrable · costo de calibración para el comercio.

## Decisión

**Flujo + despacho**: separar las dos restricciones que el modelo anterior
cobraba con un solo número.

1. **Cocina — acumulada en el tiempo.** Para cada franja `d`, todo el trabajo
   que vence en `d` o antes tiene que caber en el tiempo disponible hasta `d`:

   ```
   ∀ d:   Σ  cocina(i)   ≤   personalCocina · (d − ahora) · α
        i: fin(i) ≤ d
   ```

2. **Mostrador — local a la franja.** Lo que sí es una restricción de la ventana
   de retiro: cuánta gente se puede atender.

   ```
   Σ despacho(i)  ≤  personalMostrador · Δ · α
   ```

Cada producto pasa a declarar dos tiempos: lo que tarda cocinarse y lo que
ocupa entregarlo. Un almuerzo ya preparado son 5 minutos de cocina y 2 de
mostrador; una pizza, 15 y 2.

## Razones

**La regla acumulada es exacta, no una heurística.** Es la condición de
factibilidad conocida para un conjunto de trabajos con fechas límite sobre una
máquina de velocidad constante: el conjunto es realizable si y solo si la
desigualdad se cumple para todos los límites. No hace falta decidir en qué
orden cocina nadie — si se cumple, existe un orden que cumple todos los pedidos
(cocinar siempre lo que vence antes); si falla para algún límite, ningún orden
los cumple. Por eso el módulo decide en vez de planificar.

**Comprobar solo la franja pedida no alcanza**, y es el error fácil. Un pedido
para las 13:00 puede caber mirando las 13:00 y aun así robarle a la cocina el
tiempo que ya tenía apalabrado otro que vence a las 12:30. El recorrido va
sobre todos los límites, no sobre uno.

**Separar el mostrador evita el efecto contrario.** Sin esa segunda
restricción, la cocina podría comprometer doce almuerzos para la misma ventana
de quince minutos: la comida estaría lista y la fila sería imposible.

Se descartó **exponer `capacidadMinutos`** porque deja el supuesto equivocado
como valor por defecto y traslada al comercio un cálculo que el sistema puede
hacer bien. Sirve como válvula, no como modelo.

## Consecuencias

- `Producto` gana `minutosDespacho`; `Comercio` gana `personalMostrador`
- `Franja.cargaAsignada` se desdobla en carga de cocina y carga de mostrador
- `Franja.capacidadMinutos` deja de gobernar la admisión de cocina; queda como
  tope manual opcional
- La capacidad ofrecida **depende del momento en que se consulta**: la misma
  franja ofrece más a quien pide con anticipación. Es el incentivo que el
  producto quería y que el modelo anterior anulaba
- **Supuesto declarado:** no se modela la frescura. El modelo permite adelantar
  el trabajo tanto como haya tiempo. Si hace falta forzar que algo no se
  prepare con demasiada antelación, es un límite inferior por producto, no un
  cambio de esta regla
- **Supuesto heredado del ADR-02:** trabajo divisible entre el personal. Sigue
  fallando con un recurso físico único, como una sola plancha
- Verificado en `tests/capacidad.test.ts`, incluidas dos pruebas de propiedad
  contra una implementación independiente de la regla. Las comprobaciones se
  validaron rompiendo la lógica a propósito y confirmando que fallan
