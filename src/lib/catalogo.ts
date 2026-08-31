/**
 * Consultas de lectura del catálogo y de las franjas.
 *
 * El menú se ve SIN iniciar sesión (§11.3): la identidad se pide recién al
 * confirmar el pedido. Pero la sugerencia de franja sí depende de la condición
 * experimental del usuario, así que se calcula con la sesión cuando existe y
 * con la condición A por defecto cuando no.
 */

import { prisma } from "./db";
import {
  calcularOpcionesConCutoff,
  tiempoPreparacionMaximo,
  type CondicionExperimental,
  type FranjaCapacidad,
  type LineaPedido,
} from "@/core/admision";

export async function menuDe(slug: string) {
  const comercio = await prisma.comercio.findUnique({
    where: { slug },
    include: {
      productos: {
        where: { archivado: false },
        orderBy: [{ anticipable: "desc" }, { nombre: "asc" }],
      },
    },
  });
  if (!comercio) return null;

  return {
    comercio: {
      id: comercio.id,
      nombre: comercio.nombre,
      slug: comercio.slug,
      ubicacion: comercio.ubicacion,
      estadoOperacion: comercio.estadoOperacion,
      anchoFranjaMin: comercio.anchoFranjaMin,
      tiempoMinAnticipable: comercio.tiempoMinAnticipable,
    },
    productos: comercio.productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      imagenUrl: p.imagenUrl,
      precio: String(p.precio),
      tiempoPreparacionMin: p.tiempoPreparacionMin,
      // `anticipable` es la decisión del comercio; la elegibilidad efectiva
      // incorpora además el criterio t(p) >= t_min y la disponibilidad.
      anticipable: p.anticipable,
      disponible: p.disponible,
      elegible:
        p.anticipable &&
        p.disponible &&
        p.tiempoPreparacionMin >= comercio.tiempoMinAnticipable,
    })),
  };
}

export interface ConsultaFranjas {
  slug: string;
  items: { productoId: string; cantidad: number }[];
  condicion: CondicionExperimental;
  ahora?: Date;
}

/**
 * Devuelve las franjas ofrecidas para un carrito concreto, ya filtradas por
 * capacidad y por cut-off, y con la sugerencia marcada según A o B.
 *
 * Es una PROYECCIÓN, no una reserva: no toca la capacidad. La reserva ocurre
 * únicamente al confirmar (§12 de la auditoría: no hay carritos que bloqueen
 * capacidad, así que no hay capacidad desperdiciada por gente que abandona).
 */
export async function franjasPara(consulta: ConsultaFranjas) {
  const ahora = consulta.ahora ?? new Date();

  const comercio = await prisma.comercio.findUnique({
    where: { slug: consulta.slug },
  });
  if (!comercio) return null;

  const productos = await prisma.producto.findMany({
    where: {
      comercioId: comercio.id,
      id: { in: consulta.items.map((i) => i.productoId) },
    },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  const lineas: LineaPedido[] = [];
  for (const item of consulta.items) {
    const p = porId.get(item.productoId);
    if (!p) continue;
    lineas.push({
      cantidad: item.cantidad,
      producto: {
        id: p.id,
        tiempoPreparacionMin: p.tiempoPreparacionMin,
        anticipable: p.anticipable,
        disponible: p.disponible,
      },
    });
  }

  const carga = lineas.reduce(
    (a, l) => a + l.producto.tiempoPreparacionMin * l.cantidad,
    0,
  );

  const filas = await prisma.franja.findMany({
    where: { comercioId: comercio.id, abierta: true, fin: { gt: ahora } },
    orderBy: { inicio: "asc" },
  });

  const franjas: FranjaCapacidad[] = filas.map((f) => ({
    id: f.id,
    inicio: f.inicio,
    fin: f.fin,
    capacidadMinutos: f.capacidadMinutos,
    cargaAsignada: f.cargaAsignada,
    abierta: f.abierta,
  }));

  const r = calcularOpcionesConCutoff(
    franjas,
    lineas,
    carga,
    Number(comercio.factorSeguridad),
    consulta.condicion,
    ahora,
    comercio.margenCutoffMin,
    null,
    8,
  );

  const total = lineas.reduce(
    (a, l) => a + Number(porId.get(l.producto.id)!.precio) * l.cantidad,
    0,
  );

  /*
   * Hasta qué hora se puede reservar cada franja (§03, §04, §06).
   *
   * Es el cut-off del modelo, despejado: `fin − (t_max + margen)`. Se calcula
   * acá y no en el navegador porque los dos ingredientes —el producto más lento
   * del carrito y el margen del comercio— viven en el servidor, y una cuenta
   * regresiva basada en un número que el cliente adivina es peor que ninguna.
   *
   * El estudiante no ve la fórmula: ve "cierra en 3 min". Antes, una franja
   * simplemente desaparecía entre dos recargas y parecía un error.
   */
  const tMax = tiempoPreparacionMaximo(lineas);
  const cierreDe = (fin: Date): string =>
    new Date(fin.getTime() - (tMax + comercio.margenCutoffMin) * 60_000).toISOString();

  return {
    comercioId: comercio.id,
    cargaEstimadaMin: carga,
    total: total.toFixed(2),
    condicion: consulta.condicion,
    sugeridaId: r.sugeridaId,
    opciones: r.opciones.map((o) => {
      const f = franjas.find((x) => x.id === o.franjaId)!;
      return {
        franjaId: o.franjaId,
        inicio: o.inicio.toISOString(),
        fin: o.fin.toISOString(),
        holguraMin: Math.floor(o.holguraMin),
        cierraEn: cierreDe(o.fin),
        // La capacidad efectiva se expone para que la regla de franjas pueda
        // dibujar la ocupación real; sin ella la barra no significaría nada.
        capacidadEfectivaMin: Math.floor(
          f.capacidadMinutos * Number(comercio.factorSeguridad),
        ),
        sugerida: o.sugerida,
      };
    }),
  };
}
