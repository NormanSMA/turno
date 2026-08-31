# TURNO — Sistema de pedido anticipado con control de admisión por capacidad

**Rol:** Ingeniero de software responsable del sistema completo — arquitectura,
modelo de datos, backend, frontend, pruebas y accesibilidad. Todas las
decisiones técnicas y su documentación son propias.

**Naturaleza:** proyecto personal, **no desplegado en producción**. Corre en
entorno local y de pruebas; la arquitectura de despliegue está diseñada y
documentada, pero no ejecutada. Todas las cifras de este documento provienen de
mediciones sobre ese entorno, no de tráfico real.

---

## Resumen

Plataforma web para pedido anticipado de comida en un campus universitario. El
problema no es tomar pedidos: es que la cocina no puede cumplir todo lo que
promete dentro de un receso de treinta minutos. El sistema **reserva capacidad
de cocina**, no solo un pedido, y por eso puede comprometer una hora de retiro
y sostenerla.

El núcleo es un **control de admisión** que decide si un pedido entra en una
franja horaria evaluando dos condiciones: que la carga comprometida más la del
pedido no supere la capacidad efectiva de la franja (`carga(f) + w(i) ≤ α·C(f)`)
y que quede tiempo real de preparación antes de que la franja cierre
(`ahora + t_max + margen ≤ fin(f)`). Si no se cumplen, el sistema **rechaza y
ofrece la primera hora que sí puede cumplir**, en lugar de aceptar y fallar
después.

Incluye un experimento controlado A/B a nivel de producto: la condición B
sugiere la franja con menor ocupación proyectada para aplanar el pico de
demanda, y el panel mide la relación pico/promedio de carga por franja para
contrastar la hipótesis.

---

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Next.js 16 (App Router, React Server Components), React 19, TypeScript 5 |
| Datos | PostgreSQL 17, Prisma 7 con driver adapter, 17 tablas, 12 migraciones versionadas |
| Validación | Zod 4 en todo límite de entrada |
| Estilos | Tailwind CSS 4 sobre un sistema de design tokens propio |
| Pruebas | Vitest 4, Playwright, axe-core, fast-check (property-based), Stryker (mutación) |
| Calidad | ESLint 9, Lighthouse, madge (dependencias circulares), linter de design system propio |
| Plataforma | PWA con service worker, Web Push (VAPID), autenticación por enlace mágico, correo transaccional |

La estrategia de despliegue —plataforma, límites de plan, costos y qué se
rompería primero al crecer— está evaluada y documentada en un ADR, pero el
sistema no se ha puesto en producción.

---

## Ingeniería

**Arquitectura por pureza.** La lógica de negocio vive en 31 módulos puros sin
acceso a base de datos ni a `Date.now()`: el reloj se inyecta como parámetro.
Eso hace que reglas dependientes del tiempo —cortes por hora, vencimientos,
ventanas de retiro— sean deterministas y verificables sin infraestructura, y es
lo que permite tener el núcleo al 96.73 % de cobertura.

**Concurrencia sobre un recurso finito.** Dos usuarios reservando el último
espacio de una franja es el caso que define la corrección del sistema. Se
resolvió con bloqueo pesimista (`SELECT … FOR UPDATE`) sobre las filas
candidatas, adquiridas en **orden determinista** para evitar interbloqueo, todo
dentro de la transacción de reserva. Documentado y contrastado contra bloqueo
optimista en un ADR.

**Idempotencia con verificación de propietario.** Las reservas aceptan clave de
idempotencia. Una auditoría propia detectó que la implementación inicial
comparaba solo la clave: una repetición podía devolver el pedido de otra
persona junto con su código de retiro. Se corrigió comparando dueño y contenido
del pedido, con pruebas de regresión.

**Decisiones documentadas.** 17 ADRs con contexto, alternativas evaluadas,
criterios y consecuencias — desde el modelo de capacidad en minutos de cocina
hasta por qué se usa sondeo adaptativo en lugar de conexiones persistentes, o
por qué el sistema es un monolito desplegable en una plataforma serverless.

**Seguridad.** Autorización verificada en el servidor por cada ruta y por dueño
del recurso, no por ocultar controles en la interfaz. CSP con nonce por
respuesta emitido desde middleware. Análisis estático con Semgrep (OWASP Top
Ten) y detección de secretos en el historial.

**Accesibilidad y rendimiento como criterios de aceptación, no como revisión
final.** La suite de pruebas corre axe-core y regresión visual **en los dos
temas** (claro y oscuro) como proyectos separados de Playwright. Ese cambio
surgió de un defecto real: un token de texto había pasado meses con contraste
insuficiente sobre fondo oscuro porque las auditorías corren en tema claro por
omisión.

---

## Verificación

| Medición | Resultado |
|---|---|
| Pruebas unitarias y de integración | 669, en 41 archivos |
| Pruebas extremo a extremo | 64, en dos temas |
| Cobertura del núcleo de negocio | 96.73 % de sentencias |
| Cumulative Layout Shift | 0 |
| Rendimiento (Lighthouse) | 100 |
| Accesibilidad (Lighthouse, 5 pantallas) | 96 – 100 |
| Dependencias circulares | ninguna |

Sobre el sistema se ejecutaron dos auditorías formales documentadas —40 puntos
técnicos y 61 de producto y experiencia de usuario— con cada hallazgo
registrado, corregido y verificado.

---

## Lo que demuestra

Diseño de un sistema alrededor de una **restricción física real** —la capacidad
de una cocina— en lugar de alrededor de una pantalla; modelado de concurrencia
sobre recursos finitos; separación estricta entre lógica pura e infraestructura
para hacerla verificable; y una disciplina de verificación en la que un criterio
no se da por cumplido hasta estar **medido**, incluida la comprobación de que
cada control nuevo efectivamente falla ante el caso que existe para atrapar.
