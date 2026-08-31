# Matriz de estados de UI por pantalla

> Punto 36 de la auditoría técnica. Generada del código, no de memoria:
> `npm run audit:estados` la vuelve a producir.

Los tres estados que toda pantalla que carga datos tiene que resolver:

- **carga** — qué se ve mientras no hay datos. Sin esto la pantalla salta.
- **vacío** — qué se ve cuando la respuesta llegó y no trae nada. Es distinto de
  la carga y de un error, y confundirlos es lo que produce el "no me funciona"
  de alguien que simplemente todavía no pidió nada.
- **error** — qué se ve cuando la petición falló, y **cómo se reintenta**.

`compartido` = usa `components/estados-ui.tsx` (`Esqueleto`, `Vacio`,
`ErrorVista`). `propio` = lo resuelve con marcado propio. `n/a` = no aplica, con
la razón al lado.

---

## Pantallas que piden sus datos al cliente

Son las que de verdad necesitan los tres estados: hay una ventana en la que la
pantalla existe y los datos no.

| Pantalla | carga | vacío | error |
|---|---|---|---|
| `mis-pedidos` | compartido | compartido | compartido |
| `avisos` | compartido | compartido | compartido |
| `c/[slug]` (carta) | compartido | compartido | compartido |
| `favoritos` | compartido | propio | compartido |
| `cocina/[slug]` | compartido | propio | compartido |
| `comercio/[slug]` | compartido | n/a — el comercio siempre tiene parámetros | compartido |
| `comercio/[slug]/informe` | compartido | propio | compartido |
| `panel/operacion` | compartido | propio | compartido |
| `panel/sistema` | compartido | propio | compartido |
| `panel/usuarios` | compartido | n/a — siempre hay al menos un ADMIN | compartido |
| `pedido/[id]` | compartido | n/a — o el pedido existe o es 403 | compartido |
| `perfil` | compartido | n/a — el perfil existe si hay sesión | compartido |
| `avisos/preferencias` | compartido | n/a — hay valores por defecto | propio |
| `sus` | compartido | n/a — el cuestionario es fijo | compartido |
| `panel` (primera plana) | propio | propio | **propio, y es el más pobre** |

**El único hueco real: `panel/page.tsx`.** Su estado de error es una cadena
suelta dentro de un `<main>`, sin el formato del resto ni botón de reintentar.
No es grave —lo ve un administrador, no un estudiante— pero es la pantalla que
Norman abre para mirar el piloto, y si falla justo ahí no ofrece salida.

## Pantallas servidas desde el servidor

| Pantalla | por qué no lleva los tres estados |
|---|---|
| `/` (portada) | Es un componente de servidor: el menú y los comercios llegan ya renderizados. Lo único que pide el cliente son enriquecimientos opcionales —la sesión y el historial— y si fallan, la pantalla queda entera. **Degradar en silencio acá es lo correcto.** |
| `/explorar` | Igual: `page.tsx` consulta la base y le pasa los productos al componente. El cliente solo filtra lo que ya tiene. |
| `/entrar`, `/acceso` | Formularios. Su "error" es el del envío y lo muestran junto al campo, que es donde hay que mirarlo. |
| `error.tsx` | ES el estado de error de toda la aplicación. Reconoce además el `ChunkLoadError` de un despliegue y se recupera solo. |

## Componentes que no son pantallas

Las hojas (`HojaCambios`, `HojaFranjaAgotada`, `HojaSesion`, `HojaAyuda`…),
`LineaTiempo`, `CodigoRetiro`, `ComprobanteImpreso` y `NumeroAnimado` reciben
todo por props y no piden nada. No tienen estado de carga porque no tienen nada
que esperar.

`ModoMostrador` es la excepción parcial: genera el QR bajo demanda y sí muestra
un esqueleto mientras tanto.

---

## Lo que esta matriz deja fijado

Que la pregunta se haga por pantalla y no por componente. La forma habitual de
que falte un estado vacío no es que alguien lo omita a propósito: es que la
pantalla se construye con datos de prueba que nunca están vacíos, y el caso
aparece el día del piloto con el primer usuario que todavía no pidió nada.
