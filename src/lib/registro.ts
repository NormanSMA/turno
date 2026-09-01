/**
 * Registro estructurado: una línea, un objeto JSON, un hecho.
 *
 * Hasta acá los errores salían como `console.error("[turno] …", e)`. Eso se lee
 * bien en una terminal y es inútil en cualquier otro lado: no se puede filtrar
 * por ruta, ni agrupar por tipo, ni seguir una petición concreta entre miles.
 * Cuando algo falla en producción, lo que se necesita no es un mensaje bonito
 * — es poder preguntar *"¿qué más pasó en esta misma petición?"*.
 *
 * De ahí el `peticionId`: se genera una vez en el middleware, viaja en la
 * cabecera y aparece en todo lo que se registre durante esa petición. También
 * vuelve al cliente en `x-request-id`, así que un estudiante que reporta un
 * error puede dar un identificador y eso alcanza para encontrar la traza.
 *
 * **Qué NO entra acá.** Correos, tokens, códigos de retiro, cuerpos de
 * petición. Un log es un lugar donde los datos personales se quedan mucho
 * tiempo, se copian a servicios de terceros y sobreviven a cualquier borrado
 * que el usuario pida. Este proyecto ya tuvo un hallazgo por imprimir un enlace
 * mágico completo (T‑24); la regla que dejó es que al registro va lo que
 * describe el hecho, no lo que identifica a la persona.
 */

/** Los niveles que se usan. No hay `debug`: si no vale en producción, no va. */
type Nivel = "info" | "aviso" | "error";

export interface Contexto {
  /** Identificador de la petición. Lo pone el middleware. */
  peticionId?: string;
  /** Ruta sin parámetros: `/api/pedidos`, no `/api/pedidos/abc-123`. */
  ruta?: string;
  metodo?: string;
  /** Código HTTP con el que se respondió. */
  estado?: number;
  /** Duración en milisegundos, cuando se mide. */
  ms?: number;
  [clave: string]: unknown;
}

/**
 * Un error, reducido a lo que sirve para diagnosticar.
 *
 * Se guarda el nombre, el mensaje y la pila; no el objeto entero, que en el
 * caso de Prisma trae la consulta con sus parámetros — y ahí van correos y
 * códigos.
 */
function describir(e: unknown) {
  if (e instanceof Error) {
    return {
      tipo: e.name,
      mensaje: e.message,
      // La pila se recorta: lo que importa es dónde nació, no el camino entero
      // por dentro de las dependencias.
      pila: e.stack?.split("\n").slice(0, 6).join("\n"),
    };
  }
  return { tipo: "desconocido", mensaje: String(e) };
}

function emitir(nivel: Nivel, evento: string, ctx: Contexto = {}) {
  const linea = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    evento,
    ...ctx,
  });

  // `console.error` para los errores porque muchas plataformas separan los dos
  // flujos y solo alertan sobre el segundo.
  if (nivel === "error") console.error(linea);
  else console.log(linea);
}

export function info(evento: string, ctx?: Contexto) {
  emitir("info", evento, ctx);
}

export function aviso(evento: string, ctx?: Contexto) {
  emitir("aviso", evento, ctx);
}

export function error(evento: string, e: unknown, ctx?: Contexto) {
  emitir("error", evento, { ...ctx, error: describir(e) });
}

/**
 * Lee el identificador que el middleware puso en la petición.
 *
 * Devuelve `undefined` en vez de inventar uno: un identificador fabricado acá
 * no coincidiría con el que el cliente recibió, y un identificador que no se
 * puede cruzar es peor que ninguno, porque parece que sirve.
 */
export function peticionIdDe(req: Request): string | undefined {
  return req.headers.get("x-request-id") ?? undefined;
}

/**
 * La ruta sin sus partes variables.
 *
 * `/api/pedidos/9f3a…` y `/api/pedidos/7b21…` son la misma ruta para quien
 * mira los registros; dejarlas distintas hace que agrupar por ruta no sirva
 * para nada. Se reemplaza cualquier segmento que parezca un identificador.
 */
export function rutaDe(req: Request): string {
  try {
    const { pathname } = new URL(req.url);
    return pathname
      .split("/")
      .map((seg) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^\d+$/.test(seg)
          ? ":id"
          : seg,
      )
      .join("/");
  } catch {
    return "desconocida";
  }
}
