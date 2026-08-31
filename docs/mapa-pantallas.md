# Mapa de pantallas

Tres roles, un producto. Este documento dice **qué existe hoy**, qué falta, y
—más importante— **qué no se va a construir y por qué**.

La regla que ordena todo: una aplicación no debe tener cuarenta pantallas
porque "un sistema serio tiene muchas pantallas". Debe tener las que resuelven
este recorrido:

```
                    ANTES DEL RECESO

                 el estudiante abre TURNO
                           ↓
                      elige comida
                           ↓
                        carrito
                           ↓
                   elige su receso
                           ↓
                   confirma el pedido
                           ↓
                    vuelve a clase
                           ↓
                  aviso: ya está listo
                           ↓
                    va al comercio
                           ↓
                    número o QR
                           ↓
                        retira
```

Todo lo demás existe para sostener ese recorrido. Por eso **"pedido activo +
hora de retiro + estado + código"** es el corazón visual del sistema y no una
sección secundaria dentro de "Mis pedidos".

---

## Estudiante

### Identidad

| # | Pantalla | Ruta | Estado |
|---|---|---|---|
| 01 | Entrar (enlace mágico) | `/entrar` | **hecho** |
| 02 | Acceso de operación | `/acceso` | **hecho** |
| 03 | Cambiar contraseña | `/cuenta` | **hecho** |
| — | Registro con contraseña | — | **descartado** · el enlace mágico no necesita registro; una contraseña más es una contraseña más que perder |
| — | Recuperar contraseña | — | **descartado** · no hay contraseña de estudiante que recuperar |
| — | Splash / onboarding de 3 slides | — | **descartado por ahora** · el receso dura 20 minutos; tres pantallas de bienvenida se las come |

> **Invitado.** No hace falta cuenta para ver el menú completo ni para explorar.
> La identificación se pide recién al reservar una franja, que es el momento en
> que el sistema compromete capacidad de cocina a nombre de alguien. Pedirla
> antes es fricción sin contrapartida.

### Recorrido principal

| # | Pantalla | Ruta | Estado |
|---|---|---|---|
| 04 | Inicio | `/` | **hecho** · mecanismo interactivo, pedido activo, buscar, pedir de nuevo, lo que más piden, comercios |
| 05 | Explorar, buscar y filtrar | `/explorar` | **hecho** · búsqueda tolerante a acentos, chips por comercio |
| 06 | Menú del comercio | `/c/[slug]` | **hecho** · catálogo, carrito, franjas |
| 07 | Detalle de producto | hoja en `/explorar` | **hecho** · foto, precio, tiempo, ubicación, cantidad; siembra el carrito |
| 08 | Carrito persistente | `/c/[slug]` | **hecho** · barra flotante con contador y total |
| 09 | Elegir receso | `/c/[slug]` | **hecho** · solo se ofrecen franjas que caben |
| 10 | Revisar antes de confirmar | diálogo | **hecho** · `<dialog>` nativo, foco atrapado |
| 11 | Pedido confirmado | `/c/[slug]` | **hecho** · comprobante que se imprime, con el código legible desde el primer cuadro |
| 12 | Seguimiento del pedido | `/pedido/[id]` | **hecho** |
| 13 | Código de retiro | `/pedido/[id]` | **hecho** |
| 13b | Modo mostrador | pantalla completa | **hecho** · fondo claro pese al tema, código a 112 px, QR, pantalla despierta |
| 13c | Modo retiro | `/pedido/[id]` | **hecho** · con el pedido listo, la línea de tiempo se repliega |
| 14 | Mis pedidos | `/mis-pedidos` | **hecho** · en curso e historial separados |
| 15 | Pedir lo mismo | `/c/[slug]?repetir=` | **hecho** |
| 16 | Micro-encuesta tras el retiro | `/pedido/[id]` | **hecho** |
| 17 | Avisos | `/avisos` | **hecho** |
| 18 | Perfil | `/perfil` | **hecho** · cifras, avisos, tema, datos |
| 19 | Favoritos | — | **pendiente** |

### Estados, que no son pantallas pero se diseñan igual

| Estado | Dónde | Estado |
|---|---|---|
| Cargando (esqueleto con brillo) | todas | **hecho** |
| Vacío, con salida | listas | **hecho** |
| Error recuperable | todas | **hecho** |
| Sin conexión, navegando | copia local marcada | **hecho** |
| Sin conexión, con pedido | `/pedido/[id]` | **hecho** · "tu pedido sigue reservado" |
| Sin conexión, confirmando | `/c/[slug]` | **hecho** · el botón se APAGA; confirmar con datos viejos es una mentira |
| Comercio cerrado | `/c/[slug]` | **hecho** · distinto de pausado, con salidas |
| Comercio pausado | `/c/[slug]` | **hecho** · "volvé en unos minutos"; los pedidos confirmados siguen |
| Franja agotada | hoja de recuperación | **hecho** · alternativas con la mejor preseleccionada |
| Producto agotado o con otro precio | hoja de cambios | **hecho** · revalidación al volver y antes de confirmar |
| Fuera de hora (cut-off) | `/c/[slug]` | **hecho** · no se ofrecen franjas inalcanzables |
| Sin capacidad, con alternativas | `/c/[slug]` | **hecho** · RF-09: nunca un rechazo sin alternativa |
| Sesión vencida | redirección a `/entrar?volver=` | **hecho** |
| Permiso de avisos denegado | `/perfil` | **hecho** |
| Hay que instalar (iOS) | `AvisosPush` | **hecho** |

---

## Comercio

No debe parecerse a la aplicación del estudiante. Es una herramienta operativa:
pantalla fija, a un metro, con las manos ocupadas y prisa.

| # | Pantalla | Ruta | Estado |
|---|---|---|---|
| 20 | Tablero de cocina | `/cocina/[slug]` | **hecho** · tres columnas, un toque por avance |
| 21 | Configuración del comercio | `/comercio/[slug]` | **hecho** · catálogo, franjas, parámetros |
| 22 | Carteles con QR por canal | `/comercio/[slug]/carteles` | **hecho** |
| 23 | Disponibilidad de producto | `/comercio/[slug]` | **hecho** · interruptor, no inventario |
| 23b | Subir foto de producto | `/comercio/[slug]` | **hecho** · se convierte a WebP en el navegador antes de subir |
| 24 | Confirmar retiro | `/cocina/[slug]` | **hecho** |
| 25 | Informe de ventas y operación | `/comercio/[slug]/informe` | **hecho** · ventas, horas pico, ocupación, qué se vende |
| 26 | Historial con tiempos por pedido | — | **pendiente** |
| — | Inventario con stock | — | **descartado** · el interruptor `disponible` cubre el 95 % del caso a un costo mínimo |

---

## Administrador

El administrador **no opera la cocina** (ADR-09): quien mide el piloto no
produce el dato que mide. Observa todo, no toca nada.

| # | Pantalla | Ruta | Estado |
|---|---|---|---|
| 27 | Panel de indicadores | `/panel` | **hecho** · los nueve indicadores, comparación A/B, CSV |
| 28 | Consola del sistema | `/panel/sistema` | **hecho** · salud, presión de capacidad, calibración del modelo, embudo y auditoría |
| 29 | Gestión de usuarios | — | **pendiente** |
| 30 | Gestión de comercios | — | **pendiente** |
| 31 | Presión de capacidad por comercio | `/panel/sistema` | **hecho** |
| 32 | Facturación por comercio | — | **pendiente** · depende del modelo de ingresos |

---

## Una cuenta por comercio

Cada comercio tiene su propia cuenta, atada a su `comercioId`. El aislamiento
está probado en las funciones puras (`tests/identidad.test.ts`) y verificado
contra las rutas reales: una cuenta de comercio recibe **403** al informe y a la
cocina de otro, y **el mismo 403** para un comercio inexistente — así el
endpoint no sirve para enumerar qué comercios existen.

```bash
npm run cuenta -- --correo=alguien@dominio --rol=COMERCIO --comercio=<slug>
```

## Estado de la lista de excepciones

**Nivel 1 — imprescindible: completo.**

| # | Estado | Dónde vive |
|---|---|---|
| Franja agotada | **hecho** | hoja de recuperación con alternativas |
| Franja cambiada | **hecho** | misma hoja, motivo distinto |
| Producto agotado | **hecho** | hoja de cambios, sale del carrito |
| Carrito revalidado | **hecho** | al volver a la pestaña y antes de confirmar |
| Conflicto de precio | **hecho** | hoja de cambios, NO bloquea |
| Pedido confirmado | **hecho** | comprobante impreso |
| Pedido listo | **hecho** | modo retiro |
| Modo retiro | **hecho** | detalle replegado |
| QR | **hecho** | dentro del modo mostrador |
| Cafetería cerrada | **hecho** | distinta de pausada |
| Cafetería pausada | **hecho** | con la tranquilidad explícita |
| Offline con pedido | **hecho** | tres contextos distintos |

Regla que salió de acá y vale para todo lo que venga: **el servidor gana
siempre, pero nunca en silencio.** Cada vez que el sistema le cambia algo al
usuario tiene que decir qué pasó, qué se conservó y qué puede hacer ahora.

## Lo que sigue, en orden

1. **Historial del comercio con tiempos** por pedido — el dato ya se registra en
   `EventoPedido`; la consola ya lo agrega, falta el detalle pedido por pedido.
2. **Gestión de usuarios y comercios** desde el panel — hoy se hace con
   `npm run cuenta`.
3. **Notas por producto** ("sin cebolla") — la hoja de detalle ya tiene dónde
   ponerlas; falta el campo en `ItemPedido`.
4. **Favoritos** — útil, pero "pedir lo mismo" ya cubre buena parte del caso.

## Una regla que salió de un error real

Explorar mostraba productos y al tocarlos llevaba al menú del comercio, donde
había que buscar el mismo producto otra vez. La tarjeta **prometía una acción y
entregaba una lista**, y el toque no adelantaba nada.

La regla que queda: *si algo se ve como una tarjeta de producto, tocarlo tiene
que acercarte a pedirlo.* Hoy abre el detalle y, al confirmar, el producto viaja
en la URL (`?agregar=<id>&cant=<n>`) y llega al menú **ya en el carrito**.
