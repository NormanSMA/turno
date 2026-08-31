# ADR-18 — Vercel y Neon; el cómputo persistente queda como salida

**Estado:** aceptada · **Fecha:** 2026-08-27 · **Reemplaza:** la mención a
Supabase en las conversaciones de despliegue · **Habilita:**
[ADR-14](adr-14-web-push.md)

## Contexto

Hasta acá el sistema corría solo contra Postgres en Docker: `DATABASE_URL`
apunta a `localhost:55432` y no hay ningún proveedor conectado. Antes del piloto
hay que elegir dónde vive, con tres restricciones que no son negociables:

1. **Sin ingresos todavía.** El piloto es gratuito por diseño: se compran datos
   y testimonios, no se vende software.
2. **Crecimiento por escalones**, no de golpe: 800 usuarios, después 1,200,
   después 1,500, según si la gente lo adopta.
3. **Una persona opera esto.** Cada hora dedicada a administrar servidores es
   una hora que no se dedica al producto ni a conseguir comercios.

El error que hay que evitar es elegir por el precio de la etiqueta. Lo que
importa es **qué recurso se agota primero y qué pasa cuando se agota**.

## Lo que se agota primero no es lo que parece

El instinto dice que el límite será el almacenamiento. Es falso por dos órdenes
de magnitud: 500 MB alcanzan para cientos de miles de pedidos con su historial
de eventos.

El límite real es el **cómputo**, y lo genera el sondeo del [ADR-05](adr-05-sondeo.md).
Estimación a 800 usuarios, 22 días lectivos, 3 comercios con tablero abierto 8 h,
20 % de los usuarios pidiendo en un día dado:

| Superficie | Cadencia | Invocaciones/mes |
|---|---|---|
| Tablero de cocina | 5 s | ~380 k |
| Pantalla de pedido | 10 s | ~317 k |
| Mis pedidos | 15 s | ~62 k |
| Todo lo demás | — | ~55 k |
| **Total** | | **~814 k** |

Contra el millón de invocaciones del plan Hobby de Vercel eso es el 81 %. Pero
el plan también da **4 horas-CPU de ejecución activa**, que son 14,400
segundos-CPU: repartidos entre 814 k invocaciones dan **17.7 ms de CPU por
petición**. Una invocación que arranca Prisma, toma una conexión del pooler,
corre una consulta con `include` y serializa la respuesta no baja de eso de
forma consistente.

**Conclusión: el límite de CPU expulsa antes que el de invocaciones**, en algún
punto alrededor de los 500–600 usuarios, y el síntoma es estrangulamiento de
funciones en hora pico — el peor momento posible.

Esto es lo que motiva el [ADR-14](adr-14-web-push.md). Las dos decisiones son
una sola: **la elección de infraestructura solo es viable si primero se elimina
el sondeo del lado del estudiante.**

## Alternativas

| Opción | Costo de arranque | Qué pasa cuando se acaba | Operación | Veredicto |
|---|---|---|---|---|
| **Vercel Hobby + Neon Free** | $0 | Degradación medible; se pasa a Pro por US$20 | ninguna | **Adoptada** |
| Vercel Hobby + Supabase Free | $0 | Igual, más pausa a los 7 días | ninguna | Descartada |
| AWS Lightsail + Postgres gestionado | $0 por 3 meses **(ya no existe)** | — | propia | Descartada |
| AWS cuenta nueva (plan Free) | $100–200 en créditos | **la cuenta se cierra** | propia | **Descartada** |
| VM propia (Hetzner, DigitalOcean) | ~US$6/mes | nada, es de pago desde el día uno | propia | Descartada por ahora |

### Por qué se descarta AWS, y no es por el precio

El 15 de julio de 2025 AWS retiró la capa gratuita clásica para cuentas nuevas.
Los trials cortos de Lightsail —los tres meses— **fueron eliminados**. Lo que
hay es un plan Free con US$100 de crédito inicial, hasta US$200 en total, que
dura **6 meses o hasta agotar los créditos**, y al terminar **la cuenta se
cierra automáticamente**.

Eso no es una capa gratuita, es un acantilado con fecha. Un piloto universitario
mide un semestre; el crédito se acaba a mitad de camino y el modo de falla es la
desaparición del entorno, no una factura. Las capas gratuitas de Vercel y Neon
no expiran: degradan.

**S3 no aplica.** No es base de datos ni ejecuta Next.js. La única necesidad de
almacenamiento de objetos son las fotos de producto (`Producto.imagenUrl`),
medidas en megabytes.

### Por qué Neon y no Supabase

Las dos dan medio giga y Postgres gestionado. Se diferencian en el modo de
falla por inactividad, y para una aplicación de campus eso decide:

- **Supabase** pausa el proyecto tras **7 días sin actividad** y hay que
  **restaurarlo a mano** desde el panel. Vacaciones de semestre, Semana Santa o
  fin de año apagan el piloto, y nadie se entera hasta que un estudiante abre la
  aplicación y no funciona.
- **Neon** hace *scale to zero* a los 5 minutos, pero **vuelve solo** en menos
  de un segundo con la primera consulta. La inactividad es gratis, no letal.

Neon además es lo que ya decía el documento de propuesta original. Se vuelve a
esa decisión.

Su límite propio son **100 CU-hours de cómputo al mes**, y conviene notar que se
consumen por el mismo mecanismo: **el sondeo mantiene la base despierta**. Es el
problema del ADR-05 con otra factura, y lo resuelve el mismo ADR-14.

### Por qué la VM tiene razón técnica y se descarta igual

La intuición de que "una máquina siempre encendida aguantaría esto sin
problema" es **correcta**, y merece quedar escrita porque es contraintuitiva:
un proceso Node persistente con un pool de conexiones caliente absorbe el
sondeo sin despeinarse — no paga arranque en frío, no reabre conexiones, no
factura por invocación. **Serverless es la peor arquitectura posible para
sondear.**

Se descarta por una razón que no es técnica: pasar a una VM convierte a una
persona sola en el administrador de sistemas —parches, respaldos, TLS,
despliegues, disponibilidad— exactamente durante el piloto, que es cuando su
tiempo es el recurso más escaso. Y no evita el ADR-14: Web Push hay que hacerlo
igual, porque resuelve un problema de producto —el teléfono en el bolsillo con
todo cerrado— y no solo uno de costos.

## Decisión

**Vercel + Neon**, los dos en plan gratuito, con el ADR-14 aplicado antes del
despliegue.

Tres consecuencias operativas que se implementan ahora, no cuando duelan:

1. **Conectar siempre por el pooler**, nunca al puerto directo, y limitar el
   pool del proceso. `src/lib/db.ts` pasa hoy el `connectionString` sin
   configurar `max`, y el `Pool` de `pg` toma 10 por defecto: multiplicado por
   cada instancia serverless concurrente, eso agota las conexiones en hora pico.
   En serverless el valor correcto es **1**.
2. **El cron de mantenimiento es también el latido.** `/api/cron/mantenimiento`
   ya corre a diario; esa misma invocación es la que garantiza que la base nunca
   pase un fin de semana larga sin una consulta.
3. **Vercel Hobby prohíbe el uso comercial.** El día que se le factura al primer
   comercio hay que estar en Pro (US$20/mes). No es una zona gris y lo hacen
   cumplir. Se presupuesta como el costo de empezar a cobrar.

## Consecuencias

- El piloto corre a costo cero real, sin créditos que expiren ni cuenta que se
  cierre.
- El primer escalón de pago son US$20/mes y llega alrededor de los ocho
  comercios. Si a esa altura ocho comercios no cubren veinte dólares, el
  problema no era la infraestructura.
- Queda una **salida de emergencia documentada**: si el cómputo aprieta antes de
  querer pagar, el tablero de cocina puede migrar a notificación por
  *streaming* del proveedor de base de datos, que empuja los cambios sin
  consumir invocaciones. No se hace ahora porque reabre el ADR-05 y agrega una
  superficie de seguridad nueva que habría que probar.
- El cambio a cómputo persistente (VM o Lightsail) **no queda descartado, queda
  fechado**: es la decisión correcta cuando haya ingresos y el sondeo de N
  tableros de cocina domine la factura. Reabrir este ADR con números, no con
  intuición.
