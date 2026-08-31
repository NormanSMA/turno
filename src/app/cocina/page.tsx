import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { sesionActual } from "@/lib/auth";

/**
 * `/cocina` sin comercio: se resuelve al comercio del operador.
 *
 * Existe porque un operador no tiene por qué conocer el slug de su propio
 * comercio, y porque cualquier enlace interno que apunte a "la cocina" tiene
 * que funcionar sin saber a cuál.
 */
export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/acceso?volver=/cocina");

  // El administrador no opera cocinas: se lo manda a su panel.
  if (sesion.rol === "ADMIN") redirect("/panel");

  if (sesion.comercioId) {
    const comercio = await prisma.comercio.findUnique({
      where: { id: sesion.comercioId },
      select: { slug: true },
    });
    if (comercio) redirect(`/cocina/${comercio.slug}`);
  }

  // Cuenta de comercio sin comercio asignado: es un error de alta, y hay que
  // decirlo en vez de mandarla a una cocina cualquiera.
  redirect("/acceso?error=sin-comercio");
}
