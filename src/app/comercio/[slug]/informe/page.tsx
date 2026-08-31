import { Informe } from "./Informe";

export const dynamic = "force-dynamic";

/**
 * Informe de ventas del comercio.
 *
 * Página de servidor mínima a propósito: todo el trabajo lo hace el endpoint,
 * que ya resuelve la autorización. Si esta página consultara la base por su
 * cuenta habría dos lugares donde comprobar de quién es el comercio, y tarde o
 * temprano uno de los dos se olvida.
 */
export default async function Pagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Informe slug={slug} />;
}
