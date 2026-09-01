/**
 * GET /api/admin/metricas — panel del piloto. Solo ADMIN.
 *
 * `?formato=csv` exporta datos CRUDOS: el análisis final se hace fuera y tiene
 * que ser reproducible por un tercero. Un panel que solo muestra agregados no
 * permite auditar el cálculo.
 *
 * `?datos=pedidos` (por defecto) o `?datos=franjas`. Todo pasa por `core/csv`,
 * que escapa según RFC 4180: `canalCaptacion` es texto libre y una coma sin
 * escapar corre las columnas de esa fila sin que nadie lo note.
 */
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/auth";
import { manejarError, ok } from "@/lib/http";
import { aCsv, nombreArchivo } from "@/core/csv";
import {
  cargaPorHoraDelDia,
  compararAB,
  cumplimientoPorDia,
  embudoPorCanal,
  tiempoActivacionMedianaMin,
  type PedidoMetrica,
} from "@/core/metricas";
import {
  preguntasCuantitativas,
  promedioMinutos,
  resumirMicro,
  resumirSus,
} from "@/core/encuestas";

export async function GET(req: Request) {
  try {
    await exigirRol("ADMIN");

    /*
     * Se piden las columnas que se usan, no la fila entera.
     *
     * `include: { franja: true }` traía todas las columnas de `pedido` y todas
     * las de `franja` para quedarse con doce campos. Medido sobre el mes de
     * datos de demostración —1374 pedidos—: **1273 KB y 173 ms contra 552 KB y
     * 73 ms**. La diferencia crece con el piloto, y este endpoint se recarga
     * cada vez que alguien mira el panel.
     *
     * El grano fino sí hace falta: las métricas del Capítulo V se calculan en
     * `core/metricas`, que son funciones puras y auditables sobre los pedidos
     * uno por uno. Reescribirlas como agregados de SQL las volvería imposibles
     * de verificar con una prueba, que es justo lo que las hace defendibles.
     * Lo que no hacía falta era traer columnas que nadie mira.
     */
    const filas = await prisma.pedido.findMany({
      select: {
        id: true,
        condicionExperimental: true,
        franjaId: true,
        cargaEstimadaMin: true,
        estado: true,
        cumplimiento: true,
        creadoEn: true,
        listoEn: true,
        retiradoEn: true,
        canalCaptacion: true,
        franja: { select: { inicio: true, fin: true } },
      },
      orderBy: { creadoEn: "asc" },
    });

    const pedidos: PedidoMetrica[] = filas.map((p) => ({
      id: p.id,
      condicionExperimental: p.condicionExperimental,
      franjaId: p.franjaId,
      cargaEstimadaMin: p.cargaEstimadaMin,
      estado: p.estado,
      cumplimiento: p.cumplimiento,
      creadoEn: p.creadoEn,
      franjaInicio: p.franja.inicio,
      franjaFin: p.franja.fin,
      listoEn: p.listoEn,
      retiradoEn: p.retiradoEn,
      canalCaptacion: p.canalCaptacion,
    }));

    const url = new URL(req.url);
    if (url.searchParams.get("formato") === "csv") {
      /*
       * Dos conjuntos, no uno.
       *
       * `pedidos` es el grano fino para el análisis; `franjas` responde la
       * pregunta de capacidad —cuánto se comprometió contra cuánto cabía— que
       * antes solo se podía reconstruir a mano cruzando filas.
       */
      const conjunto = url.searchParams.get("datos") === "franjas" ? "franjas" : "pedidos";

      const rango = filas.length
        ? [filas[0]!.creadoEn, filas[filas.length - 1]!.creadoEn]
        : [new Date(), new Date()];

      let contenido: string;

      if (conjunto === "franjas") {
        const franjas = await prisma.franja.findMany({
          include: { comercio: { select: { nombre: true, factorSeguridad: true } } },
          orderBy: { inicio: "asc" },
        });
        contenido = aCsv(
          [
            "franja_id", "comercio", "inicio", "fin", "abierta",
            "capacidad_min", "capacidad_efectiva_min", "carga_asignada_min",
            "ocupacion",
          ],
          franjas.map((f) => {
            const efectiva = f.capacidadMinutos * Number(f.comercio.factorSeguridad);
            return [
              f.id, f.comercio.nombre, f.inicio, f.fin, f.abierta,
              f.capacidadMinutos,
              // Redondeada a dos decimales: alfa es decimal y el producto
              // arrastra ruido que en una hoja de cálculo se ve como precisión
              // que no existe.
              Math.round(efectiva * 100) / 100,
              f.cargaAsignada,
              efectiva > 0 ? Math.round((f.cargaAsignada / efectiva) * 1000) / 1000 : null,
            ];
          }),
        );
      } else {
        /*
         * Columnas derivadas, calculadas acá.
         *
         * Antes el archivo traía solo marcas de tiempo y quien analizara tenía
         * que restar fechas en la hoja de cálculo —que es donde se cometen los
         * errores y donde nadie los revisa—. Se agregan las tres diferencias
         * que el Capítulo V usa de verdad, en minutos.
         */
        const min = (a: Date | null, b: Date | null) =>
          a && b ? Math.round((a.getTime() - b.getTime()) / 60000) : null;

        contenido = aCsv(
          [
            "pedido_id", "condicion", "franja_id", "carga_min", "estado",
            "cumplimiento", "creado_en", "franja_inicio", "franja_fin",
            "listo_en", "retirado_en", "canal_captacion",
            "anticipacion_min", "preparacion_real_min", "espera_retiro_min",
            "dentro_de_ventana",
          ],
          pedidos.map((p) => [
            p.id, p.condicionExperimental, p.franjaId, p.cargaEstimadaMin,
            p.estado, p.cumplimiento, p.creadoEn, p.franjaInicio, p.franjaFin,
            p.listoEn, p.retiradoEn, p.canalCaptacion,
            // Cuánto antes de su ventana se pidió: es la variable que el
            // producto dice mover.
            min(p.franjaInicio, p.creadoEn),
            // Lo que la cocina tardó de verdad, contra el `t(p)` declarado.
            min(p.listoEn, p.creadoEn),
            // Cuánto esperó el pedido listo antes de que lo retiraran.
            min(p.retiradoEn, p.listoEn),
            p.retiradoEn
              ? p.retiradoEn >= p.franjaInicio && p.retiradoEn <= p.franjaFin
              : null,
          ]),
        );
      }

      return new Response(contenido, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${nombreArchivo(conjunto, rango[0]!, rango[1]!)}"`,
        },
      });
    }

    const respuestas = await prisma.respuesta.findMany({
      select: { tipo: true, pregunta: true, valores: true },
    });
    const sus = respuestas
      .filter((r) => r.tipo === "SUS")
      .map((r) => Number((r.valores as { puntaje?: number })?.puntaje ?? 0));

    // Los datos de caracterización se agregan; nunca se devuelven correos.
    const usuarios = await prisma.usuario.findMany({
      where: { rol: "ESTUDIANTE" },
      select: { canalCaptacion: true, primerPedidoEn: true, creadoEn: true },
    });

    // Los totales los cuenta la base. Traer filas para medir su `.length` es
    // pagar el transporte de todo el conjunto por un número que Postgres ya
    // sabe. Acá los datos ya están en memoria por las métricas del piloto, pero
    // el conteo de estudiantes activados sí se resuelve donde corresponde.
    const activados = await prisma.usuario.count({
      where: { rol: "ESTUDIANTE", primerPedidoEn: { not: null } },
    });

    return ok({
      generadoEn: new Date().toISOString(),
      totales: {
        usuarios: usuarios.length,
        pedidos: pedidos.length,
        activados,
      },
      comparacionAB: compararAB(pedidos),
      cargaPorHora: {
        a: cargaPorHoraDelDia(pedidos, "A"),
        b: cargaPorHoraDelDia(pedidos, "B"),
      },
      porDia: cumplimientoPorDia(pedidos),
      embudo: embudoPorCanal(usuarios),
      tiempoActivacionMedianaMin: tiempoActivacionMedianaMin(usuarios),
      usabilidad: resumirSus(sus),
      micro: resumirMicro(
        respuestas.filter((r) => r.tipo === "MICRO"),
      ),
      // Las preguntas con cifras se promedian: son las que se pueden contrastar
      // con el ahorro que el sistema calcula por su cuenta (indicador 1).
      microMinutos: preguntasCuantitativas().map((p) => ({
        pregunta: p.id,
        texto: p.texto,
        ...promedioMinutos(
          respuestas.filter((r) => r.tipo === "MICRO"),
          p.id,
        ),
      })),
    });
  } catch (e) {
    return manejarError(e);
  }
}
