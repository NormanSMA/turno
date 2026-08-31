# Matriz de requisitos

> Apartado 4.x de la tesis. El error 03 del instructivo es una lista de viñetas
> sin criterio de aceptación; lo que separa un 70 de un 90 es que cada requisito
> tenga **origen, prioridad, criterio medible y caso de prueba que lo verifica**.
>
> La columna **Verificación** apunta a código que se ejecuta con `npm test`. No
> es una promesa de que está probado: es la ruta al archivo donde se comprueba.

Prioridad: **A** = sin esto el piloto no existe · **B** = degrada la evaluación ·
**C** = mejora la operación.

## Requisitos funcionales

| ID | Requisito | Origen | Pri | Criterio de aceptación | Verificación |
|---|---|---|---|---|---|
| RF-01 | Un usuario con correo institucional obtiene acceso sin contraseña | §11.2 | A | Un enlace enviado a `@uam.edu.ni` o `@uamv.edu.ni` crea sesión; otros dominios se rechazan | `tests/identidad.test.ts` |
| RF-02 | El enlace de acceso sirve una sola vez y vence a los 15 min | §11.2 | A | Un segundo canje del mismo enlace falla; un enlace vencido falla | `tests/auth.test.ts` |
| RF-03 | La sesión dura entre 60 y 90 días | §11.3 | B | La fricción del enlace ocurre una vez en todo el piloto | `tests/identidad.test.ts` |
| RF-04 | El menú se ve sin iniciar sesión | §11.3 | B | `GET /api/comercios/:slug/menu` responde 200 sin cookie | verificado end-to-end |
| RF-05 | El comercio marca qué productos admiten pedido anticipado | §6.3 | A | Un producto no marcado no puede pedirse por anticipado | `tests/admision.test.ts` |
| RF-06 | Solo son elegibles los productos con t(p) ≥ t_mín | §6.3 | A | Un producto por debajo del umbral se rechaza aunque esté marcado | `tests/admision.test.ts` |
| RF-07 | El usuario elige una franja de retiro entre las disponibles | §8.1 | A | Se ofrecen únicamente franjas con espacio y alcanzables | `tests/admision.test.ts` |
| RF-08 | **El sistema admite el pedido solo si cabe en la franja** | §6.1 | A | `carga(f) + w(i) ≤ α · C(f)`, verificado bajo el lock | `tests/concurrencia.test.ts` |
| RF-09 | Si no cabe, el sistema propone alternativas en vez de rechazar | §6.1 | A | Todo rechazo por capacidad devuelve al menos una franja alternativa | `tests/concurrencia.test.ts` |
| RF-10 | La condición B destaca la franja que mejor reparte la carga | §6.4 | A | En B se sugiere la de menor ocupación; en A no se orienta la elección | `tests/admision.test.ts` |
| RF-11 | La condición experimental se asigna al azar y no cambia nunca | §6.4 | A | Reentrar no altera la condición del usuario | `tests/auth.test.ts` |
| RF-12 | El pedido recorre recibido → en preparación → listo → retirado | §8.1 | A | Toda transición fuera del grafo se rechaza con 409 | `tests/estados.test.ts` |
| RF-13 | El usuario puede cancelar mientras la cocina no empezó | auditoría §3 | B | Cancelar en RECIBIDO libera la capacidad; en preparación lo rechaza | `tests/integridad.test.ts` |
| RF-14 | La capacidad liberada vuelve a estar disponible | auditoría §3 | A | Tras cancelar, otro usuario puede tomar ese lugar | `tests/integridad.test.ts` |
| RF-15 | El comercio ve su cola de trabajo separada por estado | §8.1 | A | Tres columnas: en espera, en cocina, esperando retiro | verificado end-to-end |
| RF-16 | La cola se actualiza sin intervención del operador | ADR-05 | B | Sondeo cada 5 s; ante fallo de red conserva la última cola conocida | verificado end-to-end |
| RF-17 | El usuario recibe aviso al confirmar y al estar listo | §8.1 | B | Se encola una notificación de cada tipo, sin duplicados | `tests/integridad.test.ts` |
| RF-18 | El comercio administra su catálogo, sus horas y sus parámetros | §8.1 | B | Cambios aplicados y registrados en auditoría | `tests/administracion.test.ts` |
| RF-19 | El comercio puede pausar la recepción de pedidos | auditoría §18 | B | Pausado rechaza pedidos nuevos y conserva los comprometidos | `tests/integridad.test.ts` |
| RF-20 | El sistema registra las métricas de los nueve indicadores | §12 | A | Los campos de instrumentación se escriben en la misma transacción | `tests/concurrencia.test.ts` |
| RF-21 | El administrador consulta indicadores y exporta datos crudos | §8.1 | A | Panel con A/B y CSV reproducible por un tercero | `tests/metricas.test.ts` |
| RF-22 | Cada canal de captación tiene su propio QR rastreable | §14.4 | B | El canal viaja del cartel al usuario y al pedido | verificado end-to-end |
| RF-23 | Se recoge usabilidad con SUS y micro-encuesta tras el retiro | §14.6 | B | SUS de 10 ítems; la micro solo aparece con el pedido retirado | `tests/encuestas.test.ts` |
| RF-24 | Un pedido listo y no retirado pasa a no-show | §30 auditoría | B | A los N minutos de `listoEn`, con barrido idempotente | `tests/integridad.test.ts` |

## Requisitos no funcionales

| ID | Requisito | Origen | Pri | Criterio de aceptación | Verificación |
|---|---|---|---|---|---|
| RNF-01 | **Cero sobreventas bajo reservas simultáneas** | Ind. 9 | A | N reservas concurrentes sobre la última plaza: `cargaAsignada ≤ α·C(f)` siempre | `tests/concurrencia.test.ts` |
| RNF-02 | El control de concurrencia es necesario, no decorativo | Ind. 9 | A | La implementación ingenua **sí** sobrevende bajo la misma carga | `tests/control-negativo.test.ts` |
| RNF-03 | Un reintento del cliente no duplica el pedido | auditoría §2 | A | 10 POST con la misma `Idempotency-Key` crean un pedido | `tests/integridad.test.ts` |
| RNF-04 | Un reintento nunca se rechaza por cuota | hallazgo propio | A | Ni por tope de pedidos activos ni por rate limit | `tests/integridad.test.ts` |
| RNF-05 | Un producto agotado no entra por una ventana de carrera | auditoría §5 | A | Los productos se releen dentro de la transacción | `tests/integridad.test.ts` |
| RNF-06 | El histórico del pedido no cambia si cambia el catálogo | auditoría §4 | A | Nombre, precio y t(p) quedan copiados en el ítem | `tests/integridad.test.ts` |
| RNF-07 | Una cancelación doble no libera capacidad dos veces | hallazgo propio | A | 8 cancelaciones simultáneas: una prospera, carga final correcta | `tests/integridad.test.ts` |
| RNF-08 | **P95 de respuesta ≤ 2 s bajo carga** | Ind. 8 | A | Medido por endpoint, con cero errores 5xx | `npm run carga` |
| RNF-09 | Nadie lee ni opera el pedido de otro | auditoría §9 | A | 403 igual para pedido ajeno e inexistente | `tests/identidad.test.ts` |
| RNF-10 | El administrador no opera la cocina | ADR-09 | A | Quien mide el piloto no produce el dato que mide | `tests/identidad.test.ts` |
| RNF-11 | El servidor recalcula precio y carga; nunca confía en el cliente | auditoría §10 | A | El cuerpo solo lleva IDs y cantidades | `src/lib/esquemas.ts` |
| RNF-12 | Las contraseñas no se pueden recuperar desde la base | ADR-08 | A | scrypt con sal por usuario y coste versionado | `tests/credenciales.test.ts` |
| RNF-13 | No se puede enumerar qué correos son cuentas de operación | ADR-08 | B | Mismo 401 y mismo tiempo de respuesta con hash señuelo | `src/lib/auth.ts` |
| RNF-14 | El abuso del correo transaccional está limitado | auditoría §8 | A | Límite por buzón y por IP, correcto bajo concurrencia | `tests/auth.test.ts` |
| RNF-15 | Ningún destino externo tras el inicio de sesión | hallazgo propio | A | `volver` solo acepta rutas relativas de este sitio | `tests/rutas.test.ts` |
| RNF-16 | La creación del pedido no depende de que el correo salga | auditoría §13 | A | Bandeja de salida con reintento y sin duplicados | `src/lib/correo.ts` |
| RNF-17 | Toda marca de tiempo lleva zona horaria | auditoría §16 | A | 21 columnas `timestamptz`, cero sin zona | migración `init` |
| RNF-18 | Configurar el comercio no puede romper el invariante | hallazgo propio | A | Bajar α o la capacidad se rechaza si dejaría franjas sobrevendidas | `tests/administracion.test.ts` |
| RNF-19 | Todo cambio de configuración queda auditado | §16.2 | B | Quién, qué y cuándo en `auditoria_admin` | `src/lib/comercio.ts` |
| RNF-20 | El sistema se puede monitorear en el piloto | Riesgo 8 | B | `/api/salud` consulta la base de verdad | verificado end-to-end |
| RNF-21 | La interfaz funciona en el teléfono de un estudiante | ADR-01 | A | Sin desbordamiento horizontal; navegación al alcance del pulgar | verificado end-to-end |
| RNF-22 | El foco es visible y el movimiento respeta la preferencia | accesibilidad | B | `:focus-visible` en todo control; `prefers-reduced-motion` | `src/app/globals.css` |
| RNF-23 | El simulador y el sistema comparten una sola regla | ADR-10 | A | El simulador importa `core/admision.ts` | `tests/simulador.test.ts` |

## Trazabilidad con los objetivos específicos

| OE | Qué exige | Requisitos |
|---|---|---|
| OE-2 · Especificar | Matriz con criterios medibles | esta tabla |
| OE-3 · Diseñar | Modelo de admisión, arquitectura, seguridad | RF-05 a RF-11, RNF-01 a RNF-07, los 10 ADR |
| OE-4 · Implementar y probar | Producto funcional y matriz ejecutada | todos, con `npm test` |
| OE-5 · Evaluar | Instrumentación y comparación A/B | RF-20 a RF-23 |

## Lo declarado fuera de alcance

App móvil nativa · pagos en línea · comisiones · varios comercios en un mismo
pedido · cupones · pedidos grupales · chat · inventario con stock ·
recomendaciones · microservicios.

Nueve funciones en §8.1. Si la lista crece, algo tiene que salir — el error 08
del instructivo es cambiar el alcance sin documentar el cambio ni sus razones.
