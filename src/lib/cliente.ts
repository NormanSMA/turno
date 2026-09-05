/**
 * Cliente HTTP del navegador.
 *
 * Dos responsabilidades que no conviene repetir en cada componente:
 *  - traducir el error de la API a algo que se pueda mostrar tal cual
 *  - reintentar el POST de pedido de forma SEGURA, reusando la Idempotency-Key
 *
 * Ese segundo punto es el que resuelve el caso del WiFi del campus: si la
 * respuesta se pierde, el reintento no crea un segundo pedido.
 */

export class ErrorApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly status: number,
    readonly detalle?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

async function leer(res: Response) {
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export async function api<T>(
  ruta: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(ruta, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const datos = await leer(res);
  if (!res.ok) {
    throw new ErrorApi(
      datos?.codigo ?? "ERROR",
      datos?.error ?? "No se pudo completar la operación",
      res.status,
      datos?.detalle,
    );
  }
  return datos as T;
}

/**
 * Igual que `api`, pero además dice si la respuesta salió del caché local.
 *
 * El service worker marca con `X-Turno-Desde-Cache` lo que sirvió sin red. La
 * pantalla necesita esa distinción: mostrar el estado de un pedido sin avisar
 * que puede estar desactualizado es peor que no mostrarlo — el estudiante
 * creería que sigue en preparación cuando ya lo marcaron listo.
 */
export async function apiConFrescura<T>(
  ruta: string,
  init: RequestInit = {},
): Promise<{ datos: T; desdeCache: boolean }> {
  const res = await fetch(ruta, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const datos = await leer(res);
  if (!res.ok) {
    throw new ErrorApi(
      datos?.codigo ?? "ERROR",
      datos?.error ?? "No se pudo completar la operación",
      res.status,
      datos?.detalle,
    );
  }
  return {
    datos: datos as T,
    desdeCache: res.headers.get("X-Turno-Desde-Cache") === "1",
  };
}

export interface OpcionFranjaUI {
  franjaId: string;
  inicio: string;
  fin: string;
  holguraMin: number;
  capacidadEfectivaMin: number;
  /** ISO. Hasta cuándo se puede reservar esta franja: `fin − (t_max + margen)`. */
  cierraEn: string;
  sugerida: boolean;
}

export interface RespuestaFranjas {
  comercioId: string;
  cargaEstimadaMin: number;
  total: string;
  condicion: "A" | "B";
  sugeridaId: string | null;
  opciones: OpcionFranjaUI[];
}

export interface RespuestaPedido {
  pedidoId: string;
  codigo: string;
  franjaInicio: string;
  franjaFin: string;
  cargaEstimadaMin: number;
  total: string;
  reintento: boolean;
}

/**
 * Confirma el pedido con reintento seguro.
 *
 * La clave se genera UNA vez por intento de compra del usuario y se reutiliza en
 * cada reintento: es lo que convierte un timeout en "no sé si llegó" en "llegó
 * una sola vez". Sin esto, el botón de confirmar sería peligroso en mala red.
 */
export async function confirmarPedido(
  clave: string,
  cuerpo: {
    comercioId: string;
    franjaId: string;
    items: { productoId: string; cantidad: number }[];
    canalCaptacion?: string | null;
  },
  intentos = 3,
): Promise<RespuestaPedido> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await api<RespuestaPedido>("/api/pedidos", {
        method: "POST",
        headers: { "idempotency-key": clave },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      ultimo = e;
      // Solo se reintenta ante fallo de red o error del servidor. Un 409 (no
      // hay capacidad) o un 422 no mejoran reintentando: son respuestas.
      const reintentable =
        !(e instanceof ErrorApi) || e.status >= 500;
      if (!reintentable) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw ultimo;
}

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Managua",
  });
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Managua",
  });
}

export function cordobas(monto: string | number): string {
  return "C$ " + Number(monto).toLocaleString("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * El día de una fecha, en la zona del campus.
 *
 * Devuelve `AAAA-MM-DD` para comparar, no para mostrar. Existe porque
 * `toDateString()` resuelve el día en la zona del NAVEGADOR, mientras que
 * `horaCorta` fuerza la de Managua: con las dos mezcladas, la interfaz puede
 * decidir que dos franjas son de días distintos usando un reloj y pintar sus
 * horas con otro. Cerca de medianoche eso cambia lo que se ve.
 */
export function diaEnCampus(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Managua",
  });
}

/**
 * Cómo se nombra un día frente a hoy: "Hoy", "Mañana", o el día con su fecha.
 *
 * Un estudiante no piensa en "05-SEPT", piensa en "mañana". La fecha completa
 * solo aparece cuando ya no hay una palabra para el día, que es a partir de
 * pasado mañana.
 */
export function nombreDelDia(iso: string): string {
  const dia = diaEnCampus(iso);
  const hoy = diaEnCampus(new Date().toISOString());
  if (dia === hoy) return "Hoy";

  // Comparar por fecha de calendario y no sumando 24 h: un cambio de horario
  // haría que "mañana" cayera a 23 o 25 horas y la cuenta fallara ese día.
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  if (dia === diaEnCampus(manana.toISOString())) return "Mañana";

  return new Date(iso).toLocaleDateString("es-NI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Managua",
  });
}
