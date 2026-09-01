# Registros de decisión de arquitectura

Formato corto a propósito: cada ADR ocupa media página y responde qué se decidió,
contra qué alternativas y bajo qué criterios. Un ADR que nadie lee no sustenta
ninguna decisión — que es el error 04 del instructivo.

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-01](adr-01-pwa.md) | Aplicación web progresiva | Aceptada |
| [ADR-02](adr-02-minutos-cocina.md) | Capacidad en minutos-cocina | Aceptada |
| [ADR-03](adr-03-concurrencia.md) | Bloqueo pesimista en la reserva | Aceptada |
| [ADR-04](adr-04-monolito.md) | Monolito modular | Aceptada |
| [ADR-05](adr-05-sondeo.md) | Sondeo periódico para la vista de cocina | Aceptada |
| [ADR-06](adr-06-enlace-magico.md) | Enlace mágico | Aceptada |
| [ADR-07](adr-07-idempotencia.md) | Idempotencia con clave del cliente | Aceptada |
| [ADR-08](adr-08-credenciales.md) | Contraseña para operación, enlace mágico para estudiantes | Aceptada |
| [ADR-09](adr-09-separacion-funciones.md) | El administrador no opera la cocina | Aceptada |
| [ADR-10](adr-10-simulador.md) | El simulador reutiliza el núcleo real, en TypeScript | Aceptada |
| [ADR-11](adr-11-movimiento.md) | Movimiento con la plataforma; una sola librería de UI | Aceptada |
| [ADR-12](adr-12-sin-conexion.md) | Funciona sin conexión; CSP con nonce y renderizado dinámico | Aceptada |
| [ADR-13](adr-13-repetir-y-salir.md) | Pedir lo mismo, aviso de listo, y cerrar sesión | Aceptada |
| [ADR-14](adr-14-web-push.md) | Web Push, y el sondeo solo con la pestaña a la vista | Aceptada |
| [ADR-18](adr-18-infraestructura.md) | Vercel y Neon; el cómputo persistente queda como salida | Aceptada |
| [ADR-19](adr-19-motion.md) | El motion system se implementa con la plataforma | Aceptada |
| [ADR-20](adr-20-hardening.md) | Concurrencia, retención y observabilidad para producción | Aceptada |

Los ADR 15 a 17 están reservados para las decisiones de producto ya acordadas y
todavía no implementadas: orden multi-comercio, cupones, y la exclusión
razonada de pagos en línea y tiendas de aplicaciones.
