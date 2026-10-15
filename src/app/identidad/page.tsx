import type { Metadata } from "next";
import { LogotipoTurno, MarcaTurno } from "@/components/marca";
import { MascotaTurno } from "@/components/mascota/Turno";

export const metadata: Metadata = {
  title: "Identidad · TURNO",
  robots: { index: false, follow: false },
};

const PALETA = [
  { nombre: "Crema", hex: "F7F4EE", papel: "Fondo" },
  { nombre: "Arena", hex: "E3D9C8", papel: "Superficies y bordes" },
  { nombre: "Oliva", hex: "34483C", papel: "Acción, navegación activa" },
  { nombre: "Carbón", hex: "252521", papel: "Texto" },
  { nombre: "Dorado", hex: "B68D59", papel: "Fidelidad. Nunca texto" },
  { nombre: "Rojo", hex: "C91525", papel: "Solo urgencia" },
  { nombre: "Ámbar", hex: "E49B19", papel: "Solo atención" },
];

const ESTADOS = [
  { estado: "saluda", texto: "Bienvenida" },
  { estado: "listo", texto: "Pedido listo" },
  { estado: "espera", texto: "Preparando" },
  { estado: "error", texto: "Sin franja" },
] as const;

export default function Identidad() {
  return (
    <main id="contenido" className="mx-auto w-full max-w-4xl px-5 py-10">
      <p className="etiqueta">Identidad v2</p>
      <h1 className="titulo mt-2 text-4xl">Gourmet Minimal</h1>
      <p className="mt-3 max-w-xl text-cuerpo text-texto-2">
        Piezas de la fase 3. Cambia el tema del sistema para ver el modo oscuro.
      </p>

      <section className="mt-10" aria-labelledby="paleta">
        <h2 id="paleta" className="text-h2 font-bold">Paleta</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PALETA.map((c) => (
            <li key={c.nombre} className="overflow-hidden rounded-lg border border-borde">
              <div className="h-16" style={{ background: `#${c.hex}` }} />
              <div className="p-3">
                <p className="text-chico font-semibold">{c.nombre}</p>
                <p className="text-caption text-texto-2">#{c.hex}</p>
                <p className="mt-1 text-caption text-texto-2">{c.papel}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="logo">
        <h2 id="logo" className="text-h2 font-bold">Logo</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-6 rounded-lg border border-borde bg-fondo p-6 text-marca-fondo">
            <MarcaTurno size={72} />
            <LogotipoTurno size={40} conLema />
          </div>
          <div className="flex items-center gap-6 rounded-lg bg-cocina p-6 text-cocina-tinta">
            <MarcaTurno size={72} />
            <LogotipoTurno size={40} conLema />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-5 text-marca-fondo">
          <MarcaTurno size={16} />
          <MarcaTurno size={24} />
          <MarcaTurno size={32} />
          <MarcaTurno size={48} />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="mascota">
        <h2 id="mascota" className="text-h2 font-bold">Mascota turno</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ESTADOS.map((e) => (
            <li key={e.estado} className="flex flex-col items-center rounded-lg border border-borde p-4">
              <MascotaTurno estado={e.estado} size={120} titulo={e.texto} />
              <p className="mt-2 text-chico font-medium">{e.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="estado">
        <h2 id="estado" className="text-h2 font-bold">Estado vacío</h2>
        <div className="mt-4 flex flex-col items-center rounded-lg border border-borde p-8 text-center">
          <MascotaTurno estado="espera" size={140} conGorro titulo="La cocina está preparando" />
          <p className="titulo mt-4 text-2xl">Tu pedido está en la cocina</p>
          <p className="mt-2 max-w-sm text-chico text-texto-2">
            Te avisamos cuando esté listo. Puedes seguir en clase.
          </p>
          <button className="presiona brillo mt-5 rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white" type="button">
            Ver mi pedido
          </button>
        </div>
      </section>
    </main>
  );
}
