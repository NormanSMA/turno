/**
 * Cómo se le habla a alguien por su nombre.
 *
 * Antes el nombre se DERIVABA del correo: `angarciam@uamv.edu.ni` producía
 * "Angarciam", y así saludaba la portada a Adriana García Mayorga. Con
 * direcciones de demostración pasaba inadvertido; con una persona real es lo
 * primero que ve al entrar, y está mal.
 *
 * La regla nueva: **si no sabemos el nombre, no lo inventamos.** Se saluda sin
 * nombre, que es correcto, en vez de con uno equivocado, que no lo es.
 */

/** Partículas que en español van en minúscula dentro de un nombre. */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "do"]);

/**
 * Normaliza un nombre escrito por una persona.
 *
 * Sirve tanto para lo que alguien tipea como para lo que venga de una lista de
 * matrícula, que suele llegar en mayúsculas: "ADRIANA NOEMI GARCIA MAYORGA" se
 * ve a gritos en una interfaz.
 */
export function normalizarNombre(crudo: string): string | null {
  const limpio = crudo.replace(/\s+/g, " ").trim();
  if (!limpio) return null;

  return limpio
    .split(" ")
    .map((palabra, i) => {
      const baja = palabra.toLocaleLowerCase("es");
      // Las partículas van en minúscula salvo al principio: "García de la Torre",
      // pero "De la Torre" si con eso empieza.
      if (i > 0 && PARTICULAS.has(baja)) return baja;
      /*
       * Se capitaliza cada tramo separado por guion o apóstrofo: "ANA-MARÍA"
       * tiene que quedar "Ana-María", no "Ana-maría".
       */
      return baja.replace(/(^|[-'’])([\p{L}])/gu, (_, sep, letra) =>
        sep + letra.toLocaleUpperCase("es"),
      );
    })
    .join(" ");
}

/**
 * Con qué nombre se saluda.
 *
 * Devuelve solo el **primer nombre**: "Buenas noches, Adriana" es como se
 * saluda a alguien, no "Buenas noches, Adriana Noemi García Mayorga".
 *
 * `null` significa saludar sin nombre. Es un resultado válido, no un error.
 */
export function nombreParaSaludar(nombre: string | null | undefined): string | null {
  const limpio = normalizarNombre(nombre ?? "");
  if (!limpio) return null;
  return limpio.split(" ")[0] ?? null;
}

/**
 * Cómo mostrar a alguien cuando hace falta identificarlo, no saludarlo.
 *
 * Acá sí gana el correo como respaldo: en una lista de accesos o en una
 * bitácora, "angarciam@uamv.edu.ni" identifica a una persona sin ambigüedad,
 * mientras que una fila vacía no identifica a nadie. Es la diferencia entre
 * saludar —donde inventar molesta— e identificar —donde callar estorba.
 */
export function comoIdentificar(
  nombre: string | null | undefined,
  correo: string,
): string {
  return normalizarNombre(nombre ?? "") ?? correo;
}
