/**
 * El correo de TURNO.
 *
 * Separado de `lib/correo.ts` a propósito: allá vive **cómo se envía** —SMTP,
 * Resend, reintentos, la bandeja— y acá **cómo se ve**.
 *
 * ## Es uno solo, y eso decide el diseño
 *
 * TURNO manda **un** correo: el enlace de acceso. Los avisos de pedido van por
 * push, que es lo que decidió el ADR-14 y lo que sostiene el límite de envío de
 * la cuenta. Eso cambia el criterio: no hay que diseñar un sistema de plantillas
 * flexible, hay que hacer que **esta pieza** funcione.
 *
 * Y es una pieza con un solo trabajo: que alguien que pidió entrar toque el
 * botón. Todo lo que no ayude a eso sobra.
 *
 * ## Los correos se quedaron fuera del rebrand
 *
 * Seguían con el turquesa `#009ca6` y firmando "TURNO · Campus UAM", cuando la
 * aplicación es roja desde hace meses y la marca de la universidad se quitó de
 * todas las pantallas. El estudiante veía una cosa en el teléfono y otra en el
 * buzón — y el correo, que es lo único que le llega cuando NO está usando la
 * aplicación, es donde la identidad tiene que ser más reconocible.
 *
 * ## Las reglas del medio, que no son las de la web
 *
 *  - **No hay animaciones.** Gmail bloquea `@keyframes`, `transition` y
 *    `transform`. Lo único que se mueve es un GIF, y un GIF pesa, no se adapta
 *    al tema y se ve mal en pantallas densas. No hay ninguno.
 *  - **No hay flex ni grid.** La estructura va en tablas, que es exactamente lo
 *    que la web abandonó y en el correo sigue siendo lo correcto.
 *  - **Las imágenes se bloquean por defecto**, y aun así el correo las lleva:
 *    la cabecera y los cuatro beneficios son ilustraciones. Es una decisión
 *    tomada sabiendo el costo — sin ellas el correo se veía correcto y soso, y
 *    con ellas se ve como el producto. Lo que se hace para que el bloqueo no
 *    duela: **cada imagen tiene un `alt` que dice lo que la imagen dice**, no
 *    "imagen de cabecera", así que un buzón que las esconda sigue mostrando la
 *    marca y los cuatro beneficios en texto; el botón, el título y el aviso del
 *    vencimiento **nunca** son imagen; y las dos juntas pesan 320 KB contra los
 *    102 KB a partir de los que Gmail recorta el HTML — que cuenta el HTML, no
 *    los adjuntos remotos.
 *  - **El tema oscuro es parcial.** `prefers-color-scheme` funciona en Apple
 *    Mail y Outlook.com; Gmail lo ignora e invierte los colores por su cuenta.
 *    Por eso la banda superior es oscura en los dos temas: así la cabecera se
 *    ve igual pase lo que pase, y lo que Gmail pueda invertir es el cuerpo,
 *    que aguanta la inversión.
 */

/**
 * La paleta.
 *
 * Del Design System vigente (`globals.css`), no de la lámina de marca: esa
 * propone `#E53935` y acá el rojo es `#C91525`. Se usa el de la aplicación
 * porque lo que se pidió es que el correo se vea parte del mismo producto, y
 * el producto es el que está desplegado.
 *
 * Las ilustraciones sí vienen de la lámina de marca, y ahí el rojo es otro. No
 * chocan porque no se tocan: la imagen ocupa su bloque completo y el rojo del
 * sistema aparece en el botón, lejos.
 */
const C = {
  marca: "#c91525",
  acento: "#e49b19",
  tinta: "#171717",
  fondo: "#f7f7f5",
  superficie: "#ffffff",
  superficie2: "#f1f2f0",
  borde: "#e4e4e1",
  texto: "#171717",
  texto2: "#6b6b6b",
  texto3: "#757575",
  oscFondo: "#101010",
  oscSuperficie: "#181818",
  oscSuperficie2: "#222222",
  oscBorde: "#303030",
  oscTexto: "#ffffff",
  oscTexto2: "#b7b7b7",
} as const;

const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * De dónde salen las imágenes.
 *
 * URL absoluta y `APP_URL`: un correo no tiene origen, así que una ruta
 * relativa no resuelve a ningún lado. Se sirven desde `public/correo/`, que
 * viaja con el despliegue — no desde un servicio externo que mañana cambie de
 * dirección y deje todos los correos ya enviados con un hueco.
 */
function urlImagen(archivo: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/correo/${archivo}`;
}

/**
 * La cabecera: la banda de marca.
 *
 * Es la pieza de la lámina — logotipo, nombre y la promesa en tres palabras
 * sobre negro. Va arriba y a ancho completo porque es lo primero que se ve, y
 * en un buzón lleno lo primero que se ve decide si el mensaje se abre.
 *
 * **Se sirve al doble del tamaño de presentación** (1080 px para 540) porque en
 * una pantalla de alta densidad una imagen al tamaño exacto se ve borrosa, y
 * una marca borrosa es peor que ninguna.
 *
 * `width` va como atributo HTML además de en el estilo: Outlook ignora el CSS
 * de dimensión y sin el atributo la pone a tamaño completo, reventando la
 * tarjeta.
 *
 * El `alt` no es de relleno. Cuando el cliente bloquea las imágenes —lo
 * habitual hasta que la persona lo autoriza— ese texto es lo único que queda
 * arriba, así que dice la marca y la promesa, no "imagen de cabecera".
 */
function cabecera(): string {
  return `<tr>
<td style="padding:0;line-height:0;font-size:0">
<img src="${urlImagen("banda.png")}" width="540" alt="turno — Reservá. Pedí. Retirá." style="display:block;width:100%;max-width:540px;height:auto;border:0;border-radius:14px 14px 0 0" />
</td>
</tr>`;
}

/**
 * Los cuatro beneficios, ilustrados.
 *
 * Si la imagen no carga, el `alt` los enumera igual: el correo pierde el
 * color, no la información.
 */
function razones(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 2px"><tr>
<td style="padding:0;line-height:0;font-size:0">
<img src="${urlImagen("beneficios.png")}" width="476" alt="Sin filas · Rápido y fácil · Te avisamos · Retirá y disfrutá" style="display:block;width:100%;max-width:476px;height:auto;border:0" />
</td>
</tr></table>`;
}

export interface Bloque {
  titulo: string;
  cuerpo: string;
  pie?: string;
}

/** La tarjeta completa: banda, contenido y pie. */
export function envolver({ titulo, cuerpo, pie }: Bloque): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${titulo}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .t-fondo { background: ${C.oscFondo} !important; }
    .t-tarjeta { background: ${C.oscSuperficie} !important; border-color: ${C.oscBorde} !important; }
    .t-titulo { color: ${C.oscTexto} !important; }
    .t-texto { color: ${C.oscTexto} !important; }
    .t-suave { color: ${C.oscTexto2} !important; }
    .t-caja { background: ${C.oscSuperficie2} !important; border-color: ${C.oscBorde} !important; }
    .t-linea { border-color: ${C.oscBorde} !important; }
    /* El boton NO se adapta al tema: el rojo de marca es el mismo en los dos.
       Sin esto, los clientes que recalculan colores lo aclaran hasta el salmon. */
    .t-boton { background: ${C.marca} !important; background-color: ${C.marca} !important; }
    .t-boton-texto { color: #ffffff !important; }
  }
  /* En un telefono, 32px a cada lado se comen un tercio del ancho util. */
  @media (max-width: 480px) {
    .t-relleno { padding: 24px 20px !important; }
    .t-banda { padding: 22px 20px !important; }
    .t-apilar { display: block !important; width: 100% !important; padding: 0 0 8px 0 !important; }
  }
</style>
</head>
<body class="t-fondo" style="margin:0;padding:0;background:${C.fondo};font-family:${FUENTE};-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="t-fondo" style="background:${C.fondo};padding:32px 16px">
<tr><td align="center">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="t-tarjeta" style="max-width:540px;background:${C.superficie};border:1px solid ${C.borde};border-radius:14px">
${cabecera()}
<tr><td class="t-relleno" style="padding:26px 32px 32px">

<h1 class="t-titulo" style="margin:0 0 12px;font:700 27px/1.22 ${FUENTE};color:${C.texto};letter-spacing:-.015em">${titulo}</h1>

${cuerpo}

</td></tr>
</table>

${
  pie
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px">
<tr><td style="padding:18px 8px 0">
<p class="t-suave" style="margin:0;font:400 12px/1.6 ${FUENTE};color:${C.texto3}">${pie}</p>
</td></tr>
</table>`
    : ""
}

</td></tr>
</table>
</body>
</html>`;
}

/** Párrafo del cuerpo. */
export function parrafo(html: string, suave = false): string {
  return `<p class="${suave ? "t-suave" : "t-texto"}" style="margin:0 0 14px;font:400 ${
    suave ? "13px" : "16px"
  }/1.6 ${FUENTE};color:${suave ? C.texto2 : C.texto}">${html}</p>`;
}

/**
 * El botón.
 *
 * En tabla y no en un `<a>` suelto: Outlook ignora el relleno de un enlace en
 * línea y lo deja como texto plano. `mso-padding-alt` es el remedio para las
 * versiones con motor de Word.
 */
export function boton(href: string, texto: string): string {
  /*
   * `bgcolor` además del CSS, y no es redundancia.
   *
   * iOS convierte los correos a modo oscuro por su cuenta: recalcula los
   * colores para "adaptarlos" al fondo, y al rojo de marca lo aclaraba hasta
   * dejarlo en salmón. El botón perdía la fuerza justo donde más importa.
   *
   * Esos motores respetan el atributo `bgcolor` —HTML de los noventa— mucho
   * mejor que la propiedad CSS, y la clase `t-boton` vuelve a fijar el color en
   * la consulta de tema oscuro para los clientes que sí la aplican. Entre las
   * tres capas, el botón se queda rojo en todos.
   */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr>
<td class="t-boton" bgcolor="${C.marca}" style="background:${C.marca};background-color:${C.marca};border-radius:999px;mso-padding-alt:15px 34px">
<a href="${href}" class="t-boton-texto" style="display:inline-block;padding:15px 34px;font:600 16px/1 ${FUENTE};color:#ffffff;text-decoration:none">${texto}</a>
</td></tr></table>`;
}

/**
 * Aviso con la barra de acento al costado.
 *
 * Para lo que hay que leer sí o sí —que el enlace vence— sin gritarlo con un
 * color de alarma que no corresponde: no pasó nada malo.
 */
export function aviso(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 16px"><tr>
<td style="width:3px;background:${C.acento};border-radius:2px"></td>
<td class="t-suave" style="padding-left:12px;font:400 13px/1.55 ${FUENTE};color:${C.texto2}">${html}</td>
</tr></table>`;
}

/** Separador. */
export function linea(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="t-linea" style="margin:20px 0 16px;border-top:1px solid ${C.borde}"><tr><td style="font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

/** Los cuatro beneficios, en imagen. */
export { razones };
