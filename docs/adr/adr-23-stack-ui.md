# ADR-23: Stack de UI, presupuesto de JS por ruta y movimiento en Turno v2

**Estado:** aceptada (Norman, 2026-10-15). **Fecha:** 2026-10-15. **Reemplaza:** ADR-11 y ADR-19 (ver sección 6).

## 1. Contexto
- Turno v2 necesita shadcn/ui, Motion, Lottie, gráficos y tablas. Hoy no hay librerías de UI ni de animación.
- ADR-11 y ADR-19 las descartaron por peso en datos móviles.
- El CSP es estricto: `connect-src 'self'` y `script-src` con nonce y `strict-dynamic` en producción (`src/middleware.ts:69-71`). Ningún recurso sale del dominio.

## 2. Opciones consideradas
**Lottie frente al CSP**

| Opción | Costo | Riesgo |
|---|---|---|
| A. `lottie-react` build light, JSON local en `public/` | Bajo. Un paquete, carga diferida | Que el build use `eval`. La prueba de CSP lo detecta |
| B. dotLottie con WASM local y `'wasm-unsafe-eval'` | Medio. Cambia `script-src` | Relaja el CSP en todas las rutas |
| C. Sin Lottie. Motion sobre SVG | Ninguno | Pierde animaciones de LottieFiles y Lordicon |

**Navegación entre rutas**

| Opción | Costo | Riesgo |
|---|---|---|
| A. View Transitions con `conTransicionDeVista` | 0 KB. El primitivo ya existe (`src/lib/movimiento.ts`) | Next debe esperar el DOM nuevo |
| B. Motion con AnimatePresence en el layout raíz | Suma peso a todas las rutas | Estado compartido entre rutas |
| C. Sin animación entre rutas | 0 | Sigue la sensación de web |

## 3. Decisión
1. **Entra:** shadcn/ui con Radix y Vaul (Drawer), Sonner, Recharts vía shadcn charts, TanStack Query y Table, React Hook Form con Zod.
2. **Motion** entra con `LazyMotion` y `m` (`domAnimation`). `layoutId` puede exigir features de layout: se mide antes de aceptarlo.
3. **Lottie:** opción A. Solo en cuatro estados: vacío, éxito, error y pedido listo. Carga con `import()`.
4. **Navegación entre rutas:** View Transitions. Motion anima dentro de la pantalla: dock, salidas y microinteracciones.
5. **Zustand:** no entra. Entra cuando un estado cruce pantallas sin pasar por URL o caché.
6. **No entran:** Tremor, refine, react-admin, Rive, Aceternity y React Bits.
7. **recharts y TanStack Table:** solo con carga diferida en `/comercio/*/informe` y `/panel/*`.

**Por qué**
- La opción A de Lottie no toca `script-src`. Ya hubo un incidente de CSP en producción.
- View Transitions cuestan 0 KB y respetan reduced motion.
- Motion entra solo donde CSS no basta: resortes del dock y salidas con AnimatePresence.
- Si Lottie falla la prueba de CSP, se pasa a C. La opción B queda prohibida.

## 4. Presupuesto de JS por ruta
Medida: KB gzip de JS de carga inicial por ruta, según `next build`. Los techos son propuestas. La línea base se mide en T1.

| Ruta | Techo | Incluye | Fuera de la carga inicial |
|---|---|---|---|
| `/` | 110 | React, Next, Motion `m` | recharts, TanStack Table, Lottie, Vaul |
| `/explorar` | 130 | Vaul, Sonner | recharts, TanStack Table, Lottie |
| `/c/[slug]` | 120 | Motion `m` | recharts, TanStack Table, Lottie |
| `/pedido/[id]` | 120 | Motion. Lottie solo al mostrar estado | recharts, TanStack Table |
| `/comercio/*` (cocina y resto) | 140 | TanStack Query | recharts, TanStack Table |
| `/comercio/*/informe` | 250 | recharts y TanStack Table diferidos | ninguno |
| `/panel/*` | 250 | recharts y TanStack Table diferidos | ninguno |

Regla: si una ruta supera su techo, se corrige la ruta. El techo sube solo con decisión nueva.

## 5. Prueba de CSP
- **Archivo:** `e2e/csp.spec.ts`. Corre sobre `next build` y `next start`, no sobre `next dev` (usa `unsafe-eval`).
- **Casos:** 7 rutas por 2 modos de movimiento (`reduce`, `no-preference`) = 14 casos.
- **Rutas:** `/`, `/explorar`, `/c/<demo>`, `/pedido/<demo>`, `/comercio/<demo>/cocina`, `/comercio/<demo>/informe`, `/panel/<demo>`.
- **Por caso:**
  1. Registrar `securitypolicyviolation` con `addInitScript` antes de navegar.
  2. Esperar el estado final de la ruta. En `/pedido`, el estado con Lottie.
  3. Fallar con una violación, una petición a otro origen o un error de consola CSP.
  4. Leer la cabecera CSP. Fallar si falta `connect-src 'self'`, nonce o `strict-dynamic`, o si aparece `unsafe-eval` o `wasm-unsafe-eval`.
  5. Fallar si hay un host externo en `script-src`, `connect-src` o `worker-src`.
- **Control negativo:** `page.evaluate` añade un `<script src="https://...">`. El navegador debe bloquearlo y registrar una violación. Si no, la prueba no sirve.

## 6. Qué se conserva de ADR-11 y ADR-19
| Decisión | Origen | Estado |
|---|---|---|
| Procedencia y licencia verificables | ADR-11 | Conserva |
| Peso en datos móviles | ADR-11 | Conserva, con techos por ruta |
| El movimiento informa o no existe | ADR-11, ADR-19 | Conserva |
| Rechazo de animmasterlib y de copiar Aceternity | ADR-11 | Conserva |
| morphicons en `IconoEstado` | ADR-11 | Conserva |
| `NumeroAnimado`, `.traza`, `volarAlCarrito` | ADR-11 | Conserva |
| Reduced motion en JS y CSS | ADR-11 | Conserva. Motion usa `MotionConfig reducedMotion="user"` |
| Duraciones como tokens `--motion-*` | ADR-19 | Conserva |
| View Transitions y degradación sin soporte | ADR-19 | Conserva. Amplía a rutas |
| Rechazo de Rive | ADR-19 | Conserva |
| Reabrir solo con caso concreto | ADR-19 | Conserva |
| "Sin librería de animación" | ADR-11 | Reemplaza |
| Lottie descartado | ADR-19 | Reemplaza. Entra en cuatro estados |
| Motion descartado | ADR-19 | Reemplaza. Entra de forma limitada |

## 7. Consecuencias
- **Se simplifica:** duraciones y reduced motion quedan en un solo lugar. El sondeo manual pasa a TanStack Query.
- **Se complica:** hay dos mecanismos de movimiento (rutas con View Transitions, dentro de pantalla con Motion). El bundle sube en todas las rutas; los techos lo limitan. Se suman licencias: JSON de Lottie, Open Peeps (CC0) y Storyset (atribución).

## 8. Riesgos y detección
| Riesgo | Detección |
|---|---|
| `eval` en `lottie-react` light | `e2e/csp.spec.ts` |
| Estilos de Sonner o Vaul bloqueados por `style-src-elem 'self'` (`middleware.ts:67`) | Mismo test: violaciones de `style-src-elem` |
| Motion sube el peso de `/` | `next build` contra la sección 4 |
| View Transitions no anima `/explorar` a `/pedido` | E2E: `startViewTransition` se llama una vez |
| Se pierde la pausa con pestaña oculta | Prueba de peticiones con `visibilityState` simulado |
| CLS mayor que 0 por drawer o gráficos | Playwright con `layout-shift` en `/`, `/explorar`, `/pedido/[id]` |
| P95 mayor que 110 ms | `pnpm carga` |
| Las 16 instantáneas visuales se rompen | Regenerar solo con aprobación de Norman |

## 9. Plan de implementación (fase 2)
Dependencias: T1 y T2 primero. T3 en paralelo con T2. T5, T7, T8 y T10 después de T4. T6 y T9 después de T5.

- **T1. Línea base de JS.** Tabla de la sección 4 con KB reales de `next build`.
- **T2. Migrar a pnpm.** `package.json` (`packageManager`), borrar `package-lock.json`, `pnpm-lock.yaml`. Hecho cuando `install`, `typecheck` y `build` pasan.
- **T3. Prueba de CSP.** `e2e/csp.spec.ts`: 14 casos en verde y control negativo activo, sobre la app actual.
- **T4. Instalar dependencias.** `components.json`, `src/components/ui/*`. Build en verde y ninguna ruta sobre su techo.
- **T5. Proveedor de movimiento.** `src/lib/movimiento.ts`, `src/components/MovimientoProveedor.tsx`, tokens en `globals.css`.
- **T6. Navegación con View Transitions.** E2E de `/explorar` a `/pedido`, con y sin reduced motion.
- **T7. Lottie en cuatro estados.** `src/components/Animacion.tsx`, `public/animaciones/*.json`. CSP en verde y Lottie fuera de la carga inicial.
- **T8. Query reemplaza el sondeo.** Borrar `src/lib/sondeo.ts` al final. La pausa con pestaña oculta tiene prueba.
- **T9. Drawer de shadcn.** Un encargo por cada `Hoja*.tsx`. Cada hoja abre, cierra y responde al arrastre.
- **T10. Diferir recharts y TanStack Table.** `/`, `/explorar`, `/c/[slug]` y `/pedido/[id]` no cargan esos chunks.

**Cierre de la fase 2:** CLS 0, P95 de 110 ms o menos, `pnpm test`, typecheck, lint, build y E2E en verde.

## 10. Resultado de la fase 2 (2026-10-15)
- **Lottie:** se usa `lottie-web/build/player/lottie_light` directo, con un envoltorio propio (`src/components/Animacion.tsx`). `lottie-react` no ofrece build light. El bundle light no contiene `eval` ni `new Function`.
- **Sonner:** inyecta un `<style>` sin nonce al cargarse, y `style-src-elem 'self'` lo bloquea. Se parchea con `pnpm patch` (`patches/sonner.patch`) para anular `__insertCSS`, y los estilos se importan desde `sonner/dist/styles.css`. Al actualizar Sonner, reaplicar el parche y correr `e2e/csp.spec.ts`.
- **Prueba de CSP:** `e2e/csp.spec.ts` cubre 8 rutas por 2 modos de movimiento y un control negativo. El control usa `connect-src` y `style-src-elem`, no un script externo: con `strict-dynamic` el navegador no bloquea un script inyectado desde la consola.
- **shadcn:** estilo `radix-vega` (el estilo `new-york` ya no existe). Las variables de shadcn apuntan a los tokens de TURNO en `globals.css`; no tienen valores propios.
- **Pendiente de la sección 4:** línea base de KB por ruta (T1).
- **Vaul:** inyecta un `<style>` sin nonce igual que Sonner. Se parcheó (`patches/vaul.patch`) y sus estilos se extrajeron a `src/components/ui/vaul.css`, importado desde `drawer.tsx`. Al actualizar Vaul: reaplicar el parche, volver a extraer el CSS y correr `e2e/csp.spec.ts` (la ruta de cocina monta un Drawer y lo detecta).
- **`layoutId` de tarjeta a drawer (fase 6):** no se adopta. `domAnimation` no trae las funciones de layout; activarlo exige `domMax` (más JS en toda la app) y la foto del drawer vive en un portal de Vaul con su propia animación. La foto entra con un resorte (escala 1.08 a 1). Reabrir solo si la medición de `domMax` cabe en el presupuesto de la sección 4.
- **Dock móvil:** la fila de estado del pedido va fuera de la caja del dock (`absolute bottom-full`) y se anima con transform y opacidad. Animar `height` movía el dock y sumaba CLS (~0.006). Medido: CLS entre 0.000 y 0.002 en 5 rutas.
- **`useSondeo` retirado:** la cocina, la banda, el pedido y Mis pedidos usan TanStack Query con `refetchIntervalInBackground: false`. `src/lib/sondeo.ts` se borró.

## 11. Resultado de la fase 7 y el presupuesto de JS real (2026-10-15)
- **Recharts y TanStack Table** quedaron solo en `/panel/*`, con `next/dynamic` y esqueleto de la misma altura. `e2e/presupuesto.spec.ts` falla si otra ruta los descarga en la carga inicial.
- **shadcn `chart.tsx`** escribía un `<style>` sin nonce y el CSP lo bloqueaba: se reemplazó por variables de color en el atributo `style` del contenedor.
- **Medición (T1)**, KB de JS comprimido de una visita en frío: `/` 239, `/explorar` 239, `/c/[slug]` 248, `/pedido/[id]` 242, cocina 220, informe 235, `/panel` 660 y `/panel/simulador` 230. Cargar las hojas con `next/dynamic` bajó 28 KB por ruta (antes 267 a 277).
- **La meta de la sección 4 (110 a 140 KB) no se alcanza.** Piso real: React 70 KB y Next 42 KB, más Motion unos 72 KB. Motion es la palanca que queda: un dock con transiciones CSS y Motion solo en la mascota bajaría la portada cerca de 170 KB. No se hizo porque cambia el dock aprobado en la fase 6. Decisión pendiente de Norman.
- Los techos actuales (línea base más 6 %) los vigila `e2e/presupuesto.spec.ts`.
