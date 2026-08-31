/**
 * Centro de incidentes (§36). Los mismos números de la consola, convertidos en
 * una lista corta de "qué está mal ahora", por gravedad: un tablero muestra
 * todo, un centro de incidentes solo lo que exige una decisión.
 *
 * **Si no hay nada, la lista va vacía y se dice.** Un centro que siempre tiene
 * algo en amarillo entrena a ignorarlo.
 */

export type Gravedad = "CRITICO" | "ALTO" | "MEDIO";

export interface Incidente {
  id: string;
  gravedad: Gravedad;
  titulo: string;
  detalle: string;
  /** Qué hacer. `null` cuando solo hay que observar. */
  accion: string | null;
}

export interface SenalesSistema {
  /** Latencia real de la base, medida con una consulta de verdad. */
  baseMs: number;
  /** Notificaciones que llevan rato sin salir. */
  notificacionesPendientes: number;
  /** Notificaciones que agotaron sus reintentos. */
  notificacionesFallidas: number;
  /** Suscripciones push descartadas por fallar repetidamente. */
  dispositivosDescartados: number;
  comercios: {
    nombre: string;
    /** El comercio no acepta pedidos nuevos ahora. */
    saturado: boolean;
    estadoOperacion: string;
    /** Franjas abiertas por delante. Cero = no puede vender. */
    franjasFuturas: number;
  }[];
  /** Pedidos que pasaron su ventana sin salir de cocina. */
  pedidosAtrasados: number;
}

/** Por encima de esto la base ya no responde a ritmo de mostrador. */
const BASE_LENTA_MS = 400;
const BASE_CRITICA_MS = 1500;

export function detectarIncidentes(s: SenalesSistema): Incidente[] {
  const out: Incidente[] = [];

  // La base primero: sin ella no hay pedidos, ni cocina, ni retiro.
  if (s.baseMs >= BASE_CRITICA_MS) {
    out.push({
      id: "base-critica",
      gravedad: "CRITICO",
      titulo: "La base de datos casi no responde",
      detalle: `Una consulta trivial tardó ${s.baseMs} ms. A este ritmo, confirmar un pedido se siente roto.`,
      accion: "Revisar la base antes que cualquier otra cosa de esta lista.",
    });
  } else if (s.baseMs >= BASE_LENTA_MS) {
    out.push({
      id: "base-lenta",
      gravedad: "MEDIO",
      titulo: "La base va lenta",
      detalle: `Una consulta trivial tardó ${s.baseMs} ms.`,
      accion: null,
    });
  }

  // Un pedido atrasado es una promesa incumplida en curso, no una estadística.
  if (s.pedidosAtrasados > 0) {
    out.push({
      id: "pedidos-atrasados",
      gravedad: s.pedidosAtrasados >= 5 ? "CRITICO" : "ALTO",
      titulo: `${s.pedidosAtrasados} ${s.pedidosAtrasados === 1 ? "pedido pasó" : "pedidos pasaron"} su hora sin salir de cocina`,
      detalle:
        "Son estudiantes esperando algo que ya debería estar listo. Es el incumplimiento que el producto promete no tener.",
      accion: "Llamar al comercio. Si no da abasto, conviene pausarle pedidos.",
    });
  }

  for (const c of s.comercios) {
    if (c.estadoOperacion === "ABIERTO" && c.franjasFuturas === 0) {
      // El fallo silencioso más caro: se ve abierto y no hay ni una hora que
      // elegir. Desde afuera parece que la aplicación está rota.
      out.push({
        id: `sin-franjas-${c.nombre}`,
        gravedad: "ALTO",
        titulo: `${c.nombre} está abierto pero sin horas`,
        detalle:
          "Se muestra disponible y no tiene ni una franja futura: quien entre no va a poder pedir nada.",
        accion: "Generarle franjas o cerrarlo hasta que las tenga.",
      });
    } else if (c.saturado) {
      out.push({
        id: `saturado-${c.nombre}`,
        gravedad: "MEDIO",
        titulo: `${c.nombre} está rechazando pedidos por capacidad`,
        detalle:
          "No es un error: el control de admisión está haciendo su trabajo. Pero si pasa todos los días, la capacidad declarada se quedó corta.",
        accion: null,
      });
    }
  }

  if (s.notificacionesFallidas > 0) {
    out.push({
      id: "avisos-fallidos",
      gravedad: "ALTO",
      titulo: `${s.notificacionesFallidas} avisos no se pudieron entregar`,
      detalle:
        "Cada uno es un estudiante que no supo que su pedido estaba listo. Es la causa directa de un no-show.",
      accion: "Revisar la configuración de push y de correo.",
    });
  }

  if (s.notificacionesPendientes > 20) {
    out.push({
      id: "avisos-encolados",
      gravedad: "MEDIO",
      titulo: `${s.notificacionesPendientes} avisos esperando salir`,
      detalle:
        "La bandeja de salida se está acumulando: puede ser que el cron no esté corriendo.",
      accion: "Verificar que el cron de mantenimiento se esté ejecutando.",
    });
  }

  if (s.dispositivosDescartados > 0) {
    out.push({
      id: "dispositivos",
      gravedad: "MEDIO",
      titulo: `${s.dispositivosDescartados} dispositivos dejaron de recibir avisos`,
      detalle:
        "Se descartaron tras fallar varias veces seguidas. Es normal cuando alguien desinstala o cambia de teléfono.",
      accion: null,
    });
  }

  const orden: Record<Gravedad, number> = { CRITICO: 0, ALTO: 1, MEDIO: 2 };
  return out.sort((a, b) => orden[a.gravedad] - orden[b.gravedad]);
}
