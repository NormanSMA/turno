/**
 * Genera el par de claves VAPID para Web Push (ADR-14).
 *
 *     npm run push:claves
 *
 * Se corre UNA vez por despliegue y el resultado se guarda como variables de
 * entorno. Rotar las claves invalida todas las suscripciones existentes: cada
 * dispositivo tendría que volver a activar los avisos, y nadie se entera hasta
 * que un pedido no avisa. No se rota sin motivo.
 *
 * La clave PÚBLICA va en `NEXT_PUBLIC_VAPID_PUBLIC_KEY` —una sola variable
 * para el navegador y el servidor, a propósito: tenerla duplicada permite que
 * se desincronicen, y el síntoma es que todas las suscripciones se crean bien
 * y todos los envíos fallan con 403.
 *
 * La PRIVADA es un secreto. Con ella cualquiera puede enviar notificaciones
 * que el teléfono del estudiante mostrará como si vinieran de TURNO.
 */

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(
  [
    "",
    "Claves VAPID generadas. Copiá esto a .env (y a las variables del",
    "despliegue). La privada NO se comparte ni se sube al repositorio.",
    "",
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY="${publicKey}"`,
    `VAPID_PRIVATE_KEY="${privateKey}"`,
    'VAPID_SUBJECT="mailto:turno@uamv.edu.ni"',
    "",
    "Sin estas variables el sistema no envía push y lo dice en el log; el",
    "correo sigue funcionando como respaldo.",
    "",
  ].join("\n"),
);
