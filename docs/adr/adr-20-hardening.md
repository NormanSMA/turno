# ADR-20 — Concurrencia, retención y observabilidad para producción

**Estado:** aceptada · **Fecha:** 2026-09-01

## Contexto

Una auditoría de concurrencia, seguridad y operación —la tercera del proyecto,
después de la de producto (61 puntos) y la técnica (40)— señaló cinco
bloqueantes antes de cualquier despliegue, más una lista de mejoras de
rendimiento y gobernanza.

Los cinco se verificaron contra el código antes de tocar nada, y los cinco eran
reales. Tres de ellos comparten una propiedad incómoda: **solo se manifiestan
con varios usuarios a la vez**, es decir, el día del despliegue y no antes. Un
cuarto —la zona horaria— no se manifiesta nunca en local, porque la máquina de
desarrollo está en Managua.

Este ADR registra las decisiones que se tomaron al cerrarlos, incluidas las dos
en las que el plan de la auditoría se siguió solo en parte.

## Decisiones

### 1. El bloqueo pesimista es el único modelo de concurrencia del sistema

`actualizarParametros` leía las franjas, validaba y escribía sin locks, así que
una reserva concurrente podía romper el invariante `carga(f) ≤ α · C(f)` desde
el panel de administración.

La auditoría proponía resolverlo con `isolationLevel: "Serializable"`.
**Se descartó.**

`core/reserva.ts` ya resuelve exactamente esta clase de conflicto con bloqueo
pesimista (ADR-03), tras haber evaluado y descartado el optimista. Introducir
`Serializable` significaría dos modelos de concurrencia distintos sobre las
mismas tablas, y traería una clase de error nueva: `serialization_failure`, que
Postgres lanza al abortar y que **hay que reintentar explícitamente**. Sin ese
reintento, el panel falla de forma intermitente y sin explicación — un modo de
fallo peor que el que se venía a corregir.

Se usa `FOR UPDATE` con **un orden de bloqueo global**: primero la entidad
raíz (usuario en la reserva, comercio en la administración) y después las
franjas, siempre por `inicio` ascendente. Ese orden constante es lo que evita
el abrazo mortal entre las dos operaciones, que compiten por las mismas filas.

Una lectura fantasma no rompe nada acá: una franja creada durante la
transacción nace con carga cero y por definición no está sobrevendida.

### 2. El reloj se lee dentro de la sección crítica, no al entrar

El cut-off —la regla que dice "ya no da tiempo de cocinarlo"— se evaluaba con
la hora capturada ochenta líneas antes de abrir la transacción. Si la
transacción esperaba por un lock, decidía con un reloj atrasado y admitía
pedidos que el propio sistema considera imposibles.

**Regla general:** una decisión que depende del tiempo se toma con la hora del
momento en que se dispone de los datos, no con la del momento en que se recibió
la petición.

El reloj inyectable se conserva: cuando `solicitud.ahora` viene dado se
respeta, porque es lo que hace verificables las reglas temporales y de ello
dependen las pruebas y el simulador. Solo se toma el reloj real cuando nadie
dijo qué hora es.

### 3. La bandeja de salida se reclama cambiando el estado, no con un lock

Dos ejecuciones del cron leían las mismas filas `PENDIENTE` y enviaban el mismo
aviso dos veces. Medido antes del arreglo: **16 envíos para 8 notificaciones**.

La auditoría proponía `SELECT … FOR UPDATE SKIP LOCKED`. **No funciona tal
cual**: un lock de Postgres vive mientras vive su transacción, y el envío es
una llamada de red que puede tardar segundos. Mantener la transacción abierta
durante todo el envío ocupa una conexión por worker y cambia un problema de
duplicación por uno de agotamiento del pool.

El reclamo se hace en un único statement que **cambia el estado** a `ENVIANDO`,
con `SKIP LOCKED` para que dos ejecuciones se repartan el trabajo en vez de
que la segunda espere a la primera. La exclusión sobrevive al commit, que es lo
que hacía falta.

Como un proceso puede morir entre el reclamo y la marca final, `reclamadaEn`
permite retomar lo que quede atascado pasados diez minutos. La garantía
resultante es **al menos una vez**, no exactamente una: si un worker envía y
muere antes de marcar, se reintentará. Exactamente-una exigiría idempotencia
del lado del proveedor, que no existe. Duplicar en ese caso raro es preferible
a perder el aviso, que es el fallo que de verdad le importa al estudiante.

### 4. Las horas de operación son de Managua, no del servidor

`new Date("2026-09-01T08:00:00")` y `setHours()` interpretan la hora en la zona
del proceso. En una plataforma que corre en UTC, las 08:00 que escribe el
operador se guardan como las 02:00 y el sistema genera las franjas de un
semestre entero seis horas corridas, **sin lanzar un solo error**.

`core/hora-local.ts` resuelve la hora de pared midiendo el desfase con `Intl`
en lugar de escribir el `+6` a mano. Nicaragua no usa horario de verano desde
2007, así que hoy son seis horas fijas — pero eso es una política, no una ley
física, y hardcodearla obligaría a recordar ese archivo el día que cambie.

La suite corre en verde con `TZ=UTC`, que es donde el defecto se manifestaba y
donde nunca se había probado.

### 5. Las métricas del piloto siguen calculándose sobre datos crudos

El endpoint del panel traía todos los pedidos con todas sus columnas. La
auditoría pedía reescribirlo con agregación SQL. **Se hizo solo en parte.**

`core/metricas` son funciones puras y auditables que trabajan pedido por
pedido, y el panel exporta el CSV crudo justo para que un tercero pueda rehacer
las cuentas. Convertirlas en agregados de SQL las volvería imposibles de
verificar con una prueba, que es precisamente lo que las hace defendibles en el
Capítulo V.

Lo que sí sobraba eran las columnas. Con un `select` explícito, medido sobre el
mes de datos de demostración: **1273 KB y 173 ms → 552 KB y 73 ms**.

### 6. No se agrega el índice `(comercioId, fin)`

La auditoría lo proponía como mejora de rendimiento. Se midió con `EXPLAIN`
sobre 50 000 franjas sintéticas: **el planificador lo ignora** y sigue usando
el `@@unique([comercioId, inicio])` que ya existe, porque ese también sirve
para el `ORDER BY inicio`. 2.329 ms con índice contra 2.305 ms sin él.

Agregarlo solo costaría escrituras más lentas en una tabla que se actualiza en
cada reserva. Es la misma lección que el schema ya tenía escrita: hubo un
índice redundante que hubo que quitar.

### 7. Se purga lo operativo; la evidencia del piloto se conserva

La política de retención distingue dos cosas que la auditoría trataba igual:

- **Operativo** (sesiones, tokens, contadores de límite, notificaciones ya
  resueltas de más de 90 días): se purga. No aporta al análisis y aumenta lo
  que se pierde en una filtración.
- **Evidencia** (`pedido`, `evento_pedido`): **no se purga**, aunque sean las
  tablas que más pesan. Sobre ellas se calculan la comparación A/B, el
  cumplimiento por día y la carga por franja.

A 12 MB por mes de piloto contra los 512 MB del plan gratuito, el techo llega
en algo más de un año. Cuando apriete, lo que corresponde es **archivar fuera
de la base, no eliminar**. Hay una prueba que falla si alguien agrega esa
purga.

### 8. Un identificador por petición, y nada personal en los registros

Los errores salían como `console.error`, que se lee bien en una terminal y no
sirve para nada más: no se puede filtrar por ruta, agrupar por tipo ni seguir
una petición entre miles.

`lib/registro.ts` emite una línea JSON por hecho. El `peticionId` se genera una
vez en el middleware, viaja en la cabecera y vuelve al cliente en
`x-request-id`, así que quien reporta un fallo puede dar un identificador que
alcanza para encontrar la traza.

Del error se guardan tipo, mensaje y una pila recortada — **no el objeto
entero**, que en el caso de Prisma trae la consulta con sus parámetros, y ahí
van correos y códigos de retiro. Este proyecto ya tuvo un hallazgo por imprimir
un enlace mágico completo (T-24); la regla que dejó es que al registro va lo
que describe el hecho, no lo que identifica a la persona.

Las rutas se agrupan por forma (`/api/pedidos/:id`): sin eso, cada pedido
produce su propia "ruta" y agrupar deja de servir.

## Consecuencias

- Toda operación que compare capacidad contra carga tiene que tomar los locks
  en el orden establecido. Añadir una tercera operación sobre `franja` sin
  respetarlo reintroduce el riesgo de abrazo mortal.
- El enum `EstadoNotificacion` gana `ENVIANDO`. Cualquier consulta que asuma
  tres estados tiene que contemplar el cuarto.
- Las pruebas de concurrencia **provocan** la carrera reteniendo la fila desde
  otra transacción, en vez de lanzar operaciones en paralelo y confiar en el
  planificador. Una prueba que pasa casi siempre y falla un martes no sirve
  como red de seguridad.
- Queda pendiente y **anotado como observación**: las páginas protegidas
  responden `200` con un mensaje de rechazo en lugar de `403`. La protección
  funciona —el contenido no se sirve— pero el código de estado dice "todo
  bien", y eso lo consumen monitores, cachés y rastreadores.

## Lo que no se hizo, y por qué

- **Alertas a PagerDuty o Slack** (punto 15 del plan): un sistema que no está
  desplegado no tiene a quién despertar. El registro estructurado es el
  prerrequisito y ya está; la alerta se configura cuando exista un entorno que
  vigilar.
- **Vistas materializadas para KPIs** (punto 13): la medición dice que el
  cuello no está ahí. Con 1374 pedidos el panel responde en decenas de
  milisegundos, y una vista materializada añade un estado que hay que refrescar
  y que puede quedar viejo.
- **Migrar imágenes a S3/R2** (punto 12): `foto_producto` ocupa 96 kB. Es una
  optimización correcta para otro volumen, no para éste.
