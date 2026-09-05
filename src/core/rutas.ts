/**
 * TURNO — Validación de rutas de retorno.
 *
 * El parámetro `volver` decide a dónde va el usuario después de autenticarse.
 * Si se toma de la URL sin validar, cualquiera puede armar
 *
 *     https://turno.uam.../entrar?token=…&volver=https://sitio-falso.com
 *
 * y el usuario termina en un sitio ajeno **justo después de haber iniciado
 * sesión**, con toda la confianza puesta. Es una redirección abierta, y acá es
 * peor de lo habitual por dos razones: el enlace mágico llega por correo, que es
 * exactamente donde la gente está entrenada para hacer clic; y el destino falso
 * puede mostrar un "tu sesión expiró, volvé a entrar" perfectamente creíble.
 *
 * La regla es lista blanca de forma, no lista negra de dominios: se acepta
 * únicamente una ruta relativa de este mismo sitio.
 */

/** Destino cuando el `volver` recibido no sirve. */
export const RUTA_POR_DEFECTO = "/";

/** Base inexistente: solo sirve para comprobar que la ruta no cambia de origen. */
const ORIGEN_DE_PRUEBA = "https://turno.invalido";

export function esRutaSegura(destino: string | null | undefined): boolean {
  if (!destino) return false;

  // Tiene que empezar con una sola barra. `//otro.com` y `/\otro.com` son
  // rutas protocolo-relativas: el navegador las trata como absolutas.
  if (!destino.startsWith("/")) return false;
  if (destino.startsWith("//") || destino.startsWith("/\\")) return false;

  // Sin esquema embebido, ni siquiera camuflado con espacios o mayúsculas.
  const normalizado = destino.trim().toLowerCase();
  if (/^\/*\s*(javascript|data|vbscript|file|https?):/.test(normalizado)) {
    return false;
  }

  // Sin caracteres de control: se usan para partir cabeceras y para esconder
  // el destino real dentro de lo que parece una ruta inocente.
  for (let i = 0; i < destino.length; i++) {
    const c = destino.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }

  // Y tiene que resolver contra un origen cualquiera sin cambiarlo.
  try {
    const u = new URL(destino, ORIGEN_DE_PRUEBA);
    if (u.origin !== ORIGEN_DE_PRUEBA) return false;
  } catch {
    return false;
  }

  return true;
}

/** Devuelve el destino si es seguro; si no, la portada. */
export function rutaSegura(
  destino: string | null | undefined,
  porDefecto = RUTA_POR_DEFECTO,
): string {
  return esRutaSegura(destino) ? destino! : porDefecto;
}

/**
 * A dónde mandar a alguien que acaba de entrar.
 *
 * `volver` es el destino que se pidió antes de identificarse, y respetarlo es
 * lo correcto casi siempre: quien iba a una pantalla concreta vuelve a ella en
 * vez de aterrizar en el inicio.
 *
 * Con una excepción: **un operador entra a su comercio y a ninguno otro**. Si
 * el `volver` apunta a la cocina o al panel de otro local, se descarta. Pasaba
 * de verdad y sin mala intención: el navegador guarda la dirección de acceso
 * con su `?volver=`, y bastaba haber abierto una vez la cocina de otro comercio
 * —o una que ya no existe— para que cada acceso posterior aterrizara ahí, en un
 * tablero ajeno o en un error.
 *
 * No sustituye a la autorización del servidor, que ya devuelve 403 sobre los
 * datos de otro comercio. Esto evita el viaje: llevar a alguien a una pantalla
 * que le va a decir que no es suya es una forma cara de decir "no".
 *
 * El administrador no tiene comercio propio y sí necesita entrar a cualquiera,
 * así que para él el `volver` se respeta tal cual.
 */
export function destinoTrasEntrar(args: {
  volver: string | null;
  rol: string;
  /** Comercio que opera la cuenta. `null` para el administrador. */
  comercioSlug: string | null;
}): string {
  const { volver, rol, comercioSlug } = args;
  const propio = comercioSlug ? `/cocina/${comercioSlug}` : "/";
  const porDefecto = rol === "ADMIN" ? "/panel" : propio;

  if (!esRutaSegura(volver)) return porDefecto;

  if (rol === "COMERCIO" && comercioSlug) {
    // `/cocina/<slug>` y `/comercio/<slug>` son las dos rutas que pertenecen a
    // un comercio concreto. El resto —el perfil, los avisos— es de la persona y
    // no hace falta filtrarlo.
    const m = volver!.match(/^\/(?:cocina|comercio)\/([^/?#]+)/);
    if (m && m[1] !== comercioSlug) return propio;
  }

  return volver!;
}
