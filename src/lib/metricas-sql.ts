/**
 * Agregados del panel calculados en la base.
 *
 * Producen lo mismo que `cargaPorHoraDelDia` y `cumplimientoPorDia` de
 * `core/metricas`, que siguen siendo la verdad de prueba: `tests/metricas-sql`
 * compara ambas salidas sobre los mismos pedidos. El filtro es sobre
 * `pedido.creadoEn` y, si se indica, sobre el slug del comercio.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  CondicionExperimental,
  PuntoDia,
  PuntoFranja,
} from "@/core/metricas";


type Db = Pick<PrismaClient, "$queryRaw">;

export interface FiltroMetricas {
  desde: Date;
  hasta: Date;
  comercio?: string | null;
}

function donde(f: FiltroMetricas) {
  return Prisma.sql`p."creadoEn" >= ${f.desde} AND p."creadoEn" <= ${f.hasta}
    ${f.comercio ? Prisma.sql`AND c.slug = ${f.comercio}` : Prisma.empty}`;
}

export async function cumplimientoPorDiaSql(
  db: Db,
  f: FiltroMetricas,
): Promise<PuntoDia[]> {
  const filas = await db.$queryRaw<
    { dia: string; total: bigint; veredicto: bigint; cumplidos: bigint }[]
  >`
    SELECT to_char(fr.inicio AT TIME ZONE 'America/Managua', 'YYYY-MM-DD') AS dia,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE p.cumplimiento IN ('CUMPLIDO', 'INCUMPLIDO')) AS veredicto,
           COUNT(*) FILTER (WHERE p.cumplimiento = 'CUMPLIDO') AS cumplidos
    FROM pedido p
    JOIN franja fr ON fr.id = p."franjaId"
    JOIN comercio c ON c.id = fr."comercioId"
    WHERE ${donde(f)}
    GROUP BY dia
    ORDER BY dia
  `;
  return filas.map((r) => ({
    dia: r.dia,
    pedidos: Number(r.total),
    tasaCumplimiento:
      Number(r.veredicto) === 0 ? null : Number(r.cumplidos) / Number(r.veredicto),
  }));
}

export async function cargaPorHoraSql(
  db: Db,
  f: FiltroMetricas,
  condicion: CondicionExperimental | "TODAS" = "TODAS",
): Promise<PuntoFranja[]> {
  const filas = await db.$queryRaw<{ hora: string; carga: bigint }[]>`
    SELECT to_char(fr.inicio AT TIME ZONE 'America/Managua', 'HH24:MI') AS hora,
           SUM(p."cargaEstimadaMin") AS carga
    FROM pedido p
    JOIN franja fr ON fr.id = p."franjaId"
    JOIN comercio c ON c.id = fr."comercioId"
    WHERE ${donde(f)}
      AND p.estado <> 'CANCELADO'
      ${condicion === "TODAS" ? Prisma.empty : Prisma.sql`AND p."condicionExperimental"::text = ${condicion}`}
    GROUP BY hora
    ORDER BY hora
  `;
  return filas.map((r) => ({ hora: r.hora, cargaMin: Number(r.carga) }));
}

/** Totales del panel: pedidos del rango, estudiantes y estudiantes activados. */
export async function conteosSql(db: Db, f: FiltroMetricas) {
  const [r] = await db.$queryRaw<
    { pedidos: bigint; usuarios: bigint; activados: bigint }[]
  >`
    SELECT
      (SELECT COUNT(*) FROM pedido p
         JOIN franja fr ON fr.id = p."franjaId"
         JOIN comercio c ON c.id = fr."comercioId"
         WHERE ${donde(f)}) AS pedidos,
      (SELECT COUNT(*) FROM usuario WHERE rol = 'ESTUDIANTE') AS usuarios,
      (SELECT COUNT(*) FROM usuario
         WHERE rol = 'ESTUDIANTE' AND "primerPedidoEn" IS NOT NULL) AS activados
  `;
  return {
    pedidos: Number(r!.pedidos),
    usuarios: Number(r!.usuarios),
    activados: Number(r!.activados),
  };
}
