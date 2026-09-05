"use client";

/**
 * Panel del comercio: catálogo, franjas y parámetros.
 *
 * Es la pantalla donde el operador toca las variables del modelo, así que cada
 * control lleva al lado lo que ese número SIGNIFICA. Un campo llamado α sin
 * explicación es un campo que nadie mueve, o peor, que alguien mueve sin saber
 * qué rompe.
 *
 * Los cambios que dejarían franjas sobrevendidas los rechaza el servidor (ver
 * `core/administracion.ts`), y acá se muestran tal cual: decir "no se pudo" sin
 * decir por qué obliga a adivinar.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CodigoPedido } from "@/components/CodigoPedido";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { ImagenProducto } from "@/components/ImagenProducto";
import {
  AccionPrincipal,
  CabeceraOperacion,
} from "@/components/CabeceraOperacion";
import { Informe } from "./informe/Informe";
import { Icono } from "@/components/iconos";
import { SelectorTema } from "@/components/SelectorTema";
import {
  cerrarSesion,
  sesionCliente,
  type Sesion,
} from "@/lib/sesion-cliente";
import { SelectorFoto } from "@/components/SelectorFoto";
import { api, cordobas, ErrorApi, fechaCorta, horaCorta } from "@/lib/cliente";

interface ProductoAdmin {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precio: number;
  tiempoPreparacionMin: number;
  anticipable: boolean;
  disponible: boolean;
  archivado: boolean;
  elegible: boolean;
}

interface FranjaAdmin {
  id: string;
  inicio: string;
  fin: string;
  capacidadMinutos: number;
  capacidadEfectivaMin: number;
  cargaAsignada: number;
  abierta: boolean;
  pedidosVivos: number;
}

interface ComercioAdmin {
  id: string;
  nombre: string;
  slug: string;
  personalCocina: number;
  anchoFranjaMin: number;
  factorSeguridad: number;
  tiempoMinAnticipable: number;
  margenCutoffMin: number;
  minutosNoShow: number;
  maxPedidosActivos: number;
  estadoOperacion: "ABIERTO" | "PAUSADO" | "CERRADO";
  capacidadSugerida: number;
}

interface Estado {
  comercio: ComercioAdmin;
  productos: ProductoAdmin[];
  franjas: FranjaAdmin[];
}

/**
 * Las secciones del panel, en el orden en que se usan: primero lo que se toca
 * a diario, después lo que se configura una vez.
 *
 * Es una constante y no una lista dentro del JSX porque también decide qué
 * valores de `?ver=` son válidos. Con la lista incrustada, agregar una pestaña
 * y olvidarse de la validación deja una sección a la que no se puede enlazar.
 */
const PESTANAS = [
  ["catalogo", "Catálogo"],
  ["franjas", "Horas"],
  ["informe", "Informe"],
  ["ajustes", "Ajustes"],
  ["cuenta", "Cuenta"],
] as const;

type Pestana = (typeof PESTANAS)[number][0];

export default function Pagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * La pestaña inicial puede venir en la dirección (`?ver=informe`).
   *
   * Lo usa la redirección desde `/comercio/[slug]/informe`, que era una página
   * propia y ahora es esta pestaña: sin leer el parámetro, un marcador viejo
   * llevaría al panel pero abriendo Catálogo, y parecería que el informe se
   * perdió.
   */
  const busqueda = useSearchParams();
  const pedida = busqueda.get("ver");
  const [pestana, setPestana] = useState<Pestana>(
    PESTANAS.some(([id]) => id === pedida) ? (pedida as Pestana) : "catalogo",
  );

  const cargar = useCallback(() => {
    api<Estado>(`/api/comercios/${slug}/admin`)
      .then((e) => {
        setEstado(e);
        setError(null);
      })
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace(`/acceso?volver=/comercio/${slug}`);
          return;
        }
        setError(
          e instanceof ErrorApi
            ? e.message
            : "No pudimos cargar el panel del comercio.",
        );
      });
  }, [slug, router]);

  useEffect(cargar, [cargar]);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <ErrorVista titulo="No se puede abrir el panel" texto={error} onReintentar={cargar} />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-papel-medio">
      <CabeceraOperacion
        etiqueta="Panel del comercio"
        titulo={estado?.comercio.nombre ?? "Cargando…"}
        acciones={
          <AccionPrincipal href={`/cocina/${slug}`}>
            Ir a la cocina
          </AccionPrincipal>
        }
      >
        <nav className="mt-3 flex gap-1" aria-label="Secciones del panel">
          {PESTANAS.map(([id, texto]) => (
            <button
              key={id}
              type="button"
              aria-current={pestana === id ? "page" : undefined}
              onClick={() => setPestana(id)}
              className={`presiona rounded-full px-4 py-1.5 text-sm font-medium ${
                pestana === id
                  ? "bg-marca-fondo text-white"
                  : "text-tinta-suave hover:bg-turno-claro"
              }`}
            >
              {texto}
            </button>
          ))}
        </nav>
      </CabeceraOperacion>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {!estado && (
          <div className="space-y-3">
            <Esqueleto className="h-24 w-full" />
            <Esqueleto className="h-24 w-full" />
          </div>
        )}

        {estado && pestana === "catalogo" && (
          <Catalogo estado={estado} slug={slug} onCambio={cargar} />
        )}
        {estado && pestana === "franjas" && (
          <Franjas estado={estado} slug={slug} onCambio={cargar} />
        )}
        {estado && pestana === "ajustes" && (
          <Ajustes estado={estado} slug={slug} onCambio={cargar} />
        )}

        {pestana === "informe" && <Informe slug={slug} />}

        {pestana === "cuenta" && <Cuenta />}
      </div>
    </main>
  );
}

/** Traduce el 422 del servidor a un texto que se pueda leer. */
function textoDeError(e: unknown): string {
  if (e instanceof ErrorApi) {
    const violaciones = e.detalle as { motivo: string }[] | undefined;
    if (Array.isArray(violaciones) && violaciones.length > 0) {
      return violaciones.map((v) => v.motivo).join(" ");
    }
    return e.message;
  }
  return "No se pudo aplicar el cambio.";
}

// ---------------------------------------------------------------- Catálogo ---

function Catalogo({
  estado,
  slug,
  onCambio,
}: {
  estado: Estado;
  slug: string;
  onCambio: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<ProductoAdmin | null>(null);

  async function cambiar(id: string, datos: Record<string, unknown>) {
    setOcupado(id);
    setError(null);
    try {
      await api(`/api/comercios/${slug}/productos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(datos),
      });
      onCambio();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setOcupado(null);
    }
  }

  const activos = estado.productos.filter((p) => !p.archivado);
  const archivados = estado.productos.filter((p) => p.archivado);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-suave">
          El interruptor de <strong>disponible</strong> es el que usás cuando algo
          se agota: lo apaga al instante y ningún pedido nuevo lo incluye.
        </p>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="presiona brillo rounded-full bg-marca-fondo px-5 py-2.5 text-sm font-semibold text-white"
        >
          Agregar producto
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorVista texto={error} />
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {activos.map((p) => (
          <FilaCatalogo
            key={p.id}
            producto={p}
            tiempoMin={estado.comercio.tiempoMinAnticipable}
            ocupado={ocupado === p.id}
            onCambiar={cambiar}
            onEditar={() => setEditando(p)}
          />
        ))}
      </ul>

      {archivados.length > 0 && (
        <details className="mt-6">
          <summary className="etiqueta cursor-pointer">
            Archivados ({archivados.length})
          </summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {archivados.map((p) => (
              <FilaCatalogo
                key={p.id}
                producto={p}
                tiempoMin={estado.comercio.tiempoMinAnticipable}
                ocupado={ocupado === p.id}
                onCambiar={cambiar}
                onEditar={() => setEditando(p)}
              />
            ))}
          </ul>
        </details>
      )}

      {(creando || editando) && (
        <FormularioProducto
          slug={slug}
          producto={editando}
          tiempoMin={estado.comercio.tiempoMinAnticipable}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={() => {
            setCreando(false);
            setEditando(null);
            onCambio();
          }}
        />
      )}
    </section>
  );
}

/**
 * La cuenta del comercio, dentro del panel.
 *
 * Estaba solo en la pantalla de Perfil, que es la del cliente: para cerrar
 * sesión o cambiar el tema, el comercio tenía que salir a un sitio lleno de
 * "Explorar", "Favoritos" y "Mis pedidos" que no son suyos. Y desde que las
 * pantallas de operación dejaron de montar la navegación del cliente, ni
 * siquiera había cómo llegar: había que escribir la dirección a mano.
 *
 * Acá va lo que un comercio sí necesita de su cuenta y nada más. Los datos de
 * actividad —pedidos, favoritos— siguen donde estaban, porque pertenecen a
 * quien pide, no a quien despacha.
 */
function Cuenta() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    sesionCliente()
      .then(setSesion)
      .catch(() => setSesion(null));
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="tarjeta p-4">
        <p className="etiqueta">Sesión</p>
        <p className="mt-1 break-all font-semibold">
          {sesion?.usuario?.correo ?? "…"}
        </p>
        <p className="text-sm text-tinta-suave">
          Cuenta de operación del comercio
        </p>
      </section>

      <section className="tarjeta p-4">
        <p className="etiqueta">Apariencia</p>
        <p className="mt-1 mb-3 text-sm text-tinta-suave">
          El tema es de este dispositivo. La tablet del mostrador y la del fondo
          no tienen por qué querer lo mismo.
        </p>
        <SelectorTema />
      </section>

      <button
        type="button"
        disabled={saliendo}
        onClick={() => {
          setSaliendo(true);
          void cerrarSesion();
        }}
        className="presiona toque flex w-full items-center justify-center gap-2 rounded-full border border-borde px-6 py-3 font-semibold disabled:opacity-40"
      >
        <Icono nombre="salir" size={18} />
        {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
    </div>
  );
}

function FilaCatalogo({
  producto,
  tiempoMin,
  ocupado,
  onCambiar,
  onEditar,
}: {
  producto: ProductoAdmin;
  tiempoMin: number;
  ocupado: boolean;
  onCambiar: (id: string, datos: Record<string, unknown>) => void;
  onEditar: () => void;
}) {
  const inutil =
    producto.anticipable && producto.tiempoPreparacionMin < tiempoMin;

  return (
    <li className="tarjeta flex gap-3 overflow-hidden p-3">
      <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-papel-medio">
        <ImagenProducto
          nombre={producto.nombre}
          url={producto.imagenUrl}
          sizes="80px"
        />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{producto.nombre}</p>
        <p className="hora text-xs text-tinta-suave">
          {cordobas(producto.precio)} · {producto.tiempoPreparacionMin} min
        </p>

        {inutil && (
          <p className="mt-1 rounded-sm bg-brasa-claro px-2 py-1 text-[0.6875rem]">
            Se prepara en menos de {tiempoMin} min: nadie va a poder anticiparlo.
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Interruptor
            activo={producto.disponible}
            ocupado={ocupado}
            encendido="Disponible"
            apagado="Agotado"
            onCambiar={() =>
              onCambiar(producto.id, { disponible: !producto.disponible })
            }
          />
          <Interruptor
            activo={producto.anticipable}
            ocupado={ocupado}
            encendido="Anticipable"
            apagado="Solo mostrador"
            onCambiar={() =>
              onCambiar(producto.id, { anticipable: !producto.anticipable })
            }
          />
          <button
            type="button"
            disabled={ocupado}
            onClick={onEditar}
            className="presiona rounded-full border border-borde px-2.5 py-1 text-xs font-medium disabled:opacity-40"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() =>
              onCambiar(producto.id, { archivado: !producto.archivado })
            }
            className="presiona rounded-full border border-borde px-2.5 py-1 text-xs font-medium text-tinta-suave disabled:opacity-40"
          >
            {producto.archivado ? "Restaurar" : "Archivar"}
          </button>
        </div>
      </div>
    </li>
  );
}

function Interruptor({
  activo,
  ocupado,
  encendido,
  apagado,
  onCambiar,
}: {
  activo: boolean;
  ocupado: boolean;
  encendido: string;
  apagado: string;
  onCambiar: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={ocupado}
      onClick={onCambiar}
      className={`presiona rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${
        activo
          ? "bg-turno-claro text-turno-profundo"
          : "border border-borde text-tinta-suave"
      }`}
    >
      {activo ? encendido : apagado}
    </button>
  );
}

/**
 * Alta y edición de un producto, en el mismo formulario.
 *
 * Son la misma pantalla a propósito. Cuando el alta y la edición son dos
 * formularios distintos, divergen: uno gana un campo y el otro no, y termina
 * habiendo cosas que solo se pueden poner al crear —que es exactamente lo que
 * pasaba acá, donde un precio mal tecleado obligaba a archivar el producto y
 * crearlo de nuevo, perdiendo su historial de pedidos.
 */
function FormularioProducto({
  slug,
  producto,
  tiempoMin,
  onCerrar,
  onGuardado,
}: {
  slug: string;
  /** `null` = alta. Con producto = edición. */
  producto: ProductoAdmin | null;
  /** t_mín del comercio: por debajo de esto, anticipar no sirve de nada. */
  tiempoMin: number;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [precio, setPrecio] = useState(
    producto ? String(producto.precio) : "",
  );
  const [tiempo, setTiempo] = useState(
    producto ? String(producto.tiempoPreparacionMin) : "",
  );

  /*
   * La anticipación se elige, no se deduce.
   *
   * Antes salía de `Number(tiempo) >= 3`: una constante que no era el t_mín de
   * nadie. Una bebida de 1 minuto entraba como "solo mostrador" sin que el
   * comercio lo decidiera ni se enterara, y no había forma de que alguien la
   * reservara junto con su comida.
   *
   * `tocado` es lo que permite sugerir sin imponer: mientras nadie toque el
   * interruptor, sigue al tiempo que se está escribiendo —que es la ayuda que
   * el comercio quiere mientras teclea—; en cuanto lo tocan, deja de moverse
   * solo. Un valor que se recoloca después de que lo elegiste es un valor que
   * no elegiste.
   */
  const [tocado, setTocado] = useState(producto !== null);
  const [anticipable, setAnticipable] = useState(producto?.anticipable ?? true);
  const sugerido = tiempo !== "" && Number(tiempo) >= tiempoMin;
  const anticipaEfectivo = tocado ? anticipable : sugerido;

  const [foto, setFoto] = useState<{
    blob: Blob;
    ancho: number;
    alto: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /* El mismo aviso que muestra la ficha del producto, pero antes de guardar.
     Que el sistema marque algo solo y a continuación te regañe por ello es
     peor que no avisar. */
  const inutil = anticipaEfectivo && tiempo !== "" && Number(tiempo) < tiempoMin;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const campos = {
        nombre,
        descripcion: descripcion.trim() || null,
        precio: Number(precio),
        tiempoPreparacionMin: Number(tiempo),
        anticipable: anticipaEfectivo,
      };

      const id = producto
        ? (await api<{ id: string }>(
            `/api/comercios/${slug}/productos/${producto.id}`,
            { method: "PATCH", body: JSON.stringify(campos) },
          ),
          producto.id)
        : (
            await api<{ id: string }>(`/api/comercios/${slug}/productos`, {
              method: "POST",
              body: JSON.stringify({ ...campos, disponible: true }),
            })
          ).id;

      /*
       * La foto se sube DESPUÉS de guardar, y su fallo no tumba la operación:
       * el producto ya existe y sin foto se ve con su mosaico. Obligar a
       * repetir el formulario entero porque la imagen no subió sería castigar
       * al comercio por un problema de red.
       */
      if (foto) {
        try {
          await fetch(
            `/api/comercios/${slug}/productos/${id}/imagen?ancho=${foto.ancho}&alto=${foto.alto}`,
            {
              method: "PUT",
              headers: { "content-type": "image/webp" },
              body: foto.blob,
            },
          );
        } catch {
          // Silencio a propósito: ver el comentario de arriba.
        }
      }

      onGuardado();
    } catch (err) {
      setError(textoDeError(err));
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-tinta/45 backdrop-blur-sm sm:items-center sm:p-5">
      <form
        onSubmit={guardar}
        className="entra w-full max-w-md rounded-t-lg bg-papel-alto p-5 sm:rounded-lg"
      >
        <h2 className="titulo text-2xl">
          {producto ? "Editar producto" : "Nuevo producto"}
        </h2>
        <p className="mt-1 text-sm text-tinta-suave">
          El tiempo de preparación no es un adorno: es lo que el sistema usa para
          decidir cuántos pedidos caben en cada hora. Medilo con cronómetro.
        </p>

        <div className="mt-4 space-y-3">
          <Campo etiqueta="Nombre" valor={nombre} onCambiar={setNombre} requerido />
          <Campo
            etiqueta="Descripción (opcional)"
            valor={descripcion}
            onCambiar={setDescripcion}
          />
          <SelectorFoto
            nombre={nombre}
            urlActual={producto?.imagenUrl ?? null}
            onElegir={setFoto}
            onQuitar={() => setFoto(null)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta="Precio (C$)"
              valor={precio}
              onCambiar={setPrecio}
              tipo="number"
              requerido
            />
            <Campo
              etiqueta="Minutos de cocina"
              valor={tiempo}
              onCambiar={setTiempo}
              tipo="number"
              requerido
            />
          </div>

          <fieldset className="rounded-sm border border-borde p-3">
            <legend className="etiqueta px-1">Cómo se pide</legend>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={anticipaEfectivo}
                onChange={(e) => {
                  setTocado(true);
                  setAnticipable(e.target.checked);
                }}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-marca)]"
              />
              <span className="text-sm">
                <span className="font-semibold">Se puede reservar con anticipación</span>
                <span className="mt-0.5 block text-tinta-suave">
                  Apagalo para lo que se despacha en el momento y no tiene
                  sentido reservar. Sigue apareciendo en el menú, pero solo se
                  pide en el mostrador.
                </span>
              </span>
            </label>

            {inutil && (
              <p className="mt-2 rounded-sm bg-brasa-claro px-2 py-1.5 text-[0.6875rem]">
                Se prepara en menos de {tiempoMin} min, que es el mínimo para
                anticipar en este comercio: va a aparecer en el menú, pero nadie
                va a poder reservarlo hasta que subas ese mínimo.
              </p>
            )}
          </fieldset>
        </div>

        {error && (
          <div className="mt-3">
            <ErrorVista texto={error} />
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCerrar}
            className="presiona flex-1 rounded-full border border-borde px-6 py-3 font-medium"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="presiona brillo flex-1 rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            {enviando ? "Guardando…" : producto ? "Guardar cambios" : "Agregar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambiar,
  tipo = "text",
  requerido = false,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  tipo?: string;
  requerido?: boolean;
  ayuda?: string;
}) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      <input
        type={tipo}
        required={requerido}
        step={tipo === "number" ? "any" : undefined}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        className="mt-1 w-full rounded-sm border border-borde bg-papel-alto px-3 py-2.5 text-base focus:border-marca-texto focus:outline-none"
      />
      {ayuda && (
        <span className="mt-1 block text-xs text-tinta-suave">{ayuda}</span>
      )}
    </label>
  );
}

// ----------------------------------------------------------------- Franjas ---

function Franjas({
  estado,
  slug,
  onCambio,
}: {
  estado: Estado;
  slug: string;
  onCambio: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [horaInicio, setHoraInicio] = useState("11:30");
  const [horaFin, setHoraFin] = useState("13:00");
  const [aviso, setAviso] = useState<string | null>(null);

  async function generar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    try {
      const r = await api<{ creadas: number; dias: number }>(
        `/api/comercios/${slug}/franjas/generar`,
        {
          method: "POST",
          body: JSON.stringify({ desde, hasta, horaInicio, horaFin }),
        },
      );
      setAviso(
        r.creadas === 0
          ? `Esos ${r.dias} día${r.dias === 1 ? "" : "s"} ya tenían sus horas abiertas. No se tocó nada.`
          : `Se abrieron ${r.creadas} horas en ${r.dias} día${r.dias === 1 ? "" : "s"}.`,
      );
      onCambio();
    } catch (err) {
      setError(textoDeError(err));
    }
  }

  async function cambiarFranja(id: string, datos: Record<string, unknown>) {
    setOcupado(id);
    setError(null);
    try {
      await api(`/api/comercios/${slug}/franjas/${id}`, {
        method: "PATCH",
        body: JSON.stringify(datos),
      });
      onCambio();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setOcupado(null);
    }
  }

  // Agrupadas por día: una lista plana de cien franjas no se navega.
  const porDia = new Map<string, FranjaAdmin[]>();
  for (const f of estado.franjas) {
    const dia = f.inicio.slice(0, 10);
    porDia.set(dia, [...(porDia.get(dia) ?? []), f]);
  }

  return (
    <section>
      <form onSubmit={generar} className="tarjeta mb-5 p-4">
        <h2 className="font-semibold">Abrir horas de retiro</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Se parten en franjas de {estado.comercio.anchoFranjaMin} minutos, con{" "}
          {estado.comercio.capacidadSugerida} minutos-cocina cada una
          ({estado.comercio.personalCocina} en cocina ×{" "}
          {estado.comercio.anchoFranjaMin} min). Volver a generar un día que ya
          tiene horas no borra nada.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Campo etiqueta="Desde" valor={desde} onCambiar={setDesde} tipo="date" />
          <Campo etiqueta="Hasta" valor={hasta} onCambiar={setHasta} tipo="date" />
          <Campo
            etiqueta="Abre"
            valor={horaInicio}
            onCambiar={setHoraInicio}
            tipo="time"
          />
          <Campo etiqueta="Cierra" valor={horaFin} onCambiar={setHoraFin} tipo="time" />
        </div>

        <button
          type="submit"
          className="presiona brillo mt-4 rounded-full bg-marca-fondo px-5 py-2.5 text-sm font-semibold text-white"
        >
          Abrir horas
        </button>

        {aviso && (
          <p className="mt-3 rounded-sm bg-turno-claro px-3 py-2 text-sm">
            {aviso}
          </p>
        )}
      </form>

      {error && (
        <div className="mb-4">
          <ErrorVista texto={error} />
        </div>
      )}

      {porDia.size === 0 && (
        <p className="tarjeta p-8 text-center text-sm text-tinta-suave">
          No hay horas abiertas de hoy en adelante. Abrí algunas arriba.
        </p>
      )}

      <div className="space-y-5">
        {[...porDia.entries()].map(([dia, franjas]) => (
          <div key={dia}>
            <h3 className="etiqueta mb-2">{fechaCorta(dia + "T12:00:00")}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {franjas.map((f) => (
                <FilaFranja
                  key={f.id}
                  franja={f}
                  ocupado={ocupado === f.id}
                  onCambiar={cambiarFranja}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilaFranja({
  franja,
  ocupado,
  onCambiar,
}: {
  franja: FranjaAdmin;
  ocupado: boolean;
  onCambiar: (id: string, datos: Record<string, unknown>) => void;
}) {
  const ocupacion =
    franja.capacidadEfectivaMin > 0
      ? franja.cargaAsignada / franja.capacidadEfectivaMin
      : 0;

  function alternarApertura() {
    if (franja.abierta && franja.pedidosVivos > 0) {
      const seguir = confirm(
        `Esta hora tiene ${franja.pedidosVivos} pedido${
          franja.pedidosVivos === 1 ? "" : "s"
        } ya comprometido${franja.pedidosVivos === 1 ? "" : "s"}. ` +
          `Cerrarla impide pedidos nuevos, pero esos hay que prepararlos igual. ¿Cerrar?`,
      );
      if (!seguir) return;
    }
    onCambiar(franja.id, { abierta: !franja.abierta });
  }

  return (
    <li className={`tarjeta p-3 ${franja.abierta ? "" : "opacity-60"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="hora text-lg font-semibold">
          {horaCorta(franja.inicio)}
        </span>
        <span className="hora text-xs text-tinta-suave">
          {franja.cargaAsignada}/{franja.capacidadEfectivaMin} min
        </span>
      </div>

      <div className="my-2 h-1.5 overflow-hidden rounded-full bg-papel-medio">
        <div
          className={ocupacion >= 0.95 ? "h-full bg-brasa" : "h-full bg-marca-fondo"}
          style={{ width: `${Math.min(100, ocupacion * 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-tinta-suave">
          {franja.pedidosVivos} pedido{franja.pedidosVivos === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          disabled={ocupado}
          onClick={alternarApertura}
          className="presiona rounded-full border border-borde px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
        >
          {franja.abierta ? "Cerrar" : "Abrir"}
        </button>
      </div>
    </li>
  );
}

// ----------------------------------------------------------------- Ajustes ---

function Ajustes({
  estado,
  slug,
  onCambio,
}: {
  estado: Estado;
  slug: string;
  onCambio: () => void;
}) {
  const c = estado.comercio;
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    personalCocina: String(c.personalCocina),
    anchoFranjaMin: String(c.anchoFranjaMin),
    factorSeguridad: c.factorSeguridad.toFixed(2),
    tiempoMinAnticipable: String(c.tiempoMinAnticipable),
    margenCutoffMin: String(c.margenCutoffMin),
    minutosNoShow: String(c.minutosNoShow),
    maxPedidosActivos: String(c.maxPedidosActivos),
  });

  async function aplicar(datos: Record<string, unknown>, exito: string) {
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      await api(`/api/comercios/${slug}/admin`, {
        method: "PATCH",
        body: JSON.stringify(datos),
      });
      setAviso(exito);
      onCambio();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="tarjeta p-4">
        <h2 className="font-semibold">Estado del comercio</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Pausar deja de aceptar pedidos nuevos al instante. Los ya
          comprometidos siguen en pie.
        </p>
        <div className="mt-3 flex gap-2">
          {(["ABIERTO", "PAUSADO", "CERRADO"] as const).map((e) => (
            <button
              key={e}
              type="button"
              disabled={enviando}
              onClick={() =>
                aplicar(
                  { estadoOperacion: e },
                  `El comercio quedó ${e.toLowerCase()}.`,
                )
              }
              className={`presiona rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
                c.estadoOperacion === e
                  ? "bg-marca-fondo text-white"
                  : "border border-borde text-tinta-suave"
              }`}
            >
              {e === "ABIERTO" ? "Abierto" : e === "PAUSADO" ? "Pausado" : "Cerrado"}
            </button>
          ))}
        </div>
      </div>

      <form
        className="tarjeta p-4"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar(
            {
              personalCocina: Number(form.personalCocina),
              anchoFranjaMin: Number(form.anchoFranjaMin),
              factorSeguridad: Number(form.factorSeguridad),
              tiempoMinAnticipable: Number(form.tiempoMinAnticipable),
              margenCutoffMin: Number(form.margenCutoffMin),
              minutosNoShow: Number(form.minutosNoShow),
              maxPedidosActivos: Number(form.maxPedidosActivos),
            },
            "Parámetros guardados.",
          );
        }}
      >
        <h2 className="font-semibold">Parámetros del modelo</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Estos números deciden cuántos pedidos entran en cada hora. Cambiarlos a
          mitad del piloto queda registrado, porque el análisis final tiene que
          poder explicar por qué los datos cambian de comportamiento.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Personal en cocina"
            tipo="number"
            valor={form.personalCocina}
            onCambiar={(v) => setForm({ ...form, personalCocina: v })}
            ayuda={`Con ${form.anchoFranjaMin} min por franja da ${
              Number(form.personalCocina) * Number(form.anchoFranjaMin) || 0
            } minutos-cocina por hora.`}
          />
          <Campo
            etiqueta="Δ · minutos por franja"
            tipo="number"
            valor={form.anchoFranjaMin}
            onCambiar={(v) => setForm({ ...form, anchoFranjaMin: v })}
            ayuda="Más angosta: promesa más precisa, más rechazos. Más ancha: al revés."
          />
          <Campo
            etiqueta="α · factor de seguridad"
            tipo="number"
            valor={form.factorSeguridad}
            onCambiar={(v) => setForm({ ...form, factorSeguridad: v })}
            ayuda="Con 1,00 se promete toda la cocina y cualquier imprevisto incumple. Bajarlo protege la promesa y cuesta ventas."
          />
          <Campo
            etiqueta="t_mín · anticipable desde"
            tipo="number"
            valor={form.tiempoMinAnticipable}
            onCambiar={(v) => setForm({ ...form, tiempoMinAnticipable: v })}
            ayuda="Por debajo de esto, anticipar no le ahorra tiempo a nadie y ocupa una hora igual."
          />
          <Campo
            etiqueta="Margen de cierre (min)"
            tipo="number"
            valor={form.margenCutoffMin}
            onCambiar={(v) => setForm({ ...form, margenCutoffMin: v })}
            ayuda="Colchón sobre el tiempo de cocina para dejar de aceptar pedidos de una hora."
          />
          <Campo
            etiqueta="No-show a los (min)"
            tipo="number"
            valor={form.minutosNoShow}
            onCambiar={(v) => setForm({ ...form, minutosNoShow: v })}
            ayuda="Desde que el pedido está listo, no desde la hora prometida."
          />
          <Campo
            etiqueta="Pedidos activos por persona"
            tipo="number"
            valor={form.maxPedidosActivos}
            onCambiar={(v) => setForm({ ...form, maxPedidosActivos: v })}
            ayuda="Evita que una sola persona ocupe varias horas a la vez."
          />
        </div>

        {error && (
          <div className="mt-4">
            <ErrorVista titulo="No se guardó" texto={error} />
          </div>
        )}
        {aviso && (
          <p className="mt-4 rounded-sm bg-turno-claro px-3 py-2 text-sm">
            {aviso}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="presiona brillo mt-5 rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {enviando ? "Guardando…" : "Guardar parámetros"}
        </button>
      </form>

      <div className="tarjeta p-4">
        <h2 className="font-semibold">Tu comercio en TURNO</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Este es el enlace que va en el cartel con el QR.
        </p>
        <p className="hora mt-2 flex items-center gap-2 text-sm">
          <CodigoPedido codigo={c.slug.slice(0, 3).toUpperCase() + "-QR"} />
          <span className="text-tinta-suave">/c/{c.slug}</span>
        </p>
        <Link
          href={`/comercio/${slug}/carteles`}
          className="presiona brillo mt-4 inline-block rounded-full bg-marca-fondo px-5 py-2.5 text-sm font-semibold text-white"
        >
          Ver carteles para imprimir
        </Link>
      </div>
    </section>
  );
}
