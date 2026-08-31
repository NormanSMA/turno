import type { Metadata } from "next";
import Link from "next/link";
import { Navegacion } from "@/components/Navegacion";
import { ComparacionReceso } from "@/components/ComparacionReceso";
import { CabeceraTurno } from "@/components/marca";
import { Icono } from "@/components/iconos";

/**
 * Cómo funciona TURNO.
 *
 * Existe por el principio que gobierna la fase 3 del rediseño:
 *
 *   > El hero le explica TURNO a quien todavía no lo conoce. La aplicación le
 *   > sirve a quien ya lo está usando. Nadie ve las dos cosas a la vez.
 *
 * Antes la explicación —la comparación del receso y los tres pasos— vivía en la
 * portada, así que un estudiante con un pedido en cocina tenía que pasar por
 * encima del argumento de venta para llegar a su código. Acá está completa, a
 * un toque de distancia, para quien la quiera.
 *
 * Es una página de servidor sin datos: no consulta la base ni la sesión. Sale
 * dinámica igual, porque el middleware le pone un nonce por respuesta, pero no
 * gasta una sola consulta.
 */
export const metadata: Metadata = {
  title: "Cómo funciona · TURNO",
  description:
    "TURNO reserva capacidad de cocina para tu hora de retiro. Pedís antes, llegás y retirás.",
};

const PASOS = [
  {
    numero: "1",
    titulo: "Elegí y reservá",
    texto:
      "Armás el pedido y el sistema te muestra en qué horas la cocina tiene lugar de verdad. No todas: solo las que puede cumplir.",
  },
  {
    numero: "2",
    titulo: "Seguí en clase",
    texto:
      "Tu comida se prepara mientras vos estás en otra cosa. Te avisamos cuando salga de cocina, aunque tengas TURNO cerrado.",
  },
  {
    numero: "3",
    titulo: "Llegá y retirá",
    texto:
      "Mostrás el código en el mostrador, pagás ahí mismo y te vas. Sin fila.",
  },
];

export default function Pagina() {
  return (
    <>
      <Navegacion />

      <CabeceraTurno>
        <div className="mx-auto w-full max-w-3xl px-4 pb-14 pt-10 sm:px-5">
          <p className="etiqueta !text-white/60">Cómo funciona</p>
          <h1 className="titulo mt-3 text-4xl text-white sm:text-5xl">
            Tu receso dura 30 minutos.
            <br />
            La fila se lleva 20.
          </h1>
          <p className="mt-4 max-w-xl text-cuerpo text-white/80">
            TURNO no es una aplicación de pedidos: es una reserva de{" "}
            <strong className="text-white">capacidad de cocina</strong>. Por eso
            puede prometerte una hora y cumplirla.
          </p>

          {/* La comparación va DENTRO del hero, no debajo.
              No es una preferencia de composición: el componente declara en su
              propio comentario que su paleta es fija porque vive sobre una
              tarjeta oscura en los dos temas. Sacarlo al fondo claro de la
              página dejaba texto blanco sobre `bg-white/10` casi blanco — doce
              nodos con contraste insuficiente, que es como lo encontró axe. Un
              componente con contrato de fondo se coloca donde ese contrato se
              cumple.

              Y de paso queda mejor: el argumento y su demostración juntos. */}
          <div className="mt-8">
            <p className="etiqueta !text-white/60 mb-2">
              Tocá cualquier tramo para ver cuánto tiempo se lleva
            </p>
            <ComparacionReceso />
          </div>
        </div>
      </CabeceraTurno>

      <main
        id="contenido"
        className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8 sm:px-5 sm:pb-16"
      >
        <section>
          <h2 className="etiqueta mb-4">Tres pasos</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {PASOS.map((p) => (
              <li key={p.numero} className="rounded-lg border border-borde bg-superficie p-4">
                <span className="hora flex h-8 w-8 items-center justify-center rounded-full bg-marca-suave text-chico font-bold text-marca-texto">
                  {p.numero}
                </span>
                <h3 className="mt-3 text-cuerpo font-semibold">{p.titulo}</h3>
                <p className="mt-1 text-chico text-texto-2">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 rounded-lg border border-borde bg-superficie p-5">
          <h2 className="titulo text-h3">Lo que TURNO no hace</h2>
          <p className="mt-2 text-chico text-texto-2">
            Decirlo por adelantado evita la sorpresa en el mostrador, que es
            donde una sorpresa cuesta caro.
          </p>
          <ul className="mt-4 space-y-2.5 text-chico">
            {[
              "No se paga en línea. El pago va en el mostrador, al retirar.",
              "No hay entrega a domicilio. Vos vas y retirás.",
              "No se reserva sin hora: si la cocina no tiene lugar, el sistema no acepta el pedido en vez de prometerte algo que no puede cumplir.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-texto-3">
                  <Icono nombre="cerrar" size={15} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/explorar"
            className="presiona flex min-h-13 items-center justify-center gap-2 rounded-md bg-marca-fondo px-7 text-cuerpo font-semibold text-white"
          >
            Ver qué hay hoy
            <Icono nombre="atras" size={18} className="rotate-180" />
          </Link>
          <Link
            href="/"
            className="presiona flex min-h-13 items-center justify-center rounded-md border border-borde px-7 text-cuerpo font-semibold"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    </>
  );
}
