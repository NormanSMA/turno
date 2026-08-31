import Link from "next/link";
import { MarcaTurno } from "@/components/marca";

export const metadata = { title: "Sin conexión — TURNO" };

/**
 * Página de respaldo cuando no hay red y no hay copia local de lo pedido.
 *
 * Dice dos cosas y nada más: qué pasó, y qué sí se puede hacer igual. Una
 * pantalla de error que solo se disculpa deja al estudiante parado en el pasillo
 * sin saber si su pedido sigue en pie.
 *
 * El dato importante es el último: **el pedido no depende de esta pantalla**. La
 * hora quedó reservada en el servidor cuando se confirmó; perder la señal no la
 * suelta. Decirlo acá evita el pánico de creer que hay que volver a pedir.
 */
export default function SinConexion() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <MarcaTurno size={40} />
      <h1 className="titulo mt-4 text-3xl">Sin conexión</h1>
      <p className="mt-3 text-tinta-suave">
        No hay señal ahora mismo y esta pantalla no estaba guardada.
      </p>

      <div className="mt-6 rounded-xl border border-borde bg-papel-alto p-4">
        <p className="etiqueta">Lo que igual sigue en pie</p>
        <p className="mt-2 text-sm">
          Tu pedido y tu hora quedaron reservados en el servidor cuando los
          confirmaste. Quedarte sin señal no los suelta. No hace falta volver a
          pedir.
        </p>
      </div>

      <div className="mt-6 space-y-2">
        <Link
          href="/mis-pedidos"
          className="presiona block rounded-full bg-marca-fondo px-6 py-3 text-center font-semibold text-white"
        >
          Ver mis pedidos guardados
        </Link>
        <p className="text-center text-xs text-tinta-suave">
          Los pedidos que ya abriste se ven sin conexión, con la hora de la
          última vez que se pudieron consultar.
        </p>
      </div>
    </main>
  );
}
