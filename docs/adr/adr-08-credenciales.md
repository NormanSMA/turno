# ADR-08 — Contraseña para cuentas de operación, enlace mágico para estudiantes

**Estado:** aceptada · **Fecha:** 2026-08-24 · **Complementa:** [ADR-06](adr-06-enlace-magico.md)

## Contexto

El ADR-06 eligió enlace mágico para todos. Al construir la vista de cocina y el
panel apareció que ese método, correcto para el estudiante, no lo es para las
cuentas de operación.

## Alternativas

| Opción | Descripción |
|---|---|
| Enlace mágico para todos | Lo decidido en ADR-06 |
| **Contraseña para operación, enlace para estudiantes** | Método según rol |
| Contraseña para todos | Registro clásico |

## Decisión

`ESTUDIANTE` entra por enlace mágico. `COMERCIO` y `ADMIN` entran con correo y
contraseña, y **no** pueden pedir enlace mágico.

## Razones

**La pantalla de cocina es compartida.** Pedir un enlace al buzón personal de
alguien para desbloquear la pantalla del turno es inviable en hora pico, y en la
práctica termina en que una persona deja su sesión abierta para todos — que es
peor que una contraseña conocida por el equipo del comercio.

**El panel necesita acceso determinista.** Si el proveedor de correo se demora o
falla justo durante una predefensa, no hay panel. Una contraseña no depende de
un tercero.

**Y contraseña para todos sería peor:** el estudiante entra una vez por semestre;
darle una contraseña es darle algo que va a olvidar, más una familia entera de
vulnerabilidades que defender (recuperación, relleno de credenciales, política)
para nada.

El bloqueo es en las dos direcciones: una cuenta de operación que pudiera pedir
enlace mágico haría que la contraseña dejara de ser el control de acceso —
bastaría con tener el buzón.

## Consecuencias

- Derivación con **scrypt** de la biblioteca estándar de Node: memoria-dura y sin
  agregar una dependencia. Una dependencia menos es una cadena de suministro
  menos que auditar
- Los parámetros de coste se versionan dentro del propio hash, así que subirlos
  después no invalida las contraseñas existentes
- Sin auto-registro: las cuentas las crea el equipo con `npm run cuenta`
- Sin recuperación por correo: el equipo reemplaza la contraseña desde el
  servidor. Es defendible porque son poquísimas cuentas, y elimina el flujo de
  recuperación como vector
- Mismo 401 para cuenta inexistente, rol equivocado y contraseña incorrecta, con
  verificación contra un hash señuelo para que el **tiempo** de respuesta tampoco
  delate qué correos son cuentas de operación
- Cambiar la contraseña revoca todas las sesiones, incluida la propia
- Verificado en `tests/credenciales.test.ts`
