# ADR-22: Identidad visual de TURNO v2

**Estado:** aceptada (Norman, 2026-10-15). **Fecha:** 2026-10-15. **Extiende:** `docs/design-system.md` §1b y §2.

## Contexto
- La marca se parece a PedidosYa: rojo `#C91525` y logo con bolsa y líneas de velocidad.
- El rojo hace tres trabajos: marca, CTA y urgencia (`src/app/globals.css:39-41`).
- Los gráficos usan colores fijos (`src/components/graficos.tsx:17-20`).
- Paleta fija: crema `#F7F4EE`, arena `#E3D9C8`, oliva `#34483C`, carbón `#252521`, dorado `#B68D59`. Rojo y ámbar solo para urgencia.

## Decisión
1. **Oliva es el color de acción:** CTA, navegación activa, franja activa y estado listo.
2. **Rojo solo para urgencia:** `error`, `AvisoUrgencia.tsx`, `HojaProblemaCocina.tsx`.
3. **Ámbar solo para urgencia (`aviso`).** `atencion` pasa a dorado.
4. **Dorado para fidelidad y destacado.** Nunca texto sobre crema (contraste 2.76). Texto permitido sobre carbón (5.09).
5. **Dos niveles de texto:** carbón y oliva. `texto-3` queda como alias de `texto-2`.
6. **Sin blanco puro.** Las superficies se separan con borde arena.
7. **Modo oscuro:** fondo carbón, superficies oliva, acento dorado.
8. **Logo:** reloj con franja marcada. Sin bolsa ni líneas de velocidad. Color por `currentColor`.
9. **Mascota "turno":** SVG propio en código. Colores solo por token. Animación con Motion según ADR-23.
10. **Personajes:** Open Peeps (CC0) recoloreados con la paleta.
11. **Los nombres semánticos se conservan.** Cambian los valores.

Contrastes citados del plan (WCAG): carbón/crema 14.0, oliva/crema 8.95, oliva/arena 7.0, rojo/crema 5.29.

**Preguntas abiertas para Norman**
- Hex del ámbar. La paleta fija no lo incluye. Decidido: `#E49B19` provisional (valor actual de `aviso`), hasta medir contraste en la fase 3.
- Si se acepta un blanco para superficies. Hoy no.
- Si el rojo puede aclararse en modo oscuro cuando falle el contraste.

## Tabla de mapeo
| Token | Claro: viejo a nuevo | Oscuro: viejo a nuevo |
|---|---|---|
| `marca-fondo` | `#C91525` a oliva (texto crema) | `#D42D40` a arena (texto carbón) |
| `marca-texto` | `#C91525` a oliva | `#F04352` a crema |
| `marca-fuerte` | `#A81020` a carbón | `#FF6472` a oliva |
| `marca-suave` | `#FDEAEC` a arena | `#2A1416` a oliva |
| `exito` | `#1E7340` a oliva | `#45B672` a arena |
| `exito-suave` | `#E3F2E8` a arena | `#12251A` a oliva |
| `atencion` | `#F2B84B` a dorado (sin texto) | `#F2B84B` a dorado (texto permitido) |
| `atencion-suave` | `#FDF3E0` a arena | `#2A2216` a oliva |
| `aviso` | `#E49B19` a ámbar (urgencia) | sin cambio |
| `error` | `#D92D20` a rojo `#C91525` | `#F0564A` a rojo `#C91525` |
| `error-suave` | `#FDEAE8` a arena | `#2B1512` a carbón |
| `fidelidad` (nuevo) | dorado | dorado |
| `fondo` | `#F7F7F5` a crema | `#101010` a carbón |
| `superficie` | `#FFFFFF` a crema | `#181818` a oliva |
| `superficie-2` | `#F1F2F0` a arena | `#222222` a carbón |
| `superficie-3` | `#E9EAE7` a arena | `#2A2A2A` a oliva |
| `borde` | `#E4E4E1` a arena | `#303030` a oliva |
| `texto` | `#171717` a carbón | `#FFFFFF` a crema |
| `texto-2` | `#6B6B6B` a oliva | `#B7B7B7` a arena |
| `texto-3` | `#757575` a alias de `texto-2` | `#8A8A8A` a alias de `texto-2` |
| `cocina*` | sin uso | `#101010` a carbón; `#181818` y `#303030` a oliva; `#B7B7B7` a arena |

Los alias de compatibilidad (`globals.css:44`, `:93-112`) apuntan a los tokens nuevos.

## Consecuencias
**Se simplifica**
- Cada color tiene un papel. Rojo y ámbar quedan solo para urgencia.
- Dos niveles de texto, menos tokens.
- Los componentes no cambian de API.

**Se complica**
- Sin blanco, las tarjetas dependen del borde.
- Cinco pares no tienen cifra de contraste (ver riesgos).
- Las 16 instantáneas visuales se rompen. Regenerar solo con aprobación de Norman.
- `docs/design-system.md` queda desactualizado hasta cerrar la fase 3.

## Alternativas
| Opción | Veredicto |
|---|---|
| A. Mapeo por rol con paleta fija | **Elegida** |
| B. Cambiar solo logo y marca (rojo sigue como CTA) | Descartada |
| C. Escala completa por color (50-950) | Descartada: valores fuera de la paleta y costo alto |

## Riesgos y detección
| Riesgo | Detección |
|---|---|
| Pares sin cifra: carbón/arena, rojo/arena, arena/carbón, rojo/carbón, oliva/carbón | Medir antes de cerrar la fase 3 y con axe en E2E. Si no pasa AA, no se usa |
| Rojo `#C91525` falla sobre carbón | Medir. Norman decide: tono aclarado o cambio de papel |
| Dorado o ámbar como texto | Regla nueva en `scripts/linter-design-system.ts`: prohibir `text-fidelidad`, `text-atencion`, `text-aviso` fuera de iconos |
| Hex fuera de tokens | El linter solo mira hex de 6 dígitos (`:113`). Extender a 3 dígitos y `rgba(`, con caso de prueba |
| Rojo o ámbar en pantallas sin urgencia | Búsqueda de `(text|bg|border)-(error|aviso)` fuera de la lista de urgencia |
| Marca parecida a PedidosYa | Mostrar 4 piezas antes del resto |
| Licencias | Registro por archivo y página de créditos |

## Archivos que toca la fase 3
Orden: tokens, logo y mascota, personajes y gráficos.
1. `src/app/globals.css`: `@theme` y modo oscuro (hoy duplicado; dejar un solo bloque).
2. `src/components/marca.tsx`: logo nuevo.
3. `src/components/mascota/Turno.tsx` y `Personajes.tsx` (nuevos).
4. `public/marca/` (nuevo): SVG servidos desde el dominio.
5. `src/components/graficos.tsx`: colores fijos a tokens.
6. `src/components/estados-ui.tsx`: estados con personaje.
7. `AvisoUrgencia.tsx` y `HojaProblemaCocina.tsx`: usos de urgencia.
8. `scripts/linter-design-system.ts` y `audit/design-system.excepciones.json`.
9. Iconos de PWA desde la misma marca (ruta por confirmar).
10. `docs/design-system.md` §1b, §2.

**Cierre de la fase 3:** 4 piezas mostradas antes del resto, contraste AA medido con axe y licencias registradas.
