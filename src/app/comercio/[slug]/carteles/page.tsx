import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirComercio } from "@/lib/auth";
import { CANALES, enlaceDeCanal, qrSvg } from "@/lib/carteles";
import { MarcaTurno } from "@/components/marca";

export const dynamic = "force-dynamic";

/**
 * Carteles imprimibles, uno por canal de captación.
 *
 * Se renderizan en el servidor porque el QR se genera ahí: mandar la librería
 * de codificación al navegador para dibujar cuatro imágenes estáticas sería
 * gastar el presupuesto de red del estudiante en algo que solo mira el comercio.
 *
 * El texto del cartel dice el MECANISMO, no una promesa vaga. "Pedí antes,
 * llegá y retirá" describe qué hace el sistema; "la mejor app de comida" no
 * dice nada y no distingue a TURNO de un formulario.
 */
export default async function Pagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const comercio = await prisma.comercio.findUnique({ where: { slug } });
  if (!comercio) notFound();
  await exigirComercio(comercio.id);

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const carteles = await Promise.all(
    CANALES.map(async (c) => ({
      canal: c,
      url: enlaceDeCanal(base, slug, c.id),
      svg: await qrSvg(enlaceDeCanal(base, slug, c.id)),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 print:hidden">
        <Link href={`/comercio/${slug}`} className="etiqueta hover:text-tinta">
          ← Panel del comercio
        </Link>
        <h1 className="titulo mt-2 text-3xl">Carteles con QR</h1>
        <p className="mt-2 max-w-xl text-sm text-tinta-suave">
          Uno por lugar. Cada cartel lleva su propio código, así el panel puede
          decir cuál capta mejor — eso es un resultado del estudio, no un detalle
          de decoración. Imprimilos y pegá cada uno donde dice.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {carteles.map(({ canal, url, svg }) => (
          <article
            key={canal.id}
            className="break-inside-avoid rounded-lg border-2 border-marca-texto bg-papel-alto p-6 text-center"
          >
            <div className="mb-1 flex items-center justify-center gap-2">
              <MarcaTurno size={28} />
              <span className="titulo text-2xl">TURNO</span>
            </div>
            <p className="titulo text-3xl leading-tight">
              Pedí antes.
              <br />
              Llegá y retirá.
            </p>
            <p className="mt-2 text-sm text-tinta-suave">
              Sin fila. {comercio.nombre}.
            </p>

            <div
              className="mx-auto mt-4 w-48 [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            <p className="hora mt-3 break-all text-[0.625rem] text-tinta-suave">
              {url.replace(/^https?:\/\//, "")}
            </p>

            <div className="mt-4 flex items-center justify-center gap-2 border-t border-borde pt-3">
              <span className="etiqueta">{canal.nombre}</span>
            </div>
            <p className="mt-1 text-xs text-tinta-suave print:hidden">
              {canal.donde}
            </p>
          </article>
        ))}
      </div>

      <p className="mt-8 text-xs text-tinta-suave print:hidden">
        Antes de imprimir, comprobá que la dirección del cartel sea la del
        despliegue real y no <code className="hora">localhost</code>: se
        configura en <code className="hora">APP_URL</code>.
      </p>
    </main>
  );
}
