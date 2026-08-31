# ADR-06 — Enlace mágico

**Estado:** aceptada · **Fecha:** 2026-08-24

## Contexto

Sin identidad verificada el mecanismo de no-show no existe: quien deja un pedido
plantado abre otra cuenta y sigue. Y hay una razón metodológica: el Capítulo III
declara que la población es la comunidad universitaria de la UAM; si cualquiera
puede registrarse, la muestra deja de ser la población declarada.

## Alternativas

| Opción | Descripción |
|---|---|
| Contraseña | Registro clásico |
| OTP por correo | Código de seis dígitos |
| **Enlace mágico** | Token de un solo uso enviado al buzón |
| OAuth institucional | Google Workspace o Microsoft Entra |

## Criterios

Superficie de ataque · requisitos a documentar · verificación de pertenencia ·
dependencia externa.

## Decisión

Enlace mágico, con sesión larga de 75 días.

## Razones

No almacenar contraseñas elimina de raíz una familia entera de vulnerabilidades:
hash, política de complejidad, recuperación, cambio, relleno de credenciales.
Nada de eso hay que implementar ni defender.

Verifica pertenencia por construcción: solo quien accede a ese buzón entra.

Y no depende de la autorización de nadie. OAuth institucional sería superior —
menos fricción, verificación más fuerte— pero algunos tenants exigen aprobación
de un administrador. **Se construye primero el enlace mágico porque es el piso
garantizado.** Si OAuth resulta disponible, se agrega después como segundo
botón. Nunca al revés: apostar a OAuth y que lo bloqueen en la semana 9 dejaría
al sistema sin autenticación.

## Sobre la fricción

Nadie se registra y pide en el mismo instante: se entera en un receso y usa el
sistema días después, con hambre y prisa. La sesión larga hace que la fricción
del enlace ocurra **una sola vez en todo el piloto**, y nunca en el momento de
urgencia.

El menú se ve sin iniciar sesión. La identidad se pide recién al confirmar.

## Consecuencias

- Se almacena solo SHA-256 del token; el claro nunca se persiste ni se registra
- Un solo uso, marcado dentro de la misma transacción que crea la sesión
- Depende de que el correo llegue: exige rate limiting por buzón y por IP
- Verificado en `tests/auth.test.ts`
