"use client";

/**
 * Perfil — "¿qué necesito gestionar?" (Design System §03).
 *
 * Una pantalla, una intención. Acá NO va el menú, ni el carrito, ni el
 * seguimiento: va lo que el estudiante administra sobre sí mismo. El orden
 * responde a con qué frecuencia se toca cada cosa, no a la estructura de la
 * base de datos — por eso los avisos van arriba y los datos académicos abajo.
 *
 * Las cifras de arriba existen porque el producto promete devolver tiempo, y
 * una promesa que nunca se ve cumplida no se percibe.
 */

import { useCallback, useEffect, useState } from "react";
import { NOMBRES_CARRERAS } from "@/core/carreras";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navegacion } from "@/components/Navegacion";
import { Icono, type NombreIcono } from "@/components/iconos";
import { equivalenciaDeTiempo, tiempoRecuperado } from "@/lib/tiempo";
import { comoIdentificar } from "@/core/saludo";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { AvisosPush } from "@/components/AvisosPush";
import { SelectorTema } from "@/components/SelectorTema";
import { api, cordobas, ErrorApi } from "@/lib/cliente";
import { cerrarSesion } from "@/lib/sesion-cliente";

interface Perfil {
  correo: string;
  nombre: string | null;
  rol: string;
  facultad: string | null;
  carrera: string | null;
  anio: number | null;
  desde: string;
  cifras: {
    pedidosRetirados: number;
    pedidosActivos: number;
    minutosAhorrados: number;
    totalGastado: string;
    comercioFrecuente: string | null;
  };
}


export default function Pagina() {
  const router = useRouter();
  const [p, setP] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinLeer, setSinLeer] = useState(0);
  const [saliendo, setSaliendo] = useState(false);

  const cargar = useCallback(() => {
    api<Perfil>("/api/perfil")
      .then((r) => {
        setError(null);
        setP(r);
      })
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace("/entrar?volver=/perfil");
          return;
        }
        setError("No pudimos cargar tu perfil.");
      });
    api<{ sinLeer: number }>("/api/avisos")
      .then((r) => setSinLeer(r.sinLeer))
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function salir() {
    setSaliendo(true);
    await cerrarSesion();
  }

  return (
    <>
      <Navegacion />
      <main
        id="contenido"
        className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:px-5 sm:pb-12"
      >
        {error && <ErrorVista texto={error} onReintentar={cargar} />}

        {!p && !error && (
          <div className="space-y-4">
            <Esqueleto className="h-10 w-56" />
            <Esqueleto className="h-24 w-full" />
            <Esqueleto className="h-40 w-full" />
          </div>
        )}

        {p && (
          <>
            <header className="mb-6 flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-texto-2">
                <Icono nombre="perfil" size={26} />
              </span>
              <div className="min-w-0">
                {/* Acá se IDENTIFICA, no se saluda: sin nombre gana el
                    correo, que sí identifica a una persona. En la portada es al
                    revés — ahí se saluda, y un nombre inventado molesta. */}
                <h1 className="titulo truncate text-h1">
                  {comoIdentificar(p.nombre, p.correo)}
                </h1>
                {p.nombre && (
                  <p className="truncate text-chico text-texto-2">{p.correo}</p>
                )}
              </div>
            </header>

            {/* --------------------------------------------------- Cifras */}
            {/*
             * ================================== TIEMPO RECUPERADO (§26, §27)
             *
             * La promesa del producto, dicha con el dato del propio usuario y
             * en el tamaño que le corresponde. Estaba escondida como una de
             * tres cifras iguales, y una promesa que se muestra del mismo
             * tamaño que "total gastado" no se percibe como una promesa.
             *
             * La equivalencia es lo que la aterriza: "3 h 18 m" es cierto pero
             * abstracto; "3 clases enteras" se puede imaginar. Se calla por
             * debajo de quince minutos, porque exagerar con una cifra chica
             * quema la frase para cuando sea grande.
             */}
            {p.cifras.minutosAhorrados > 0 && (
              <section className="mb-6 overflow-hidden rounded-lg border border-marca-texto/25 bg-marca-suave px-5 py-6 text-center">
                <p className="etiqueta">Tiempo recuperado</p>
                <p className="hora mt-1 text-[2.75rem] font-extrabold leading-none text-marca-texto">
                  {tiempoRecuperado(p.cifras.minutosAhorrados)}
                </p>
                <p className="mt-2 text-chico text-texto-2">
                  Lo que no pasaste en la fila, sumando tus{" "}
                  {p.cifras.pedidosRetirados} pedidos retirados.
                </p>
                {equivalenciaDeTiempo(p.cifras.minutosAhorrados) && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-marca-texto/30 bg-superficie px-3 py-1 text-caption font-semibold">
                    <Icono nombre="reloj" size={14} />
                    {equivalenciaDeTiempo(p.cifras.minutosAhorrados)}
                  </p>
                )}
              </section>
            )}

            <section
              aria-label="Tu actividad"
              className="mb-6 grid grid-cols-3 overflow-hidden rounded-lg border border-borde bg-superficie"
            >
              <Cifra
                valor={String(p.cifras.pedidosRetirados)}
                etiqueta="pedidos retirados"
              />
              <Cifra
                valor={`${p.cifras.minutosAhorrados}`}
                unidad="min"
                etiqueta="sin hacer fila"
              />
              <Cifra
                valor={cordobas(p.cifras.totalGastado)}
                etiqueta="en total"
              />
            </section>

            {p.cifras.comercioFrecuente && (
              <p className="-mt-3 mb-6 text-chico text-texto-2">
                Tu comercio de siempre es{" "}
                <span className="font-semibold text-texto">
                  {p.cifras.comercioFrecuente}
                </span>
                .
              </p>
            )}

            {/* --------------------------------------------------- Avisos */}
            <Grupo titulo="Avisos">
              <Fila
                href="/avisos"
                icono="campana"
                titulo="Bandeja de avisos"
                detalle={
                  sinLeer > 0
                    ? `${sinLeer} sin leer`
                    : "Todo al día"
                }
                resaltar={sinLeer > 0}
              />
              <Fila
                href="/avisos/preferencias"
                icono="ajustes"
                titulo="Qué querés que te avisemos"
                detalle="Elegí cuáles recibir"
              />
              <div className="px-4 pb-4">
                <p className="mb-1 text-chico font-medium">
                  Avisos en el teléfono
                </p>
                <p className="mb-3 text-caption text-texto-2">
                  Te avisamos cuando tu pedido esté listo, aunque tengas TURNO
                  cerrado.
                </p>
                <AvisosPush enCurso />
              </div>
            </Grupo>

            {/* ------------------------------------------------ Apariencia */}
            <Grupo titulo="Apariencia">
              <div className="p-4">
                <SelectorTema />
              </div>
            </Grupo>

            {/* ----------------------------------------------- Mis pedidos */}
            <Grupo titulo="Actividad">
              <Fila
                href="/mis-pedidos"
                icono="pedidos"
                titulo="Mis pedidos"
                detalle={
                  p.cifras.pedidosActivos > 0
                    ? `${p.cifras.pedidosActivos} en curso`
                    : "Ver historial"
                }
                resaltar={p.cifras.pedidosActivos > 0}
              />
              <Fila
                href="/favoritos"
                icono="corazon"
                titulo="Favoritos"
                detalle="Lo que guardaste"
              />
              <Fila
                href="/explorar"
                icono="explorar"
                titulo="Explorar comercios"
                detalle="Ver todo el menú"
              />
            </Grupo>

            {/* ---------------------------------------------------- Datos */}
            <DatosAcademicos perfil={p} alGuardar={cargar} />

            {/* ---------------------------------------------------- Salir */}
            <div className="mt-8 border-t border-borde pt-6">
              <button
                type="button"
                onClick={salir}
                disabled={saliendo}
                className="presiona flex w-full items-center justify-center gap-2 rounded-md border border-borde px-4 py-3 text-chico font-semibold text-error disabled:opacity-40"
              >
                <Icono nombre="salir" size={18} />
                {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
              </button>
              <p className="mt-2 text-center text-caption text-texto-2">
                Borra también los pedidos guardados para verse sin conexión.
                Usalo si el teléfono no es tuyo.
              </p>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Cifra({
  valor,
  unidad,
  etiqueta,
  destacado,
}: {
  valor: string;
  unidad?: string;
  etiqueta: string;
  destacado?: boolean;
}) {
  return (
    <div className="border-r border-borde px-3 py-4 text-center last:border-r-0">
      <p
        className={`hora text-h2 font-bold leading-none ${
          destacado ? "text-marca-texto" : "text-texto"
        }`}
      >
        {valor}
        {unidad && (
          <span className="ml-0.5 text-chico font-semibold">{unidad}</span>
        )}
      </p>
      <p className="mt-1.5 text-caption leading-tight text-texto-2">
        {etiqueta}
      </p>
    </div>
  );
}

function Grupo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="etiqueta mb-2">{titulo}</h2>
      <div className="divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
        {children}
      </div>
    </section>
  );
}

function Fila({
  href,
  icono,
  titulo,
  detalle,
  resaltar,
}: {
  href: string;
  icono: NombreIcono;
  titulo: string;
  detalle: string;
  resaltar?: boolean;
}) {
  return (
    <Link
      href={href}
      className="presiona flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-superficie-2"
    >
      <span className={resaltar ? "text-marca-texto" : "text-texto-2"}>
        <Icono nombre={icono} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-cuerpo font-medium">{titulo}</span>
        <span
          className={`block text-caption ${
            resaltar ? "font-semibold text-marca-texto" : "text-texto-2"
          }`}
        >
          {detalle}
        </span>
      </span>
      <span className="text-texto-3">
        <Icono nombre="atras" size={18} className="rotate-180" />
      </span>
    </Link>
  );
}

/** Datos académicos: opcionales, y se dice por qué se piden. */
function DatosAcademicos({
  perfil,
  alGuardar,
}: {
  perfil: Perfil;
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(perfil.nombre ?? "");
  const [carrera, setCarrera] = useState(perfil.carrera ?? "");
  const [anio, setAnio] = useState(perfil.anio ? String(perfil.anio) : "");
  const [estado, setEstado] = useState<"quieto" | "guardando" | "listo">(
    "quieto",
  );

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("guardando");
    try {
      await api("/api/perfil", {
        method: "PATCH",
        body: JSON.stringify({
          nombre: nombre.trim() || null,
          carrera: carrera.trim() || null,
          anio: anio ? Number(anio) : null,
        }),
      });
      setEstado("listo");
      alGuardar();
      window.setTimeout(() => setEstado("quieto"), 2000);
    } catch {
      setEstado("quieto");
    }
  }

  return (
    <section className="mb-5">
      <h2 className="etiqueta mb-2">Tus datos</h2>
      <form
        onSubmit={guardar}
        className="rounded-lg border border-borde bg-superficie p-4"
      >
        <p className="mb-4 text-caption text-texto-2">
          Todo opcional. El nombre es solo para saludarte; la carrera y el año
          nos sirven para saber en qué horarios abrir más franjas.
        </p>

        <label className="block text-chico font-medium" htmlFor="nombre">
          Tu nombre
        </label>
        <input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Norman"
          autoComplete="given-name"
          maxLength={80}
          className="mt-1.5 w-full rounded-sm border border-borde bg-fondo px-3 py-2.5 text-cuerpo outline-none focus:border-marca-texto"
        />
        <p className="mt-1 text-caption text-texto-2">
          Si lo dejás vacío te saludamos sin nombre.
        </p>

        <label className="mt-4 block text-chico font-medium" htmlFor="carrera">
          Carrera
        </label>
        {/*
          `datalist` y no `select`: sugiere sin obligar.

          El campo era texto libre, y eso da datos que no se pueden agrupar —
          "Ing. Sistemas", "ingenieria de sistemas" y "Sistemas" son tres filas
          para el análisis y una sola carrera en la realidad. Pero un desplegable
          cerrado sería peor: el catálogo sale de la página pública de la
          universidad y puede estar incompleto, así que a quien estudie algo que
          no figura el sistema le diría que su carrera no existe.

          Con esto, quien encuentra la suya la elige y el dato queda
          normalizado; quien no, escribe. Y lo que se escriba a mano es
          justamente la señal de qué le falta al catálogo.
        */}
        <input
          id="carrera"
          list="carreras"
          value={carrera}
          onChange={(e) => setCarrera(e.target.value)}
          placeholder="Ingeniería de Sistemas"
          autoComplete="off"
          className="mt-1.5 w-full rounded-sm border border-borde bg-fondo px-3 py-2.5 text-cuerpo outline-none focus:border-marca-texto"
        />
        <datalist id="carreras">
          {NOMBRES_CARRERAS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <p className="mt-1 text-caption text-texto-2">
          Elegí de la lista o escribí la tuya si no está.
        </p>

        <label className="mt-4 block text-chico font-medium" htmlFor="anio">
          Año
        </label>
        <select
          id="anio"
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-borde bg-fondo px-3 py-2.5 text-cuerpo outline-none focus:border-marca-texto"
        >
          <option value="">Prefiero no decirlo</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}º año
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={estado === "guardando"}
          className="presiona mt-4 w-full rounded-md bg-texto px-4 py-3 text-chico font-semibold text-fondo disabled:opacity-40"
        >
          {estado === "guardando"
            ? "Guardando…"
            : estado === "listo"
              ? "Guardado"
              : "Guardar cambios"}
        </button>
      </form>
    </section>
  );
}
