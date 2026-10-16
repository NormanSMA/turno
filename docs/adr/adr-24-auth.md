# ADR-24: Better Auth detrás de una fachada

**Estado:** aceptada (Norman, 2026-10-15). **Fecha:** 2026-10-15. **Complementa:** ADR-06 y ADR-08. **Mantiene:** ADR-09.

## Contexto
- La auth propia funciona: enlace mágico, contraseña y sesiones en Postgres (`src/lib/auth.ts`).
- Hay que sumar OAuth de Google por dominio sin tocar los llamadores.
- Riesgo: cambiar el motor y romper IDOR, roles o la condición experimental A/B.

## Opciones
| Opción | Costo | Riesgo |
|---|---|---|
| A. Auth propia más Google a mano | Medio: escribir OIDC | Alto: errores de OAuth en código propio |
| B. Better Auth detrás de `src/lib/auth.ts` | Medio | Medio: formato de sesión por confirmar |
| C. Better Auth directo en los 27 llamadores | Alto | Alto |

## Decisión
Elegir B. Solo cambia `src/lib/auth.ts` y se agrega el motor.
1. `src/lib/auth.ts` conserva todos sus exports.
2. Better Auth usa `prismaAdapter`, `magicLink` y `emailAndPassword`. No usa el plugin `admin`.
3. Roles: enum propio `RolUsuario` por `additionalFields` con `input: false`.
4. **COMERCIO y ADMIN siguen con contraseña.** El plan-v2 pedía enlace para comercio, pero ADR-08 lo prohíbe. Norman decidió (2026-10-15): se mantiene ADR-08, comercio sigue con contraseña.
5. El enlace mágico solo entra a cuentas `ESTUDIANTE` o cuentas `esDemo`.
6. **El hash no cambia.** Ya es scrypt (`src/core/credenciales.ts`). Se reusa en `password.hash` y `password.verify`. Corrige el plan-v2, que decía "pasa a scrypt".
7. Google: solo con `hd` institucional y `email_verified = true`. Da rol `ESTUDIANTE`.
8. Un correo externo no se registra. Entra solo si existe como cuenta `esDemo` creada por el equipo.
9. Vincular por correo exige `email_verified`. Nunca vincula `COMERCIO` ni `ADMIN`.
10. Las sesiones vivas se invalidan en el corte.
11. El CSP con nonce se mantiene.

## Alcance de la fachada
- Archivos: `src/lib/auth.ts` (reescrito), `src/lib/auth-motor.ts` y `src/app/api/auth/[...all]/route.ts` (nuevos).
- Exports que se mantienen: `sesionActual`, `exigirSesion`, `exigirRol`, `exigirComercio`, `exigirComercioPorSlug`, `exigirAccesoPedido`, `emitirEnlace`, `canjearEnlace`, `cerrarSesion`, `accederConCredenciales`, `cambiarPassword`, `opcionesCookie`, `COOKIE_SESION`, `NoAutenticado`, `NoAutorizado` y los tipos `DatosRegistro`, `MotivoCanjeFallido`, `MotivoAccesoFallido`.
- Nueva: `crearSesionParaPrueba(usuarioId)`. Lanza error si `NODE_ENV=production`.
- Helpers que pasan a la fachada: `tests/helpers/sesion.ts`, `e2e/sesion.ts` (SQL puro con el formato nuevo) y `scripts/sesion-dev.ts`.
- Cookie: nombre fijo `turno_sesion`. `sesionActual` sigue devolviendo `comercioSlug`.
- Sin cambios: `src/core/identidad.ts` y `src/core/autorizacion.ts`.

## Cambios de schema
Solo aditivos. En la fase 4 no se borra nada.
- `Usuario`: `+emailVerified Boolean @default(false)`, `+updatedAt`, `+esDemo Boolean @default(false)`.
- Nuevos `Session`, `Account` y `Verification` (`@@map` a `session`, `account`, `verification`).
- Sin cambio: `Sesion`, `TokenAcceso`, `Usuario.passwordHash`.

## Migración de cuentas
Script idempotente `scripts/migrar-auth.ts`, una transacción por paso.
1. Estudiantes: no se copia nada. Con `token_acceso.usadoEn`, poner `emailVerified = true`.
2. Operadores con `passwordHash`: crear `account` con `providerId = 'credential'` y `password = passwordHash`. Sin reset.
3. Sesiones vivas: marcar `revocadaEn = now()`. No se copian.
4. Tokens de acceso sin usar: marcar `usadoEn`.
5. Los estudiantes vuelven a entrar una vez. Avisar en la landing antes del corte.
6. Verificar conteos antes y después, y el login de un operador de prueba.

## Rollback
Todo es aditivo. El código anterior ignora las tablas nuevas.
1. Disparador: fallo de E2E de operación o de acceso tras el corte.
2. Revertir el deploy en Vercel y los commits de la fase 4 con `git revert`.
3. Durante la ventana, `cambiarPassword` escribe en `account.password` y en `usuario.passwordHash`.
4. Ventana: 14 días. Después, una tarea aparte borra `sesion`, `token_acceso` y `passwordHash`.

## Consecuencias
- **Se simplifica:** un motor de sesión y de OAuth. Los llamadores no cambian. IDOR y roles siguen igual.
- **Se complica:** dos motores durante la ventana, escritura doble de contraseña, dependencia nueva y reingreso único de estudiantes.

## Riesgos y detección
| Riesgo | Detección |
|---|---|
| 1. Better Auth guarda el token de sesión en claro (contradice `src/core/identidad.ts`) | T0: leer la fila tras crear sesión. Decidir antes de T2 |
| 2. El enlace mágico queda en `notificacion` o en logs | Test: tras `sendMagicLink`, ninguna fila ni log contiene el token |
| 3. Dos canjes simultáneos crean dos sesiones | Test de concurrencia: una sola sesión |
| 4. Google vincula una cuenta de operador | Test: `hd` institucional con cuenta `COMERCIO` se rechaza |
| 5. Alta sin condición A/B | Hook `user.create`. Test: 50 altas, reparto A/B, nunca nulo |
| 6. El hash copiado no verifica | Test con fixture: contraseña buena y mala |
| 7. El CSP bloquea `/api/auth` | E2E con consola sin errores de CSP |
| 8. El cambio de contraseña no revoca otras sesiones | Test: revoca las otras y conserva la actual |
| 9. Un correo externo crea cuenta | Test: correo fuera de dominio sin `esDemo` se rechaza |

## Encargos de la fase 4 (orden)
Codex no toca auth.
- **T0 Spike (orquestador):** instalar Better Auth aislado. Verificar riesgos 1 y 2.
- **T0b Línea base (tester):** IDOR, roles, credenciales y enlace en verde antes de cambiar.
- **T1 Schema (orquestador):** `prisma/schema.prisma` y migración aditiva.
- **T2 Motor (implementador):** `src/lib/auth-motor.ts`, ruta `[...all]`. Depende de T1.
- **T3 Datos (orquestador):** `scripts/migrar-auth.ts`. Paralelo a T2.
- **T4 Fachada (orquestador):** `src/lib/auth.ts`. Depende de T2. Los 27 llamadores sin diff.
- **T5 Helpers (implementador):** los tres helpers de prueba. Depende de T4.
- **T6 Google y correo externo (implementador):** reglas de vinculación y `esDemo`. Depende de T4.
- **T7 CSP (orquestador):** nonce y ruta `/api/auth`. Depende de T2.
- **T8 Cierre (tester):** suite completa, IDOR y roles iguales a T0b.
- **T9 Corte (orquestador y Norman):** migración en producción. Requiere aprobación.

## Pendientes para Norman
Resueltos el 2026-10-15: se mantiene ADR-08 (comercio con contraseña) y los estudiantes entran de nuevo una vez.

## Nota de verificación
Los detalles de Better Auth (campos, almacenamiento del token) no se verificaron contra la versión instalada. Se resuelven en T0.

## Resultado de la fase 4 (2026-10-15)
Better Auth 1.7.8 quedó detrás de la fachada. Los 27 archivos que autentican siguen importando de `src/lib/auth.ts` sin cambios, y las pruebas de IDOR y de roles pasan sin tocarlas.

**Dos desvíos frente a lo decidido arriba**, porque la prueba de cada riesgo mostró un costo que el plan no había visto:
1. **El plugin `magicLink` no se usa.** Better Auth borra el token al canjearlo, así que "ya usado" e "inexistente" se vuelven lo mismo, y se pierde la prueba de concurrencia (dos clics, una sola sesión). El enlace sigue en `token_acceso`, con bloqueo de fila; al canjearlo se abre una sesión de Better Auth y se marca el correo como verificado.
2. **La contraseña no se copia a `account.password`.** Sigue en `usuario.passwordHash` (scrypt, `core/credenciales.ts`), un solo lugar, sin doble escritura. Por eso el script de corte no toca contraseñas y el rollback no pierde cambios de contraseña.

**Riesgos del ADR, con su prueba** (`tests/auth-motor.test.ts`, 16 casos):
| Riesgo | Resultado |
|---|---|
| 1. Token de sesión en claro | Confirmado: `session.token` queda en claro. La cookie va firmada (HMAC) y una cookie con firma alterada, o el token solo, no abre sesión. Se acepta y queda registrado |
| 2. Enlace en `notificacion` o logs | El enlace solo se guarda como hash; la prueba busca el token en claro en las dos tablas |
| 3. Dos canjes simultáneos | Una sola sesión; el segundo recibe `YA_USADO` |
| 4. Google vincula un operador | `account.create.before` lo rechaza para COMERCIO y ADMIN |
| 5. Alta sin condición A/B | El hook de alta la asigna; 40 altas dan A y B, nunca nula |
| 6. Hash copiado | No aplica: no se copia |
| 7. CSP bloquea `/api/auth` | `e2e/csp.spec.ts` verde en 9 rutas |
| 8. Cambiar contraseña no revoca otras sesiones | Cubierto por `api-sesion.test.ts` sobre la tabla nueva |
| 9. Correo externo crea cuenta | Rechazado salvo cuenta `esDemo` creada por el equipo |

**Qué cambió de verdad:** `src/lib/auth.ts` (fachada), `src/lib/auth-motor.ts` (Better Auth), `src/app/api/auth/ba/[...all]/route.ts` (Google), los tres helpers de prueba (`tests/helpers/sesion.ts`, `e2e/sesion.ts`, `scripts/sesion-dev.ts`) y tres sitios que leían la tabla `sesion` vieja directamente (`admin/sistema`, `admin/usuarios`, `core/limites.ts`). El ADR contaba "27 llamadores"; esos tres no pasaban por la fachada.

**Pendiente de Norman (T9, el corte en producción):**
1. Crear `BETTER_AUTH_SECRET` en Vercel (valor largo y aleatorio).
2. Ejecutar `pnpm exec tsx scripts/migrar-auth.ts` (simulacro) y luego `--aplicar` contra Neon, y desplegar.
3. Avisar a los estudiantes que vuelven a entrar una vez.
4. Para Google: crear el cliente OAuth, definir `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `NEXT_PUBLIC_GOOGLE_LOGIN=1`, con la URI de redirección `<APP_URL>/api/auth/ba/callback/google`.
