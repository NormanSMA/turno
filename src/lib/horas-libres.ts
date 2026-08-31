import { prisma } from "@/lib/db";
import { proximaHoraLibre, type FranjaCandidata } from "@/core/proxima-hora";

/**
 * La próxima hora libre de varios comercios, en dos consultas.
 *
 * Vive acá y no en cada página porque el dato aparece en dos pantallas
 * —la portada y Explorar— y la regla que lo calcula es la del motor de
 * admisión: si una copia se desincroniza de la otra, una de las dos pantallas
 * empieza a prometer horas que la reserva rechaza. La decisión pura está en
 * `core/proxima-hora`; acá solo se consigue lo que necesita.
 *
 * Dos consultas para N comercios, no dos por comercio: la lista se dibuja
 * entera en cada carga de la portada.
 *
 * Devuelve la franja completa, no solo su hora: la portada muestra a qué hora
 * empieza y Explorar cuántos minutos faltan para que cierre. Dos lecturas del
 * mismo hecho.
 */
export async function horasLibresPorComercio(
  comercios: readonly {
    id: string;
    factorSeguridad: unknown;
    margenCutoffMin: number;
  }[],
  ahora: Date,
): Promise<Map<string, FranjaCandidata | null>> {
  const ids = comercios.map((c) => c.id);
  if (ids.length === 0) return new Map();

  const [franjas, masRapidos] = await Promise.all([
    prisma.franja.findMany({
      where: { comercioId: { in: ids }, abierta: true, fin: { gt: ahora } },
      orderBy: { inicio: "asc" },
      select: {
        comercioId: true,
        inicio: true,
        fin: true,
        capacidadMinutos: true,
        cargaAsignada: true,
      },
    }),
    // Lo más rápido que cada comercio puede preparar hoy. Solo lo anticipable
    // y disponible: un plato que no se puede pedir por adelantado no habilita
    // ninguna hora.
    prisma.producto.groupBy({
      by: ["comercioId"],
      where: {
        comercioId: { in: ids },
        anticipable: true,
        disponible: true,
        archivado: false,
      },
      _min: { tiempoPreparacionMin: true },
    }),
  ]);

  const rapido = new Map(
    masRapidos.map((m) => [m.comercioId, m._min.tiempoPreparacionMin]),
  );

  const porComercio = new Map<string, FranjaCandidata[]>();
  for (const f of franjas) {
    const lista = porComercio.get(f.comercioId) ?? [];
    lista.push(f);
    porComercio.set(f.comercioId, lista);
  }

  return new Map(
    comercios.map((c) => [
      c.id,
      proximaHoraLibre(
        porComercio.get(c.id) ?? [],
        {
          factorSeguridad: Number(c.factorSeguridad),
          margenCutoffMin: c.margenCutoffMin,
          minutosMasRapido: rapido.get(c.id) ?? null,
        },
        ahora,
      ),
    ]),
  );
}
