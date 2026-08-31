import { notFound } from "next/navigation";
import { menuDe } from "@/lib/catalogo";
import { ClienteComercio } from "./ClienteComercio";

// El menú se renderiza en el servidor y se sirve fresco: el estado de
// disponibilidad de un producto cambia durante el receso.
export const dynamic = "force-dynamic";

export default async function Pagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const menu = await menuDe(slug);
  if (!menu) notFound();
  return (
    <ClienteComercio comercio={menu.comercio} productos={menu.productos} />
  );
}
