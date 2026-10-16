import { Personaje } from "@/components/mascota/Personaje";
import { MascotaTurno } from "@/components/mascota/Turno";

/**
 * La historia de un receso, en tres escenas (pantalla 0).
 *
 * Cuenta el producto con las tres personas que lo hacen funcionar: quien
 * estudia, quien cocina y la hora que TURNO les promete. Va antes del
 * simulador: primero se entiende el problema, después se juega con los números.
 */
const ESCENAS = [
  {
    id: "estudiante",
    titulo: "Tenés 30 minutos",
    texto: "Salís de clase con hambre y el receso ya empezó. Antes, veinte minutos se iban en la fila.",
    figura: <Personaje quien="estudiante" size={168} titulo="Una estudiante con mochila" />,
  },
  {
    id: "cocina",
    titulo: "La cocina cuenta",
    texto: "Cada plato lleva minutos de preparación. TURNO suma los minutos de cada franja y no ofrece las que ya están llenas.",
    figura: <Personaje quien="cocinero" size={168} titulo="Un cocinero con gorro y delantal" />,
  },
  {
    id: "retiro",
    titulo: "Llegás y retirás",
    texto: "Tu pedido ya está listo a la hora que dice. Mostrás el código, pagás en el mostrador y te vas.",
    figura: <MascotaTurno estado="listo" size={140} titulo="La mascota de TURNO celebra" />,
  },
];

export function HistoriaReceso() {
  return (
    <section aria-labelledby="historia" className="mt-12">
      <p className="etiqueta">Un receso con TURNO</p>
      <h2 id="historia" className="titulo mt-2 text-3xl">
        Así se ve la diferencia
      </h2>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {ESCENAS.map((e, i) => (
          <li
            key={e.id}
            className="flex flex-col items-center rounded-lg border border-borde p-5 text-center"
          >
            <span className="text-caption font-semibold text-texto-2">Escena {i + 1}</span>
            <div className="mt-2 flex h-44 items-end justify-center">{e.figura}</div>
            <h3 className="mt-3 text-h3 font-bold">{e.titulo}</h3>
            <p className="mt-2 text-chico text-texto-2">{e.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
