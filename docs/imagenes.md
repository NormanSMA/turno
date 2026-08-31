# Registro de imágenes

Toda foto que entra al producto queda anotada acá: qué es, de dónde salió, bajo
qué licencia y cuándo se tomó. Son diez minutos de trabajo que valen mucho en
una defensa, y son la única forma de responder "¿podés usar esa foto?" sin
tener que confiar en la memoria de nadie.

**Regla:** ninguna imagen entra al repositorio ni a los datos sin su fila acá.

## De dónde pueden salir

| Fuente | Licencia | Uso comercial | Atribución |
|---|---|---|---|
| [Pexels](https://www.pexels.com/search/food/) | Licencia Pexels | sí | no obligatoria |
| [Unsplash](https://unsplash.com/s/photos/food) | Licencia Unsplash | sí | no obligatoria |

**Para recortes con fondo transparente, no se usan agregadores de PNG.**
Mezclan licencias y buena parte del material es de terceros — un riesgo real en
un trabajo que se defiende formalmente. El camino limpio es: foto de Pexels o
Unsplash → recorte propio (`rembg` o el borrador del editor) → WebP. La
licencia queda trazable y el estilo, uniforme.

## Lo que hay hoy

Ninguna imagen está **alojada** en el repositorio: son URLs de Unsplash que
entran por los datos de siembra y de demostración. `next.config.ts` solo
permite `images.unsplash.com` como origen remoto, así que una URL de otro host
no se renderiza — el contrato está aplicado por configuración, no por
disciplina.

Cuando se agreguen fotos propias o de Pexels, hay dos cosas que hacer antes:
sumar el host a `remotePatterns` (o alojarlas en `public/`) y agregar su fila
en esta tabla.

| Producto | Id de Unsplash | Licencia | Entra por | Anotada |
|---|---|---|---|---|
| Pizza personal | [`photo-1513104890138-7c749659a591`](https://unsplash.com/photos/1513104890138-7c749659a591) | Unsplash | `prisma/seed.ts` | 2026-08-29 |
| Almuerzo del día | [`photo-1546069901-ba9599a7e63c`](https://unsplash.com/photos/1546069901-ba9599a7e63c) | Unsplash | `prisma/seed.ts` | 2026-08-29 |
| Quesillo | [`photo-1565299624946-b28f40a0ae38`](https://unsplash.com/photos/1565299624946-b28f40a0ae38) | Unsplash | `prisma/seed.ts` | 2026-08-29 |
| Café con leche | [`photo-1509042239860-f550ce710b93`](https://unsplash.com/photos/1509042239860-f550ce710b93) | Unsplash | `prisma/seed.ts` | 2026-08-29 |
| Gaseosa | [`photo-1622483767028-3f66f32aef97`](https://unsplash.com/photos/1622483767028-3f66f32aef97) | Unsplash | `prisma/seed.ts` | 2026-08-29 |
| Nacatamal | [`photo-1504674900247-0877df9cc836`](https://unsplash.com/photos/1504674900247-0877df9cc836) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Gallo pinto con huevo | [`photo-1525351484163-7529414344d8`](https://unsplash.com/photos/1525351484163-7529414344d8) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Pollo asado | [`photo-1598103442097-8b74394b95c6`](https://unsplash.com/photos/1598103442097-8b74394b95c6) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Sopa de res | [`photo-1547592166-23ac45744acd`](https://unsplash.com/photos/1547592166-23ac45744acd) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Refresco natural | [`photo-1621263764928-df1444c5e859`](https://unsplash.com/photos/1621263764928-df1444c5e859) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Sándwich de pollo | [`photo-1528735602780-2552fd46c7af`](https://unsplash.com/photos/1528735602780-2552fd46c7af) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Baguette caprese | [`photo-1509722747041-616f39b57569`](https://unsplash.com/photos/1509722747041-616f39b57569) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Brownie | [`photo-1606313564200-e75d5e30476c`](https://unsplash.com/photos/1606313564200-e75d5e30476c) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |
| Capuchino | [`photo-1572442388796-11668a67e53d`](https://unsplash.com/photos/1572442388796-11668a67e53d) | Unsplash | `scripts/datos-demo.ts` | 2026-08-29 |

## Lo que se borró

Los cinco SVG de la plantilla de Next (`file`, `globe`, `next`, `vercel`,
`window`) estaban en `public/` sin que ninguna pantalla los usara. Se
eliminaron: un archivo sin uso en el registro es una fila que hay que defender
sin motivo.
