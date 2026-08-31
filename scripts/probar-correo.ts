/**
 * Prueba de envío de correo real.
 *
 *   npm run correo:probar -- --para=nsmartinez@uamv.edu.ni
 *
 * Sin RESEND_API_KEY imprime el correo en consola y avisa. Con la clave puesta
 * hace un envío de verdad y reporta el error exacto del proveedor si falla, que
 * es lo que hace falta para diagnosticar la configuración del dominio.
 */
import "dotenv/config";
import {
  controladorActivo,
  correoEnlaceAcceso,
  enviarCorreo,
  verificarSmtp,
} from "../src/lib/correo";

function arg(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
}

async function main() {
  const para = arg("para");
  if (!para) {
    console.error("Falta --para=correo@uamv.edu.ni");
    process.exit(1);
  }

  const controlador = controladorActivo();
  console.log(`Controlador activo: ${controlador}`);
  console.log(`Remitente:          ${process.env.CORREO_REMITENTE ?? "(por defecto)"}`);
  console.log(`Destinatario:       ${para}`);
  console.log("");

  if (controlador === "consola") {
    console.log(
      [
        "No hay proveedor configurado en .env, así que NO se envía nada de verdad.",
        "El correo se imprime abajo tal como saldría.",
        "",
        "Para enviarlo por SMTP con una contraseña de aplicación, poné en .env:",
        "  SMTP_HOST=smtp.gmail.com",
        "  SMTP_PORT=465",
        "  SMTP_USER=tu@uamv.edu.ni",
        '  SMTP_PASS="xxxx xxxx xxxx xxxx"',
        "",
      ].join("\n"),
    );
  }

  if (controlador === "smtp") {
    // Verificar antes de enviar separa dos fallos que en el log se confunden:
    // credencial mala (falla acá) y destinatario rechazado (falla al enviar).
    process.stdout.write("Verificando credenciales SMTP… ");
    const v = await verificarSmtp();
    if (!v.ok) {
      console.log("falló.");
      console.error(`\nError: ${v.error}\n`);
      console.error(
        [
          "Si dice 'Invalid login' o 'Username and Password not accepted':",
          "  - la contraseña normal de la cuenta NO sirve; hace falta una",
          "    contraseña de aplicación de 16 caracteres",
          "  - la cuenta necesita verificación en dos pasos activada",
          "  - si es Google Workspace, el administrador del dominio puede tener",
          "    bloqueado el acceso SMTP",
          "",
        ].join("\n"),
      );
      process.exit(1);
    }
    console.log("ok.\n");
  }

  const r = await enviarCorreo(
    correoEnlaceAcceso(para, "TOKEN-DE-PRUEBA-NO-SIRVE-PARA-ENTRAR"),
  );

  if (r.enviado) {
    console.log(
      controlador === "consola"
        ? "Impreso arriba. Configurá SMTP o Resend para enviarlo de verdad."
        : `Enviado por ${controlador}. Revisá la bandeja y, si no está, la carpeta de spam.`,
    );
  } else {
    console.error("No se pudo enviar.");
    console.error(`Error: ${r.error}`);
    console.error(`¿Reintentable?: ${r.reintentable ? "sí" : "no"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
