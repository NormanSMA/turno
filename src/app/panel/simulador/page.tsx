import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth";
import { Navegacion } from "@/components/Navegacion";
import { SimuladorAdmin } from "@/components/SimuladorAdmin";

/** Solo ADMIN. Mismo criterio que el resto del panel: el rol se valida en el servidor. */
export default async function Pagina() {
  const sesion = await sesionActual();
  if (!sesion) redirect("/entrar?volver=/panel/simulador");
  if (sesion.rol !== "ADMIN") redirect("/");

  return (
    <>
      <Navegacion />
      <main
        id="contenido"
        className="mx-auto w-full max-w-4xl px-4 pb-40 pt-6 sm:px-5 sm:pb-12"
      >
        <SimuladorAdmin />
      </main>
    </>
  );
}
