/**
 * Operaciones de administración del comercio.
 *
 * Todo cambio de configuración pasa por acá y deja rastro en `auditoria_admin`.
 * No es burocracia: el piloto declara en §16.2 que la versión evaluada está
 * congelada, así que si alguien mueve α a mitad del piloto, el Capítulo V tiene
 * que poder decir quién, cuándo y desde qué valor. Un cambio sin registrar
 * convierte una anomalía en los datos en un misterio sin explicación.
 */

import { prisma } from "./db";
import {
  franjasQueRomperia,
  validarCapacidadFranja,
  validarParametros,
  validarProducto,
  type ParametrosComercioEditables,
  type Resultado,
} from "@/core/administracion";
import { generarFranjas } from "@/core/franjas";
import { ESTADOS_ACTIVOS } from "@/core/estados";

export class CambioRechazado extends Error {
  readonly status = 422;
  constructor(
    readonly violaciones: { campo: string; motivo: string }[],
    mensaje = "El cambio no se puede aplicar",
  ) {
    super(mensaje);
    this.name = "CambioRechazado";
  }
}

async function auditar(
  actorId: string,
  accion: string,
  entidad: string,
  entidadId: string | null,
  antes: unknown,
  despues: unknown,
) {
  await prisma.auditoriaAdmin.create({
    data: {
      actorId,
      accion,
      entidad,
      entidadId,
      antes: antes as never,
      despues: despues as never,
    },
  });
}

function exigir(r: Resultado) {
  if (!r.valido) throw new CambioRechazado(r.violaciones);
}

// ------------------------------------------------------------ Parámetros ---

export async function actualizarParametros(
  comercioId: string,
  actorId: string,
  cambios: Partial<ParametrosComercioEditables>,
  ahora = new Date(),
) {
  exigir(validarParametros(cambios));

  const antes = await prisma.comercio.findUniqueOrThrow({
    where: { id: comercioId },
  });

  // Bajar α reduce la capacidad comprometible de todas las franjas a la vez.
  // Si alguna futura queda sobrevendida, se rechaza y se dice CUÁLES: el
  // operador tiene que poder decidir con la información delante.
  if (
    cambios.factorSeguridad !== undefined &&
    cambios.factorSeguridad < Number(antes.factorSeguridad)
  ) {
    const franjas = await prisma.franja.findMany({
      where: { comercioId, abierta: true, inicio: { gt: ahora } },
      select: { id: true, inicio: true, capacidadMinutos: true, cargaAsignada: true },
    });
    const rotas = franjasQueRomperia(franjas, cambios.factorSeguridad, ahora);
    if (rotas.length > 0) {
      throw new CambioRechazado(
        [
          {
            campo: "factorSeguridad",
            motivo:
              `Con α = ${cambios.factorSeguridad.toFixed(2)} quedarían ` +
              `${rotas.length} franja${rotas.length === 1 ? "" : "s"} con más ` +
              `pedidos de los que la cocina admitiría. Esperá a que pasen o ` +
              `cancelá esos pedidos primero.`,
          },
        ],
        "Bajar α dejaría franjas sobrevendidas",
      );
    }
  }

  const despues = await prisma.comercio.update({
    where: { id: comercioId },
    data: {
      personalCocina: cambios.personalCocina,
      anchoFranjaMin: cambios.anchoFranjaMin,
      factorSeguridad: cambios.factorSeguridad,
      tiempoMinAnticipable: cambios.tiempoMinAnticipable,
      margenCutoffMin: cambios.margenCutoffMin,
      minutosNoShow: cambios.minutosNoShow,
      maxPedidosActivos: cambios.maxPedidosActivos,
      estadoOperacion: cambios.estadoOperacion,
    },
  });

  await auditar(
    actorId,
    "COMERCIO_PARAMETROS",
    "comercio",
    comercioId,
    {
      personalCocina: antes.personalCocina,
      anchoFranjaMin: antes.anchoFranjaMin,
      factorSeguridad: String(antes.factorSeguridad),
      tiempoMinAnticipable: antes.tiempoMinAnticipable,
      margenCutoffMin: antes.margenCutoffMin,
      minutosNoShow: antes.minutosNoShow,
      maxPedidosActivos: antes.maxPedidosActivos,
      estadoOperacion: antes.estadoOperacion,
    },
    cambios,
  );

  return despues;
}

// -------------------------------------------------------------- Productos ---

export interface EntradaProducto {
  nombre?: string;
  descripcion?: string | null;
  imagenUrl?: string | null;
  precio?: number;
  tiempoPreparacionMin?: number;
  anticipable?: boolean;
  disponible?: boolean;
  archivado?: boolean;
}

export async function crearProducto(
  comercioId: string,
  actorId: string,
  datos: EntradaProducto,
) {
  exigir(
    validarProducto({
      nombre: datos.nombre,
      precio: datos.precio,
      tiempoPreparacionMin: datos.tiempoPreparacionMin,
    }),
  );

  const producto = await prisma.producto.create({
    data: {
      comercioId,
      nombre: datos.nombre!.trim(),
      descripcion: datos.descripcion ?? null,
      imagenUrl: datos.imagenUrl ?? null,
      precio: (datos.precio ?? 0).toFixed(2),
      tiempoPreparacionMin: datos.tiempoPreparacionMin ?? 0,
      anticipable: datos.anticipable ?? false,
      disponible: datos.disponible ?? true,
    },
  });

  await auditar(actorId, "PRODUCTO_ALTA", "producto", producto.id, null, {
    nombre: producto.nombre,
    precio: String(producto.precio),
    tiempoPreparacionMin: producto.tiempoPreparacionMin,
  });

  return producto;
}

export async function actualizarProducto(
  comercioId: string,
  productoId: string,
  actorId: string,
  datos: EntradaProducto,
) {
  exigir(
    validarProducto({
      nombre: datos.nombre,
      precio: datos.precio,
      tiempoPreparacionMin: datos.tiempoPreparacionMin,
    }),
  );

  const antes = await prisma.producto.findUniqueOrThrow({
    where: { id: productoId },
  });
  if (antes.comercioId !== comercioId) {
    throw new CambioRechazado(
      [{ campo: "productoId", motivo: "Ese producto no es de este comercio" }],
      "Producto ajeno",
    );
  }

  const despues = await prisma.producto.update({
    where: { id: productoId },
    data: {
      nombre: datos.nombre?.trim(),
      descripcion: datos.descripcion,
      imagenUrl: datos.imagenUrl,
      precio: datos.precio?.toFixed(2),
      tiempoPreparacionMin: datos.tiempoPreparacionMin,
      anticipable: datos.anticipable,
      disponible: datos.disponible,
      archivado: datos.archivado,
    },
  });

  // Solo se audita lo que cambió de verdad: un registro con cien entradas
  // idénticas no se lee, y el objetivo es poder explicar una anomalía.
  const cambiado: Record<string, [unknown, unknown]> = {};
  for (const campo of [
    "nombre",
    "precio",
    "tiempoPreparacionMin",
    "anticipable",
    "disponible",
    "archivado",
  ] as const) {
    const a = String(antes[campo]);
    const d = String(despues[campo]);
    if (a !== d) cambiado[campo] = [a, d];
  }
  if (Object.keys(cambiado).length > 0) {
    await auditar(
      actorId,
      "PRODUCTO_CAMBIO",
      "producto",
      productoId,
      Object.fromEntries(Object.entries(cambiado).map(([k, v]) => [k, v[0]])),
      Object.fromEntries(Object.entries(cambiado).map(([k, v]) => [k, v[1]])),
    );
  }

  return despues;
}

// ---------------------------------------------------------------- Franjas ---

export interface EntradaGenerarFranjas {
  /** Fecha local en formato YYYY-MM-DD. */
  desde: string;
  hasta: string;
  /** Hora local de apertura y cierre del servicio, HH:MM. */
  horaInicio: string;
  horaFin: string;
  capacidadMinutos?: number;
}

/**
 * Genera las franjas de un rango de días.
 *
 * Idempotente por construcción: la clave única (comercio, inicio) hace que
 * volver a generar el mismo día no duplique nada. Las franjas ya existentes
 * conservan su carga y su capacidad — regenerar NO puede borrar pedidos.
 */
export async function generarFranjasComercio(
  comercioId: string,
  actorId: string,
  entrada: EntradaGenerarFranjas,
) {
  const comercio = await prisma.comercio.findUniqueOrThrow({
    where: { id: comercioId },
  });

  const [h1, m1] = entrada.horaInicio.split(":").map(Number);
  const [h2, m2] = entrada.horaFin.split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => !Number.isFinite(n))) {
    throw new CambioRechazado([{ campo: "hora", motivo: "Hora inválida" }]);
  }

  const desde = new Date(`${entrada.desde}T00:00:00`);
  const hasta = new Date(`${entrada.hasta}T00:00:00`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    throw new CambioRechazado([{ campo: "desde", motivo: "Fecha inválida" }]);
  }
  if (hasta < desde) {
    throw new CambioRechazado([
      { campo: "hasta", motivo: "La fecha final es anterior a la inicial" },
    ]);
  }
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1;
  if (dias > 60) {
    throw new CambioRechazado([
      { campo: "hasta", motivo: "Máximo 60 días por vez" },
    ]);
  }

  // Se acumulan todas las franjas del rango y se insertan de una vez. Antes se
  // hacía un INSERT por franja: con 60 días y varias ventanas por día eso son
  // cientos de idas y vueltas a la base para una operación que es una sola.
  const porInsertar: { comercioId: string; inicio: Date; fin: Date; capacidadMinutos: number }[] = [];

  for (let d = 0; d < dias; d++) {
    const inicio = new Date(desde);
    inicio.setDate(inicio.getDate() + d);
    inicio.setHours(h1, m1, 0, 0);
    const fin = new Date(inicio);
    fin.setHours(h2, m2, 0, 0);
    if (fin <= inicio) continue;

    const franjas = generarFranjas({
      inicio,
      fin,
      anchoMin: comercio.anchoFranjaMin,
      personalCocina: comercio.personalCocina,
      capacidadMinutosPorFranja: entrada.capacidadMinutos,
    });

    porInsertar.push(...franjas.map((f) => ({ comercioId, ...f })));
  }

  // `skipDuplicates` deja intacta cualquier franja existente: regenerar un
  // rango nunca pisa la carga ya comprometida.
  const { count: creadas } = await prisma.franja.createMany({
    data: porInsertar,
    skipDuplicates: true,
  });

  await auditar(actorId, "FRANJAS_GENERADAS", "comercio", comercioId, null, {
    ...entrada,
    creadas,
    anchoFranjaMin: comercio.anchoFranjaMin,
  });

  return { creadas, dias };
}

export async function actualizarFranja(
  comercioId: string,
  franjaId: string,
  actorId: string,
  cambios: { capacidadMinutos?: number; abierta?: boolean },
) {
  const comercio = await prisma.comercio.findUniqueOrThrow({
    where: { id: comercioId },
  });
  const antes = await prisma.franja.findUniqueOrThrow({ where: { id: franjaId } });
  if (antes.comercioId !== comercioId) {
    throw new CambioRechazado(
      [{ campo: "franjaId", motivo: "Esa franja no es de este comercio" }],
      "Franja ajena",
    );
  }

  if (cambios.capacidadMinutos !== undefined) {
    exigir(
      validarCapacidadFranja(
        antes,
        cambios.capacidadMinutos,
        Number(comercio.factorSeguridad),
      ),
    );
  }

  const despues = await prisma.franja.update({
    where: { id: franjaId },
    data: {
      capacidadMinutos: cambios.capacidadMinutos,
      abierta: cambios.abierta,
    },
  });

  await auditar(
    actorId,
    "FRANJA_CAMBIO",
    "franja",
    franjaId,
    { capacidadMinutos: antes.capacidadMinutos, abierta: antes.abierta },
    cambios,
  );

  return despues;
}

/** Cuántos pedidos vivos tiene cada franja: el aviso antes de cerrarla. */
export async function pedidosVivosPorFranja(
  comercioId: string,
  desde: Date,
): Promise<Map<string, number>> {
  const filas = await prisma.pedido.groupBy({
    by: ["franjaId"],
    where: {
      franja: { comercioId, inicio: { gte: desde } },
      estado: { in: ESTADOS_ACTIVOS as unknown as never[] },
    },
    _count: true,
  });
  return new Map(filas.map((f) => [f.franjaId, f._count]));
}
