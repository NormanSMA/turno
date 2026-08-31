# ADR-04 — Monolito modular

**Estado:** aceptada · **Fecha:** 2026-08-24

## Alternativas

Monolito plano · **monolito modular** · microservicios.

## Criterios

Tamaño del equipo · complejidad operativa · plazo de 14 semanas.

## Decisión

Una sola aplicación con un núcleo de dominio aislado en `src/core/`, sin
dependencias del framework ni de la base de datos.

## Razones

Microservicios agregarían despliegue, red y consistencia distribuida a un
sistema con un comercio, ~200 usuarios y dos personas construyéndolo. Sería
sobre-ingeniería demostrable, y en un trabajo de pregrado hay que justificar por
qué **no** se usaron, no por qué sí.

Pero un monolito plano tampoco sirve acá, por una razón concreta: el modelo de
admisión tiene que poder ejecutarse **fuera de la aplicación**, sobre datos
sintéticos, para alimentar el simulador de eventos discretos de §15. Si la regla
viviera dentro de un endpoint o de una consulta SQL, esa validación cruzada
sería imposible.

De ahí la frontera: `core/` es puro o recibe el cliente de base de datos por
parámetro; `app/` y `lib/` dependen de `core/`, nunca al revés.

## Consecuencias

- El mismo código de admisión corre en la API, en las pruebas y en el simulador
- Las reglas de autorización son verificables sin levantar Next.js
- La disciplina de la frontera hay que sostenerla: un `import` de `next/headers`
  dentro de `core/` la rompe
