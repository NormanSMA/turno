/**
 * Esquemas de entrada. Todo lo que llega del cliente pasa por acá.
 *
 * El cliente manda IDs y cantidades; NUNCA precios, cargas ni tiempos de
 * preparación. Aceptar un `total` del navegador sería confiar en el atacante
 * para calcular cuánto debe pagar.
 */
import { z } from "zod";

export const esquemaEnlace = z.object({
  correo: z.string().trim().toLowerCase().email().max(160),
  facultad: z.string().trim().max(120).optional().nullable(),
  carrera: z.string().trim().max(120).optional().nullable(),
  anio: z.number().int().min(1).max(10).optional().nullable(),
  frecuenciaCompraPrevia: z.string().trim().max(60).optional().nullable(),
  consentimiento: z.boolean().optional(),
  canalCaptacion: z.string().trim().max(60).optional().nullable(),
  /// Ruta interna a la que volver tras entrar. Se valida que sea relativa: un
  /// destino absoluto convertiría el enlace de acceso en un redirector abierto.
  volver: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/(?!\/)[\w\-/[\]().?=&%]*$/, "Destino no permitido")
    .optional()
    .nullable(),
});

export const esquemaCanje = z.object({
  token: z.string().min(20).max(200),
});

export const esquemaPedido = z.object({
  comercioId: z.uuid(),
  franjaId: z.uuid(),
  items: z
    .array(
      z.object({
        productoId: z.uuid(),
        cantidad: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(15),
  canalCaptacion: z.string().trim().max(60).optional().nullable(),
});

export const esquemaCambioEstado = z.object({
  estado: z.enum([
    "EN_PREPARACION",
    "LISTO",
    "RETIRADO",
    "NO_SHOW",
    "CANCELADO",
  ]),
  nota: z.string().trim().max(280).optional(),
});

export type EntradaPedido = z.infer<typeof esquemaPedido>;

// ------------------------------------------- Administración del comercio ---

export const esquemaParametros = z
  .object({
    personalCocina: z.number().int().min(1).max(20).optional(),
    anchoFranjaMin: z.number().int().min(5).max(60).optional(),
    factorSeguridad: z.number().min(0.3).max(1).optional(),
    tiempoMinAnticipable: z.number().int().min(0).max(30).optional(),
    margenCutoffMin: z.number().int().min(0).max(30).optional(),
    minutosNoShow: z.number().int().min(5).max(120).optional(),
    maxPedidosActivos: z.number().int().min(1).max(20).optional(),
    estadoOperacion: z.enum(["ABIERTO", "PAUSADO", "CERRADO"]).optional(),
  })
  // Un PATCH vacío no es un error del cliente pero tampoco un cambio: se
  // rechaza para que no ensucie la auditoría con entradas sin contenido.
  .refine((o) => Object.keys(o).length > 0, {
    message: "No hay ningún cambio en la solicitud",
  });

export const esquemaProductoNuevo = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().max(240).optional().nullable(),
  imagenUrl: z.url().max(500).optional().nullable(),
  precio: z.number().min(0).max(100000),
  tiempoPreparacionMin: z.number().int().min(0).max(120),
  anticipable: z.boolean().optional(),
  disponible: z.boolean().optional(),
});

export const esquemaProductoCambio = z
  .object({
    nombre: z.string().trim().min(2).max(80).optional(),
    descripcion: z.string().trim().max(240).optional().nullable(),
    imagenUrl: z.url().max(500).optional().nullable(),
    precio: z.number().min(0).max(100000).optional(),
    tiempoPreparacionMin: z.number().int().min(0).max(120).optional(),
    anticipable: z.boolean().optional(),
    disponible: z.boolean().optional(),
    archivado: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "No hay ningún cambio en la solicitud",
  });

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const esquemaGenerarFranjas = z.object({
  desde: z.string().regex(FECHA, "Formato AAAA-MM-DD"),
  hasta: z.string().regex(FECHA, "Formato AAAA-MM-DD"),
  horaInicio: z.string().regex(HORA, "Formato HH:MM"),
  horaFin: z.string().regex(HORA, "Formato HH:MM"),
  capacidadMinutos: z.number().int().min(1).max(600).optional(),
});

export const esquemaFranjaCambio = z
  .object({
    capacidadMinutos: z.number().int().min(0).max(600).optional(),
    abierta: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "No hay ningún cambio en la solicitud",
  });

/**
 * Suscripción de un dispositivo a Web Push (ADR-14).
 *
 * El endpoint lo emite el servicio de push del navegador (FCM, Mozilla, Apple)
 * y es una URL absoluta que este servidor va a llamar. Se acota a https por lo
 * mismo que `RNF-15` acota el destino de `volver`: una URL arbitraria en un
 * campo que el servidor luego visita es una petición del lado del servidor
 * regalada a quien controle el cliente.
 */
export const esquemaSuscripcionPush = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), {
    message: "El endpoint de push tiene que ser https",
  }),
  // Claves del cliente en base64url. La longitud está acotada porque son de
  // tamaño fijo por especificación: 65 bytes y 16 bytes codificados.
  p256dh: z.string().min(20).max(200),
  auth: z.string().min(10).max(100),
});

export const esquemaBajaPush = z.object({
  endpoint: z.url().max(1000),
});

/**
 * Datos que el estudiante puede cambiar de su propio perfil.
 *
 * Nótese qué NO está acá: el correo, el rol y la condición experimental. El
 * correo es la identidad y cambiarlo sería cambiar de cuenta; el rol lo asigna
 * el equipo; y la condición se asigna una vez y no cambia nunca (RF-11). Un
 * PATCH de perfil que aceptara cualquiera de los tres sería una escalada de
 * privilegios servida por el propio formulario.
 */
export const esquemaPerfil = z
  .object({
    // 80 alcanza para un nombre completo con apellidos compuestos. El vacío se
    // acepta y se traduce a `null`: borrar el nombre es una intención válida.
    nombre: z.string().trim().max(80).nullable().optional(),
    facultad: z.string().trim().max(120).nullable().optional(),
    carrera: z.string().trim().max(120).nullable().optional(),
    anio: z.number().int().min(1).max(10).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "No hay ningún cambio en la solicitud",
  });
