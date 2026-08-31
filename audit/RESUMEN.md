# TURNO — Resumen de auditoría

Generado el 2026-08-29T04:03:55.212Z sobre `master` @ `f763a64` (con cambios sin commitear).

**OK 14 · con hallazgos 0 · omitidos 0**


| Punto | Comprobación | Estado | Severidad | |
|---|---|---|---|---|
| 0 | Migraciones de la base de pruebas | OK | — | 1.9 s |
| 0 | Tipos | OK | — | 3.0 s |
| 0 | Lint | OK | — | 9.1 s |
| 0 | Suite de pruebas | OK | — | 23.3 s |
| 0 | Compilación de producción | OK | — | 0.0 s |
| 1 | Cobertura | OK | — | 26.1 s |
| 2 | Secretos en el historial (gitleaks) | OK | — | 10.6 s |
| 3 | Vulnerabilidades de dependencias | OK | — | 0.8 s |
| 4 | Ciclos de dependencias | OK | — | 2.7 s |
| 5 | SAST (semgrep + reglas propias) | OK | — | 324.0 s |
| 14 | Mutation testing | OK | — | 100.1 s |
| 34 | Linter del Design System | OK | — | 1.2 s |
| 16-22, 25, 35 | E2E, accesibilidad, responsive, PWA y motion | OK | — | 60.6 s |
| 21 | Lighthouse | OK | — | 13.4 s |

## Severidades

- **CRITICAL** — rompe o expone en producción. Corta la auditoría.
- **HIGH** — una defensa ausente o sin red. Corta la auditoría.
- **MEDIUM** — riesgo acotado, o deuda que crece.
- **LOW** — higiene.
- **INFO** — se mide para verlo moverse, no para aprobar o reprobar.

Solo CRITICAL y HIGH devuelven código distinto de cero. Si todo cortara, esto
se terminaría corriendo con `|| true` y no cortaría nada.

## Detalle



El informe con el análisis de cada hallazgo está en `audit/REPORT.md`.
