# TURNO — Design System v1.0

> **No estamos diseñando una página web para pedir comida. Estamos diseñando
> una experiencia para que un estudiante pueda pedir su comida antes del receso
> y recogerla sin hacer fila.**

Esa frase decide todo lo que sigue. De ella salen cuatro consecuencias que
mandan sobre cualquier preferencia estética:

- la **velocidad** importa más que la decoración
- la **claridad** importa más que la cantidad de información
- el **estado del pedido** importa más que una animación bonita
- el **móvil** importa más que el escritorio

Este documento es normativo. Todo lo que se construya tiene que cumplirlo.
La implementación de los tokens vive en `src/app/globals.css`.

---

## 1. Principios

### 1.1 Mobile-first

El diseño nace en móvil y escala. Escritorio **no** es "el móvil más grande":
cambia distribución, columnas y navegación, pero conserva el mismo lenguaje
visual — mismos radios, mismos colores, mismas tarjetas, mismos estados.

### 1.2 App-like

Tiene que sentirse como una aplicación instalada, no como un sitio.

**Sí:** navegación persistente, acciones rápidas, tarjetas, botones grandes,
respuesta inmediata, transiciones cortas.

**No:** cabeceras enormes, menús complejos, muchos enlaces sueltos, bloques
largos de texto, layouts corporativos.

### 1.3 Una pantalla, una intención

| Pantalla | Pregunta que responde |
|---|---|
| Inicio | ¿qué quiero comer? |
| Explorar | ¿qué más hay? |
| Producto | ¿quiero esto? |
| Carrito | ¿qué voy a pedir? |
| Confirmación | ¿puedo confirmar? |
| Pedido | ¿cuándo lo retiro? |
| Perfil | ¿qué necesito gestionar? |
| Avisos | ¿qué pasó con lo mío? |

Si una pantalla responde dos preguntas, hay que partirla.

### 1.4 Contenido primero

La comida es la protagonista; el sistema no compite con ella. Jerarquía fija:

**producto → precio → disponibilidad → acción**

### 1.5 Lenguaje humano

La aplicación habla como una persona.

| No | Sí |
|---|---|
| `PEDIDO_LISTO` | Tu pedido está listo |
| `EN_PREPARACION` | Lo estamos preparando |
| Pickup location | Retirás en Cafetería Central |
| Error 500 | No pudimos cargar el menú |
| No hay datos | Todavía no pediste nada |

### 1.6 Nunca emojis

**Regla dura, sin excepciones.** Un emoji cambia de dibujo según el sistema
operativo, no hereda el color del texto, no se alinea con el resto y no se
puede animar. Todo símbolo sale de `src/components/iconos.tsx`.

---

## 1b. Marca

El isotipo es la **T convertida en bolsa de comida en movimiento**: el travesaño
se enrolla, el asta baja hasta un pie curvo, la bolsa con el tenedor se apoya a
la derecha y tres líneas ámbar de velocidad entran por la izquierda.

Lema: **Pide · Recoge · Disfruta**

Está dibujado en SVG (`src/components/marca.tsx`), no importado como PNG:

- **peso** — cero kilobytes; un PNG a 3× son ~40 KB en cada primera carga
- **color** — hereda los tokens, así que en modo oscuro el rojo se aclara solo
- **escala** — el mismo archivo sirve para el favicon de 16 px y para el cartel
  impreso

Componentes: `MarcaTurno` (isotipo), `LogotipoTurno` (isotipo + palabra, con
`conLema` opcional), `CabeceraTurno` (fondo de cabecera), `MedidorFranja`
(indicador de ocupación).

**El degradado está permitido en la marca** y en elementos decorativos. Sigue
prohibido en botones, inputs, tarjetas normales, navegación y texto.

---

## 2. Color

### 2.1 Regla de proporción

```
80%  neutrales
15%  superficies / secundarios
 5%  color de acción
```

**El color de marca debe destacar, no dominar.** Una pantalla con rojo, verde,
amarillo y naranja a la vez no tiene acento: tiene ruido.

### 2.2 Tokens — claro

| Token | Valor | Uso |
|---|---|---|
| `--color-marca` | `#C91525` | botón primario, navegación activa, CTA, selección |
| `--color-marca-fuerte` | `#A81020` | estado presionado |
| `--color-marca-suave` | `#FDEAEC` | fondo de resaltado |
| `--color-exito` | `#258A4B` | disponible, listo, confirmado |
| `--color-atencion` | `#F2B84B` | promoción, destacado |
| `--color-error` | `#D92D20` | error, rechazo, acción destructiva |
| `--color-aviso` | `#E49B19` | advertencia, en preparación |
| `--color-fondo` | `#F7F7F5` | fondo de la aplicación |
| `--color-superficie` | `#FFFFFF` | tarjetas, barras |
| `--color-superficie-2` | `#F1F2F0` | superficie hundida, hover |
| `--color-superficie-3` | `#E9EAE7` | separadores llenos |
| `--color-borde` | `#E4E4E1` | bordes |
| `--color-texto` | `#171717` | texto principal |
| `--color-texto-2` | `#6B6B6B` | secundario |
| `--color-texto-3` | `#757575` | apagado — 4.61:1, el mínimo que pasa AA. Estaba en `#9A9A9A` (2.81:1) y lo marcó axe. |

### 2.3 Tokens — oscuro

**No es una inversión.** El fondo no es negro puro, las superficies suben en
pasos, y el rojo se **aclara** porque `#C91525` sobre fondo oscuro pierde
legibilidad.

| Token | Valor |
|---|---|
| `--color-fondo` | `#101010` |
| `--color-superficie` | `#181818` |
| `--color-superficie-2` | `#222222` |
| `--color-superficie-3` | `#2A2A2A` |
| `--color-borde` | `#303030` |
| `--color-texto` | `#FFFFFF` |
| `--color-texto-2` | `#B7B7B7` |
| `--color-texto-3` | `#777777` |
| `--color-marca` | `#F04352` |
| `--color-exito` | `#45B672` |
| `--color-error` | `#F0564A` |

### 2.4 Los tres estados del tema

El viewer tiene **tres** estados, no dos:

```
sin atributo      → manda prefers-color-scheme  (por defecto)
data-tema=claro   → claro aunque el sistema esté oscuro
data-tema=oscuro  → oscuro aunque el sistema esté claro
```

Nunca definir un color **solo** dentro de un bloque `@media` o `[data-tema]`:
en el estado sin atributo no aplicaría, y la página saldría con el texto de un
tema sobre el fondo del otro.

### 2.5 Gradientes

Permitidos en banners, promociones y fondos decorativos. **Prohibidos** en
botones, inputs, tarjetas normales, navegación y texto. El gradiente es un
detalle, no la identidad.

---

## 3. Tipografía

**Una sola familia: Geist.** La jerarquía la da el peso, no la familia. Tres
familias en una aplicación transaccional no crean jerarquía, crean ruido.

| Token | Tamaño | Uso |
|---|---|---|
| `text-display` | 36 | número grande, hero |
| `text-h1` | 28 | título de pantalla |
| `text-h2` | 22 | título de sección |
| `text-h3` | 18 | título de tarjeta |
| `text-cuerpo` | 15 | texto normal |
| `text-chico` | 13 | secundario |
| `text-caption` | 12 | etiqueta, metadato |

Pesos: `400` regular · `500` medium · `600` semibold · `700` bold.

**Máximo 4 tamaños simultáneos por pantalla.** No usar texto pequeño para
resolver problemas de espacio. No hacer párrafos largos: la aplicación es
transaccional, no editorial.

`.hora` usa la mono para todo lo que se alinea en columnas — horas, códigos de
retiro y montos — con `font-variant-numeric: tabular-nums`, para que una lista
no baile al actualizarse.

---

## 4. Espaciado

Escala de 4 px: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80`.

Los más usados: **8, 12, 16, 24, 32**.

**Nunca** `13px`, `17px`, `19px`, `27px` "porque se veía mejor". Todo espacio
sale del sistema.

---

## 5. Radios

| Token | Valor | Uso |
|---|---|---|
| `rounded-xs` | 8 | chips pequeños, badges |
| `rounded-sm` | 12 | inputs |
| `rounded-md` | 16 | botones, tarjetas compactas |
| `rounded-lg` | 20 | tarjetas |
| `rounded-xl` | 28 | modales |
| `rounded-full` | — | chips, avatares |

---

## 6. Sombras

Profundidad muy ligera. Se usan `shadow-sm` y `shadow-md`; `shadow-lg` solo en
modales. **Una tarjeta normal funciona con superficie + borde, sin sombra.**

Tres niveles de superficie: `fondo → superficie → superficie + sombra`.

---

## 7. Iconografía

**Una sola familia**, en `src/components/iconos.tsx`. Lienzo 24×24, sin
relleno, trazo 1.75, extremos y uniones redondeados, color heredado de
`currentColor`.

Tamaños: `16` secundario · `20` interfaz · `24` acción principal · `28`
destacado.

Los trazos se exportan sueltos (`TRAZOS`) para poder pasarlos a `MorphIcon`
cuando un icono **cambia de significado en su sitio** — ver `IconoEstado`, que
transforma reloj → llama → campana → palomita en el botón de avance de la
cocina. Ese es el único uso justificado de una librería de animación: el
movimiento es el acuse de recibo, no un adorno (ADR-11).

---

## 8. Zonas táctiles

Aunque el icono mida 20–24, **la zona táctil es de 44×44 como mínimo**. Vale
para favoritos, cerrar, atrás, sumar, restar, navegación y filtros.

La clase `.toque` lo garantiza con un pseudo-elemento, sin deformar el layout.

---

## 9. Botones

| Variante | Uso |
|---|---|
| Primary | acción principal de la pantalla — fondo `marca`, texto blanco |
| Secondary | acción alternativa — borde, sin relleno |
| Ghost | acción terciaria — solo texto |
| Destructive | cancelar, borrar — texto `error` |
| Icon | acción compacta — con `.toque` |

**Botón principal:** alto 48–52 px, radio 16, texto semibold, ancho completo en
acciones importantes, con estado presionado y estado de carga.

Nunca un botón diminuto para una acción fundamental.

---

## 10. Inputs

Todo input lleva **label, campo, placeholder y ayuda/error**.

Estados: `default · hover · focus · filled · error · disabled`.

**El error nunca se comunica solo con color.** Siempre hay texto.

---

## 11. Food Card

Uno de los componentes centrales. Vive en `src/app/explorar/Explorador.tsx` y
se reutiliza igual en búsqueda, categoría y recomendaciones — **no** se crean
cinco versiones casi iguales.

```
┌─────────────────────────┐
│                         │
│      FOTO (4:3)         │
│  [Pedido anticipado]    │
├─────────────────────────┤
│ Quesillo                │
│ Cafetería Central       │
│ C$ 60.00        5 min   │
└─────────────────────────┘
```

Información máxima: foto, nombre, comercio, precio, tiempo, acción. **No** cinco
líneas de descripción.

**Proporción 4:3 en todas.** No mezclar 1:1, 4:3 y 16:9 sin una razón.

### Estados del producto

`disponible · agotado · comercio cerrado · anticipable`

Un producto agotado **no se oculta ni pierde el botón en silencio**: se marca.
La ausencia no comunica nada, y quien lo busca merece saber que existe y que hoy
no hay.

---

## 12. Pedido activo

`src/components/PedidoActivo.tsx`. Es el componente más importante del producto:
un pedido en curso no es una fila más de una lista, es lo único que le importa
al estudiante mientras dura. Aparece **arriba de todo** en Inicio y en Pedidos.

```
┌────────────────────────────────┐
│ [icono] Lo estamos preparando  │
│ Cafetería Central   Cód J2V-TS2│
├────────────────────────────────┤
│ ●──────●──────○──────○         │
│ Confirmado Cocinando Listo …   │
│                                │
│ [reloj] Retirás entre 10:00    │
│         y 10:10                │
│ [ Ver detalles ]               │
└────────────────────────────────┘
```

### Estados del pedido

| Estado | Nombre humano | Icono | Color |
|---|---|---|---|
| `RECIBIDO` | Tu turno está reservado | reloj | neutro |
| `EN_PREPARACION` | Lo estamos preparando | fuego | `aviso` |
| `LISTO` | Listo para retirar | campana | `exito` |
| `RETIRADO` | Retirado | palomita | neutro |
| `NO_SHOW` | No se retiró | reloj | `texto-3` |
| `CANCELADO` | Cancelado | cerrar | `texto-3` |

Cada estado tiene nombre humano, icono, color semántico y acción. **El color
sale del estado**, nunca de quien llama al componente: así ninguna pantalla
puede pintar de verde un pedido que todavía no está listo.

---

## 13. El concepto del receso

Es lo que conecta la interfaz con el problema real, y debe aparecer en el
lenguaje:

> ¿Para qué receso querés tu pedido?

> Estará listo antes de tu receso.

No "seleccione una franja horaria".

---

## 14. Navegación

**Móvil — barra inferior**, al alcance del pulgar:

```
Inicio    Explorar    Pedidos    Perfil
```

**Escritorio — barra superior**: logotipo, secciones, y el perfil a la derecha.

**Nunca** esconder la navegación principal detrás de un icono de hamburguesa en
móvil. Tiene que estar a un toque, siempre visible.

El punto rojo de avisos sin leer se consulta al montar y al volver a la
pestaña, **nunca en un intervalo**: un contador que sondea en todas las
pantallas sería exactamente el gasto que el ADR-14 vino a eliminar.

---

## 15. Estados de carga, vacío, error y éxito

### Carga — Skeleton

Nunca una pantalla en blanco. El esqueleto **imita la forma real** del
contenido que viene.

### Vacío

Nunca "No hay datos".

```
[ilustración]

Todavía no pediste nada

Elegí tu comida, reservá una hora
y retirá sin hacer fila.

[ Ver el menú ]
```

Siempre con una salida.

### Error

Nunca "Error 500".

```
No pudimos cargar el menú.

[ Intentar de nuevo ]
```

Qué pasó y cómo salir. Sin disculpas ni vaguedades.

### Éxito

Una acción importante tiene confirmación clara — ver el comprobante impreso de
la pantalla de confirmación.

---

## 16. Motion

| Token | Duración | Uso |
|---|---|---|
| `--motion-rapido` | 130 ms | microinteracciones |
| `--motion-normal` | 220 ms | cambio de estado o componente |
| `--motion-lento` | 340 ms | modal, transición de pantalla |

**Se anima:** entrada y salida, cambios de estado, botones, carrito, progreso,
navegación.

**No se anima:** todo, cada scroll, cada texto, lo que solo necesita estar
quieto.

> **El movimiento informa o no existe** (ADR-11).

Todo el motion system está implementado **con la plataforma** —View Transitions
API, Web Animations API y CSS— y no con una librería de animación. El porqué,
con los pesos medidos y lo que se pierde, está en el
[ADR-19](adr/adr-19-motion.md).

Utilidades en `src/lib/movimiento.ts`:

| Función | Qué hace |
|---|---|
| `elementoCompartido(nombre)` | transición compartida entre vistas — el equivalente nativo de `layoutId` |
| `escalonado(i)` | entrada en cascada, con tope a 6 elementos |
| `pulso(el)` | acuse de 1 → 1.15 → 1 |
| `volarAlCarrito(origen, destino)` | el producto viaja hasta el carrito |
| `conTransicionDeVista(cambio)` | envuelve un cambio de estado en una transición |

Clases en `globals.css`: `.hoja`, `.modal`, `.toast`, `.barra-carrito`,
`.esqueleto-brillo`.

Esa regla ya obligó a corregir una animación que era "adorno con coartada". Se
aplica a todo lo nuevo.

`prefers-reduced-motion` se respeta **en JavaScript además de en CSS**: el CSS
acorta transiciones declarativas pero no puede tocar un bucle de
`requestAnimationFrame` ni una transición de vista. Todo degrada al resultado
final instantáneo — se ve el estado nuevo, sin el viaje.

---

## 17. Responsive

No se diseña para dispositivos, se diseña para el espacio disponible.

| Rango | Contexto | Columnas de tarjetas |
|---|---|---|
| `< 640` | móvil | 1 |
| `640–1024` | móvil grande / tablet | 2 |
| `1024+` | laptop / escritorio | 3–4 |

Escritorio **no pierde personalidad**: mismos radios, mismas tarjetas, mismos
colores, misma tipografía, mismos estados.

---

## 18. Fotografía

### El contrato

> **La comida se recorta del fondo; el fondo lo pone el tema.** La imagen nunca
> trae su propio fondo.

Una foto sobre madera oscura se hunde en tema oscuro; una sobre mantel blanco
se rompe en tema claro. Fondo neutro y plano, o PNG recortado.

| Uso | Proporción | Dónde vive |
|---|---|---|
| Tarjeta de comida | **4:3** | `TarjetaComida.tsx` (§43) |
| Hoja de producto | **16:10** con `max-h-[32dvh]` | `HojaProducto.tsx` |
| Tira de comercio | **3:1**, tres celdas | `InicioCliente.tsx` |

**Estas proporciones no se cambian.** Cada una está elegida con razón: el
`max-h-[32dvh]` de la hoja es lo que impide que el botón de acción se salga de
la pantalla en un teléfono chico, y un "contrato mejorado" a 3:2 lo rompe. Eso
solo se descubre en el teléfono de alguien, que es tarde.

`scripts/linter-design-system.ts` **falla** si aparece una proporción fuera de
esa lista (regla `proporcion-imagen`). Agregar una es una decisión de diseño y
se discute; no es un detalle de implementación.

Además: peso razonable —WebP, ancho 640 para tarjeta—, **sin texto incrustado**
(no se traduce, no escala y no lo lee un lector de pantalla) e iluminación
consistente entre fotos.

**Cuando no hay foto** no se deja un hueco: `ImagenProducto` dibuja un mosaico
derivado del nombre del plato. Es determinista —el mismo plato siempre se ve
igual— y por eso se lee como una identidad y no como un error de carga.

La procedencia y la licencia de cada imagen viven en
[`docs/imagenes.md`](./imagenes.md). Ninguna entra sin su fila.

### Estilo

Estilo uniforme: iluminación atractiva, fondo limpio, encuadre consistente,
comida protagonista, **proporción 4:3**.

No mezclar foto profesional + foto de celular + PNG recortado + foto oscura:
rompe la percepción de calidad más rápido que cualquier error de color.

### Dos tipos de imagen, dos usos

No es lo mismo una fotografía que un recorte con fondo transparente, y mezclar
los dos sin criterio es lo que rompe la percepción de calidad.

| Tipo | Dónde va | Por qué |
|---|---|---|
| **Fotografía** (JPG) | banner, hero, cabecera de comercio, fondo de acceso | da contexto y apetito; ocupa mucha superficie |
| **Recorte** (PNG transparente) | Food Cards, promociones, elementos flotando alrededor de un banner | el producto se lee aislado sobre el fondo del sistema, y el mismo recorte funciona en claro y en oscuro |

### Bancos

**Recortes con fondo transparente: no se usan agregadores de PNG.**

PurePNG, PNGimg, StickPNG, RawPNG y similares mezclan licencias, y buena parte
del material que alojan es de terceros. En un trabajo que se defiende
formalmente eso es un riesgo real, no una formalidad.

El camino limpio es propio: foto de Pexels o Unsplash → recorte
(`rembg` o el borrador del editor) → WebP. La licencia queda trazable hasta el
original y el estilo sale uniforme, que era la mitad del motivo para querer
recortes.

**Fotografía:**

| Banco | Licencia | Nota |
|---|---|---|
| [FoodiesFeed](https://www.foodiesfeed.com/) | CC0 | el más específico de comida |
| [Pexels](https://www.pexels.com/search/food/) | propia, permisiva | sin atribución, permite modificar |
| [Unsplash](https://unsplash.com/images/food) | propia | **el único host habilitado hoy** en `next.config.ts` |
| [Pixabay](https://pixabay.com/images/search/food-photography/) | propia | mucho volumen |
| [picjumbo](https://picjumbo.com/free-images/food-and-drink/) | propia | buena sección de comida y bebida |

Los otros cuatro **todavía no se pueden usar por URL remota**: `remotePatterns`
solo admite `images.unsplash.com`, así que una foto de Pexels no se renderiza.
Para usarlos hay que sumar el host —o, mejor, alojar el archivo en `public/`,
que además lo hace inmune a que el banco mueva la URL— y anotarlo en
[`docs/imagenes.md`](./imagenes.md).

### Cómo buscar

No buscar `food PNG`. Buscar el plato concreto: `quesillo`, `baho`, `burger`,
`pizza`, `noodles`, `capuchino`. Y para los elementos decorativos que rodean un
banner: `leaf PNG`, `tomato PNG`, `herbs PNG`, `sauce splash PNG`.

### Fotos que sube el comercio

Se convierten a **WebP en el navegador** antes de subirlas (`lib/imagen-cliente.ts`):
lado mayor acotado a 1200 px y calidad 0.82. Una foto de teléfono de 3.3 MB
queda en ~9 KB — con el WiFi del campus, la diferencia entre instantáneo y medio
minuto por plato.

El servidor **no confía** en esa conversión: valida el tamaño y la **firma** del
archivo (`RIFF…WEBP`), porque el `Content-Type` lo escribe quien envía. Un SVG
con scripts servido desde nuestro propio origen sería un XSS almacenado.

Se guardan en la base y no en un bucket (ADR-18: el sistema de archivos
serverless es efímero y un servicio más es una factura más). La URL lleva el id
de la FOTO, así que es inmutable y se cachea un año; subir una nueva crea otro
id en vez de invalidar la anterior.

### Advertencia de licencia

**"Free PNG" no significa "uso comercial libre".** PurePNG declara CC0, pero
otros sitios mezclan recursos con condiciones distintas — hay bibliotecas con
CC BY-NC, que prohíbe justamente el uso comercial. Para el piloto sirve
trabajar con recursos de ejemplo; para la versión que se cobra hay que mantener
una **tabla de procedencia y licencia por imagen**.

Mientras un producto no tenga foto, `ImagenProducto` dibuja un mosaico derivado
del nombre. Eso es deliberado: **un hueco gris se lee como un error, un mosaico
se lee como una decisión.**

---

## 19. Arquitectura de componentes

Un componente, **una responsabilidad**.

```
components/
  iconos.tsx          familia única de iconos
  marca.tsx           isotipo, logotipo, medidor de franja, cabecera
  Navegacion.tsx      barra inferior (móvil) y superior (escritorio)
  PedidoActivo.tsx    tarjeta de pedido en curso
  BandaPedidoActivo   el pedido en curso en Inicio
  AvisosPush.tsx      control de avisos del navegador
  SelectorTema.tsx    claro / oscuro / sistema
  estados-ui.tsx      Skeleton, Vacio, ErrorVista, EtiquetaEstado
  ImagenProducto.tsx  foto con respaldo de mosaico
  IconoEstado.tsx     icono que se transforma (único uso de morphicons)
```

Mal: `MegaFoodCardWithOrderLogicAndFavoriteAndModal`.
Bien: piezas chicas que se componen.

---

## 20. Accesibilidad

Referencia normativa: **WCAG 2.2**.

- contraste suficiente en los dos temas
- foco visible en todo control (`:focus-visible`)
- navegación por teclado completa
- labels reales, no placeholders haciendo de label
- **estados que no dependen solo del color**
- zonas táctiles de 44×44
- `prefers-reduced-motion` respetado
- salto al contenido en cada página

---

## 21. Regla de los tres segundos

Al abrir una pantalla, en unos tres segundos hay que poder identificar:

| Pantalla | Qué |
|---|---|
| Inicio | qué puedo comer — y si tengo algo en curso, en qué va |
| Pedido | en qué estado está |
| Producto | qué es y cuánto cuesta |
| Carrito | cuánto voy a pagar |
| Perfil | qué puedo gestionar |

---

## 22. Regla de consistencia

> **Una decisión visual tomada una vez se reutiliza en todo el producto.**

Si el CTA principal es `marca` con radio 16, no puede ser radio 12 en el detalle
y 24 en la confirmación.

---

## 23. Personalidad

**Sí:** rápido, joven, amigable, confiable, limpio, apetitoso.

**No:** infantil, gamer, corporativo, premium, recargado.

---

## 24. Prohibido

```
5+ fuentes
10 colores de marca
cada pantalla con un estilo distinto
sombras gigantes
exceso de glassmorphism
degradados en todos lados
botones pequeños
texto excesivo
iconos mezclados
EMOJIS
animaciones innecesarias
modales para cualquier acción
navegación compleja
copiar a los marketplaces
desktop-first
```

---

## Estado de implementación

| Área | Estado |
|---|---|
| Tokens de color, claro y oscuro | **hecho** |
| Tipografía única (Geist) | **hecho** |
| Radios, sombras, motion, spacing | **hecho** |
| Familia única de iconos | **hecho** |
| Navegación 4 secciones + badge | **hecho** |
| Perfil | **hecho** |
| Bandeja de avisos | **hecho** |
| Pedido activo en Inicio y Pedidos | **hecho** |
| Explorar con búsqueda y chips | **hecho** |
| Selector de tema | **hecho** |
| Marca propia, sin identidad institucional | **hecho** |
| Marca propia en SVG, con lema | **hecho** |
| Motion system con la plataforma | **hecho** |
| Carrito persistente con contador y vuelo | **hecho** |
| Código de retiro con número y QR | **hecho** |
| Detalle de producto (hoja inferior) | **hecho** |
| Comprobante impreso al confirmar | **hecho** |
| Subida de fotos con conversión a WebP | **hecho** |
| Iconos de aplicación desde la misma marca | **hecho** |
| Ubicación del comercio en tarjetas y detalle | **hecho** |
| Inicio completo (§28) con secciones personalizadas | **hecho** |
| Food Card compartida entre pantallas (§44) | **hecho** |
| Checkout en un paso | pendiente |
| Favoritos | pendiente |
| Fotografía uniforme del catálogo | pendiente |
