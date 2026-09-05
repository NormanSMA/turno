import { redirect } from "next/navigation";

/**
 * El informe vive dentro del panel, en su pestaña.
 *
 * Esta ruta se conserva como redirección y no se borra porque estaba enlazada
 * desde la cabecera del panel y puede estar guardada en marcadores. Un 404 en
 * una dirección que alguien usaba ayer es una regresión, aunque el contenido
 * siga existiendo dos clics más allá.
 */
export default async function Pagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/comercio/${slug}?ver=informe`);
}
