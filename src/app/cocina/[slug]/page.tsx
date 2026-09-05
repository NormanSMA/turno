"use client";

/**
 * Tablero de cocina. Dos observaciones de uso lo definen:
 *
 *  1. **Una lista no dice qué hacer.** Tres columnas, una por estado, y el
 *     pedido avanza de izquierda a derecha: la columna ES el estado.
 *  2. **Los códigos parecidos se confunden.** `XLZ-Y4B` y `YLZ-Y4B` se leen
 *     igual con prisa, así que cada uno lleva color propio (`CodigoPedido`).
 *
 * ADR-05: sondeo cada 5 s. Una petición idempotente que se reintenta sola
 * aguanta el WiFi del campus mejor que una conexión persistente.
 */

import { use, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CodigoPedido } from "@/components/CodigoPedido";
import { EscanerRetiro } from "@/components/EscanerRetiro";
import { mismoCodigo, normalizarCodigo, pareceCompleto } from "@/core/codigo-retiro";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { prioridadCocina } from "@/core/urgencia";
import { proximoCuello } from "@/core/cuello";
import { Icono } from "@/components/iconos";
import { HojaProblemaCocina } from "@/components/HojaProblemaCocina";
import { useAhora } from "@/lib/reloj";
import {
  despertarAudio,
  guardarSonido,
  sonarPedidoNuevo,
  useSonido,
  vibrarPedidoNuevo,
} from "@/lib/sonido";
import { IconoEstado, type EstadoPedido } from "@/components/IconoEstado";
import { MarcaTurno } from "@/components/marca";
import { api, ErrorApi, fechaCorta, horaCorta } from "@/lib/cliente";
import { conTransicionDeVista } from "@/lib/movimiento";

interface PedidoCocina {
  id: string;
  codigo: string;
  estado: "RECIBIDO" | "EN_PREPARACION" | "LISTO";
  cargaEstimadaMin: number;
  franjaInicio: string;
  franjaFin: string;
  minutosRestantes: number;
  items: { nombre: string; cantidad: number; tiempoPreparacionMin: number }[];
}

interface FranjaCocina {
  id: string;
  inicio: string;
  fin: string;
  capacidadEfectivaMin: number;
  cargaAsignada: number;
  ocupacion: number;
}

interface Tablero {
  generadoEn: string;
  comercio: { nombre: string; estadoOperacion: string };
  pedidos: PedidoCocina[];
  franjas: FranjaCocina[];
}

const COLUMNAS = [
  {
    estado: "RECIBIDO" as const,
    titulo: "En espera",
    detalle: "Todavía no se empieza",
    accion: { hacia: "EN_PREPARACION" as const, texto: "Empezar" },
  },
  {
    estado: "EN_PREPARACION" as const,
    titulo: "En cocina",
    detalle: "Se está preparando",
    accion: { hacia: "LISTO" as const, texto: "Marcar listo" },
  },
  {
    estado: "LISTO" as const,
    titulo: "Esperando retiro",
    detalle: "El estudiante pasa a buscarlo",
    accion: { hacia: "RETIRADO" as const, texto: "Entregado" },
  },
];

function cuandoVence(p: PedidoCocina): string {
  if (p.minutosRestantes < 0) return `${Math.abs(p.minutosRestantes)} min tarde`;
  if (p.minutosRestantes === 0) return "ahora";
  if (p.minutosRestantes <= 120) return `en ${p.minutosRestantes} min`;
  return fechaCorta(p.franjaInicio);
}

export default function Pagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desconectado, setDesconectado] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Un solo reloj para todo el tablero: si cada tarjeta llevara el suyo, dos
  // pedidos podrían mostrar urgencias calculadas con segundos distintos.
  const ahora = useAhora(15_000);
  // §32: el pedido sobre el que se está reportando un problema.
  const [problema, setProblema] = useState<{ id: string; codigo: string } | null>(
    null,
  );
  // §30. Arranca apagado y la preferencia es del DISPOSITIVO: la tablet del
  // mostrador y la del fondo no quieren lo mismo, y son la misma cuenta.
  const sonido = useSonido();
  /*
   * Los ids ya vistos viven en una ref y no en estado: sirven para decidir si
   * suena, que es un efecto secundario, no algo que se dibuje. En estado
   * provocarían un render por cada sondeo.
   */
  const vistos = useRef<Set<string> | null>(null);

  const cargar = useCallback(() => {
    api<Tablero>(`/api/cocina/${slug}`)
      .then((t) => {
        /*
         * Sonar solo por pedidos NUEVOS.
         *
         * La primera carga no suena aunque haya doce en cola: el operador
         * acaba de abrir el tablero y ya los está viendo. Un sonido ahí sería
         * ruido por algo que no cambió.
         */
        const ahoraIds = new Set(t.pedidos.map((p) => p.id));
        if (vistos.current === null) {
          vistos.current = ahoraIds;
        } else {
          const hayNuevo = t.pedidos.some(
            (p) => p.estado === "RECIBIDO" && !vistos.current!.has(p.id),
          );
          vistos.current = ahoraIds;
          if (hayNuevo) {
            sonarPedidoNuevo();
            vibrarPedidoNuevo();
          }
        }

        setTablero(t);
        setDesconectado(false);
        setError(null);
      })
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) {
          router.replace(`/acceso?volver=/cocina/${slug}`);
          return;
        }
        if (e instanceof ErrorApi && e.status === 403) {
          setError(
            "Esta cuenta no opera este comercio. Entrá con la cuenta del comercio.",
          );
          return;
        }
        // Un fallo de red NO borra la pantalla: el operador sigue viendo la
        // última cola conocida, con aviso de que está desactualizada.
        setDesconectado(true);
      });
  }, [slug, router]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [cargar]);

  /**
   * Cancelación operativa con motivo (§32).
   *
   * Reusa la misma puerta que cualquier otro cambio de estado —una sola ruta
   * de transición, con sus validaciones y su liberación de capacidad— y le
   * agrega la nota. No hay un camino especial para cancelar desde la cocina.
   */
  async function cancelarConMotivo(pedidoId: string, nota: string) {
    setOcupado(pedidoId);
    try {
      await api(`/api/pedidos/${pedidoId}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "CANCELADO", nota }),
      });
      const nuevo = await api<Tablero>(`/api/cocina/${slug}`);
      conTransicionDeVista(() => {
        flushSync(() => {
          setTablero(nuevo);
          setDesconectado(false);
        });
      });
      setProblema(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo cancelar.");
    } finally {
      setOcupado(null);
    }
  }

  async function avanzar(p: PedidoCocina, hacia: EstadoPedido) {
    setOcupado(p.id);
    try {
      await api(`/api/pedidos/${p.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: hacia }),
      });

      // El tablero se pide ANTES de abrir la transición, y recién con la
      // respuesta en mano se aplica el cambio. Es lo que permite que el
      // navegador capture un antes y un después consecutivos y anime la
      // tarjeta viajando de columna en vez de hacerla parpadear.
      //
      // `flushSync` es necesario acá y solo acá: `startViewTransition` toma la
      // foto del "después" apenas retorna su callback, así que el DOM tiene que
      // estar actualizado de forma síncrona dentro de él.
      const nuevo = await api<Tablero>(`/api/cocina/${slug}`);
      conTransicionDeVista(() => {
        flushSync(() => {
          setTablero(nuevo);
          setDesconectado(false);
        });
      });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo actualizar.");
    } finally {
      setOcupado(null);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <ErrorVista titulo="No se puede abrir la cocina" texto={error} />
      </main>
    );
  }

  const porEstado = (estado: string) =>
    (tablero?.pedidos ?? []).filter((p) => p.estado === estado);

  const pausado = tablero?.comercio.estadoOperacion !== "ABIERTO";

  return (
    <main className="min-h-dvh bg-papel-medio">
      <header className="border-b border-borde bg-papel-alto">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <MarcaTurno size={34} />
          <div className="min-w-0">
            <p className="etiqueta">Cocina</p>
            <h1 className="titulo truncate text-2xl">
              {tablero?.comercio.nombre ?? "Cargando…"}
            </h1>
          </div>

          {pausado && tablero && (
            <span className="rounded-full bg-brasa-claro px-3 py-1 text-xs font-semibold">
              Pedidos pausados
            </span>
          )}

          {/* El interruptor va en la cabecera y no en ajustes: el ambiente de
              una cocina cambia durante el día, y una preferencia que hay que ir
              a buscar no se cambia — se aguanta o se apaga el volumen entero
              del dispositivo, que es peor. */}
          <button
            type="button"
            role="switch"
            aria-checked={sonido}
            onClick={() => {
              const nuevo = !sonido;
              // El clic ES el gesto que los navegadores exigen para permitir
              // audio: el contexto se crea acá o el primer aviso no suena.
              if (nuevo) despertarAudio();
              guardarSonido(nuevo);
              if (nuevo) sonarPedidoNuevo();
            }}
            className={`presiona ml-auto flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
              sonido ? "border-marca-texto bg-turno-claro text-marca-texto" : "border-borde"
            }`}
          >
            <Icono nombre="campana" size={16} />
            {sonido ? "Sonido activado" : "Sonido apagado"}
          </button>

          <Link
            href={`/comercio/${slug}`}
            className="presiona rounded-full border border-borde px-4 py-2 text-sm font-medium"
          >
            Panel
          </Link>

          <p
            className="hora w-full text-xs text-tinta-suave sm:w-auto"
            aria-live="polite"
          >
            {desconectado ? (
              <span className="text-brasa">
                Sin conexión · mostrando la última cola conocida
              </span>
            ) : tablero ? (
              `Actualizado ${horaCorta(tablero.generadoEn)}`
            ) : (
              ""
            )}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
        {tablero && (
          <BuscarPedido
            pedidos={tablero.pedidos}
            ocupado={ocupado}
            onAvanzar={avanzar}
          />
        )}

        {tablero && <AvisoCuello pedidos={tablero.pedidos} ahora={ahora} />}

        {tablero && tablero.franjas.length > 0 && (
          <CargaPorHora franjas={tablero.franjas} />
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {COLUMNAS.map((col) => {
            const pedidos = porEstado(col.estado);
            return (
              <section
                key={col.estado}
                aria-labelledby={`col-${col.estado}`}
                className="rounded-lg bg-papel-alto p-3"
              >
                <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
                  <div>
                    <h2 id={`col-${col.estado}`} className="font-semibold">
                      {col.titulo}
                    </h2>
                    <p className="text-xs text-tinta-suave">{col.detalle}</p>
                  </div>
                  <span className="hora rounded-full bg-papel-medio px-2.5 py-1 text-sm font-bold">
                    {pedidos.length}
                  </span>
                </header>

                {!tablero && (
                  <div className="space-y-3">
                    <Esqueleto className="h-32 w-full" />
                    <Esqueleto className="h-32 w-full" />
                  </div>
                )}

                {tablero && pedidos.length === 0 && (
                  <p className="rounded-md border border-dashed border-borde px-4 py-8 text-center text-sm text-tinta-suave">
                    Nada acá.
                  </p>
                )}

                <ul className="space-y-3">
                  {pedidos.map((p) => (
                    <TarjetaCocina
                      key={p.id}
                      pedido={p}
                      accion={col.accion}
                      ocupado={ocupado === p.id}
                      ahora={ahora}
                      onProblema={setProblema}
                      onAvanzar={avanzar}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {/* §32: la salida cuando la cocina no puede cumplir. Se monta una sola
          vez para todo el tablero; la tarjeta solo dice cuál pedido. */}
      <HojaProblemaCocina
        pedido={problema}
        onCerrar={() => setProblema(null)}
        onConfirmar={cancelarConMotivo}
      />
    </main>
  );
}

/**
 * El próximo cuello de botella (§28): cuándo va a doler, que es lo único sobre
 * lo que la cocina todavía puede actuar. Calla mientras hay holgura — a quien
 * se le avisa siempre, deja de mirar.
 */
/**
 * Buscar un pedido por su código, escaneando o escribiendo.
 *
 * ## Por qué las dos vías terminan en el mismo sitio
 *
 * El QR del estudiante lleva **el mismo código** que está impreso debajo en
 * grande, no una URL ni un identificador interno. Así que escanear no es un
 * camino de entrega aparte: es una forma rápida de rellenar este campo. Si
 * fueran dos caminos hacia el estado RETIRADO, acabarían comportándose
 * distinto, y el que menos se usa es el que se rompe sin que nadie lo note.
 *
 * ## Por qué no filtra el tablero
 *
 * Buscar muestra el pedido encontrado **encima** del tablero, sin tocar las
 * columnas. En el mostrador se está confirmando un pedido concreto mientras la
 * cocina sigue trabajando detrás; reorganizar el tablero por una búsqueda le
 * cambiaría la pantalla a quien está cocinando.
 */
function BuscarPedido({
  pedidos,
  ocupado,
  onAvanzar,
}: {
  pedidos: PedidoCocina[];
  ocupado: string | null;
  onAvanzar: (p: PedidoCocina, hacia: EstadoPedido) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [escaneando, setEscaneando] = useState(false);

  const encontrado =
    normalizarCodigo(codigo).length >= 3
      ? (pedidos.find((p) => mismoCodigo(p.codigo, codigo)) ?? null)
      : null;
  // Solo se declara "no está" con el código completo. Mientras se teclea, la
  // mitad de un código no encuentra nada, y eso no es un fallo que reportar.
  const sinResultado = pareceCompleto(codigo) && !encontrado;

  const accion = encontrado
    ? COLUMNAS.find((c) => c.estado === encontrado.estado)?.accion
    : undefined;

  return (
    <section className="mb-4 rounded-lg bg-papel-alto p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="etiqueta">Código del pedido</span>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            /* `characters`, no `words`: el código no son palabras y el teclado
               del móvil pondría mayúscula solo en la primera. */
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC-DEF"
            aria-label="Buscar un pedido por su código de retiro"
            className="hora mt-1 w-full rounded-sm border border-borde bg-papel-alto px-3 py-2.5 text-lg font-semibold uppercase tracking-widest outline-none focus:border-marca-texto"
          />
        </label>

        <button
          type="button"
          onClick={() => setEscaneando(true)}
          className="presiona toque flex items-center gap-2 rounded-full bg-marca-fondo px-5 py-2.5 font-semibold text-white"
        >
          <Icono nombre="camara" size={18} />
          Escanear
        </button>

        {codigo !== "" && (
          <button
            type="button"
            onClick={() => setCodigo("")}
            className="presiona toque rounded-full border border-borde px-4 py-2.5 text-sm font-medium text-tinta-suave"
          >
            Limpiar
          </button>
        )}
      </div>

      {encontrado && (
        <div className="entra mt-3 rounded-md border-2 border-marca-texto p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CodigoPedido codigo={encontrado.codigo} tamano="lg" />
              <p className="mt-1 text-sm text-tinta-suave">
                {encontrado.items
                  .map((i) => `${i.cantidad}× ${i.nombre}`)
                  .join(" · ")}
              </p>
            </div>

            {accion && (
              <button
                type="button"
                disabled={ocupado === encontrado.id}
                onClick={() => {
                  onAvanzar(encontrado, accion.hacia);
                  // Se limpia al actuar: en el mostrador viene otro detrás, y
                  // dejar el código puesto invita a tocar dos veces el mismo.
                  setCodigo("");
                }}
                className="presiona brillo rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40"
              >
                {ocupado === encontrado.id ? "Guardando…" : accion.texto}
              </button>
            )}
          </div>
        </div>
      )}

      {sinResultado && (
        <p role="status" className="mt-3 rounded-sm bg-brasa-claro px-3 py-2 text-sm">
          Ese código no está en la cola. Puede que ya se haya entregado, que sea
          de otro comercio, o que esté mal escrito.
        </p>
      )}

      {escaneando && (
        <EscanerRetiro
          onLeer={(texto) => {
            setCodigo(texto);
            setEscaneando(false);
          }}
          onCerrar={() => setEscaneando(false)}
        />
      )}
    </section>
  );
}

function AvisoCuello({
  pedidos,
  ahora,
}: {
  pedidos: PedidoCocina[];
  ahora: Date;
}) {
  const c = proximoCuello(
    pedidos.map((p) => ({
      estado: p.estado,
      cargaMin: p.cargaEstimadaMin,
      franjaFin: new Date(p.franjaFin),
    })),
    ahora,
  );

  if (c.nivel === "HOLGADO") return null;

  const enRiesgo = c.nivel === "EN_RIESGO";

  return (
    <div
      role="status"
      className={`mb-4 rounded-lg border-2 px-4 py-3 ${
        enRiesgo ? "border-alerta bg-alerta-claro" : "border-maiz bg-brasa-claro"
      }`}
    >
      <p className="flex items-center gap-2 text-base font-bold">
        <Icono nombre="reloj" size={18} />
        {enRiesgo
          ? `Próximos ${c.ventanaMin} min: no dan las manos`
          : `Próximos ${c.ventanaMin} min: va ajustado`}
      </p>
      <p className="hora mt-1 text-sm">
        {c.pedidos} {c.pedidos === 1 ? "pedido" : "pedidos"} · {c.cargaMin} min
        de cocina · {c.disponibleMin} min disponibles
      </p>
      <p className="mt-1 text-xs text-tinta-suave">
        {enRiesgo
          ? "Si nada cambia, alguno va a salir después de su hora. Conviene empezar por el que vence antes o pausar pedidos nuevos."
          : "Todavía entra, pero sin margen. Un imprevisto ahora se nota."}
      </p>
    </div>
  );
}

function TarjetaCocina({
  pedido,
  accion,
  ocupado,
  ahora,
  onAvanzar,
  onProblema,
}: {
  pedido: PedidoCocina;
  accion: { hacia: EstadoPedido; texto: string };
  ocupado: boolean;
  /** El reloj del tablero, compartido para que todas las tarjetas concuerden. */
  ahora: Date;
  onAvanzar: (p: PedidoCocina, hacia: EstadoPedido) => void;
  onProblema: (p: PedidoCocina) => void;
}) {
  const [apuntando, setApuntando] = useState(false);

  /*
   * Urgencia por CARGA, no por umbral fijo (§29). Antes todo era "pronto" a
   * los cinco minutos: un café de 3 min está tranquilo ahí y un almuerzo de 15
   * ya va tarde. Igualarlos hace que la cocina deje de creerle al aviso.
   */
  const { prioridad } = prioridadCocina({
    estado: pedido.estado,
    franjaFin: new Date(pedido.franjaFin),
    ahora,
    cargaMin: pedido.cargaEstimadaMin,
  });

  const marco =
    prioridad === "ATRASADO"
      ? "border-alerta bg-alerta-claro"
      : prioridad === "URGENTE"
        ? "border-maiz bg-brasa-claro"
        : "border-borde";

  return (
    // `viewTransitionName` es lo que le dice al navegador que la tarjeta de
    // la columna vieja y la de la nueva son EL MISMO objeto y hay que
    // interpolarlo. El nombre tiene que ser único en la página y estable entre
    // capturas: el id del pedido cumple las dos cosas.
    <li
      style={{ viewTransitionName: `pedido-${pedido.id}` }}
      className={`entra rounded-md border bg-papel-alto p-3 ${marco}`}
    >
      <div className="flex items-start justify-between gap-2">
        <CodigoPedido codigo={pedido.codigo} tamano="lg" />
        <div className="text-right">
          <p className="hora text-lg font-semibold leading-tight">
            {horaCorta(pedido.franjaFin)}
          </p>
          <p
            className={`hora text-xs ${
              prioridad === "ATRASADO"
                ? "font-semibold text-alerta"
                : prioridad === "URGENTE"
                  ? "font-semibold text-brasa"
                  : "text-tinta-suave"
            }`}
          >
            {cuandoVence(pedido)}
          </p>
        </div>
      </div>

      {prioridad !== "NORMAL" && (
        /* El color nunca va solo (§46): en una cocina con luz de sartén y una
           pantalla compartida, la palabra es lo que se lee. */
        <p
          className={`mt-2 inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
            prioridad === "ATRASADO"
              ? "bg-alerta text-white"
              : "bg-maiz text-tinta"
          }`}
        >
          {prioridad === "ATRASADO" ? "Atrasado" : "Urgente"}
        </p>
      )}

      <ul className="my-3 space-y-0.5 text-sm">
        {pedido.items.map((i, n) => (
          <li key={n}>
            <span className="hora font-bold">{i.cantidad}×</span> {i.nombre}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <span className="hora text-xs text-tinta-suave">
          {pedido.cargaEstimadaMin} min de cocina
        </span>

        {/* §31: la salida de emergencia vive en la tarjeta, no a dos
            pantallas. Cuando se acaba el pollo, el operador tiene las manos
            ocupadas y una fila enfrente; obligarlo a navegar es garantizar que
            el pedido se quede ahí ocupando capacidad que ya no se puede
            honrar. Va en texto y discreto: es la excepción, no la acción. */}
        {pedido.estado !== "LISTO" && (
          <button
            type="button"
            onClick={() => onProblema(pedido)}
            className="presiona rounded-full px-2 py-1 text-xs font-medium text-tinta-suave underline decoration-dotted"
          >
            No puedo
          </button>
        )}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onAvanzar(pedido, accion.hacia)}
          onPointerEnter={() => setApuntando(true)}
          onPointerLeave={() => setApuntando(false)}
          onFocus={() => setApuntando(true)}
          onBlur={() => setApuntando(false)}
          className="presiona flex items-center gap-2 rounded-full bg-marca-fondo px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
        >
          {/* El icono muestra dónde ESTÁ el pedido y, al apuntar el botón, se
              transforma en dónde QUEDARÁ: reloj → llama → campana → palomita.
              Es una vista previa del resultado antes de comprometerlo, que en
              un tablero donde el toque es irreversible vale más que un texto.

              Se ancló al puntero y no al tiempo de espera a propósito: la
              petición tarda decenas de milisegundos, así que una animación
              atada a ella no se llegaría a ver nunca — sería adorno con
              coartada. Anclada al puntero, se ve siempre y dice algo. */}
          <IconoEstado
            estado={apuntando || ocupado ? accion.hacia : pedido.estado}
          />
          {accion.texto}
        </button>
      </div>
    </li>
  );
}

/**
 * Carga comprometida por franja. Es la misma información que ve el estudiante
 * en la regla, pero del lado de quien cocina: cuánto trabajo entra en cada
 * ventana y cuál está por llenarse.
 */
function CargaPorHora({ franjas }: { franjas: FranjaCocina[] }) {
  return (
    <section aria-labelledby="carga" className="rounded-lg bg-papel-alto p-4">
      <h2 id="carga" className="etiqueta mb-3">
        Carga comprometida por hora
      </h2>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {franjas.map((f) => {
          const pct = Math.min(100, f.ocupacion * 100);
          const lleno = pct >= 95;
          return (
            <div key={f.id} className="min-w-14 flex-1">
              <div className="relative h-20 overflow-hidden rounded-sm bg-papel-medio">
                <div
                  className={`absolute inset-x-0 bottom-0 transition-[height] ${
                    lleno ? "bg-brasa" : "bg-marca-fondo"
                  }`}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <p className="hora mt-1 text-center text-xs font-medium">
                {horaCorta(f.inicio)}
              </p>
              <p className="hora text-center text-[0.625rem] text-tinta-suave">
                {f.cargaAsignada}/{f.capacidadEfectivaMin}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-tinta-suave">
        Minutos de cocina comprometidos sobre los disponibles. Cuando una hora se
        llena, el sistema deja de aceptar pedidos para ella y ofrece la
        siguiente.
      </p>
    </section>
  );
}
