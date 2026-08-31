"use client";

/**
 * El receso, dibujado y jugable.
 *
 * No es una ilustración: es el mecanismo. Dos líneas de tiempo sobre el MISMO
 * receso de 30 minutos, y la diferencia visible entre ellas es todo el
 * argumento del producto. La preparación no desaparece — se corre fuera del
 * receso, a mientras el estudiante está en clase.
 *
 * Por qué se anima, contra la regla del ADR-11 («el movimiento informa o no
 * existe»): las barras se llenan **en el tiempo**, así que verlas avanzar es
 * literalmente ver el receso consumirse. Una barra estática dice "esto mide
 * diez minutos"; una que se llena dice "estos diez minutos se te van". Es el
 * mismo dato contado de una forma que se entiende sin leer.
 *
 * Por qué es interactiva: tocar un tramo lo expande y dice qué es y cuánto
 * dura. El estudiante que no cree el número puede auditarlo tramo por tramo, y
 * quien solo mira de reojo igual recibe el mensaje por la forma.
 *
 * Arranca al entrar en pantalla, no al cargar la página: animar algo que está
 * abajo del pliegue lo gasta sin que nadie lo vea.
 */

import { useEffect, useRef, useState } from "react";
import { NumeroAnimado } from "@/components/NumeroAnimado";
import { Icono, type NombreIcono } from "@/components/iconos";
import { prefiereMenosMovimiento } from "@/lib/movimiento";

interface Tramo {
  id: string;
  texto: string;
  minutos: number;
  color: string;
  /** true si el fondo es claro y el texto blanco no llegaría a 4.5:1. */
  textoOscuro?: boolean;
  icono: NombreIcono;
  /** Lo que se lee al seleccionarlo. En primera persona, como habla la app. */
  detalle: string;
  /** true si es tiempo del estudiante; false si se lo lleva el proceso. */
  tuyo: boolean;
}

/*
 * Paleta propia y fija, no tokens del tema.
 *
 * Esta barra vive sobre una tarjeta oscura en los DOS temas -fondo
 * `bg-white/10`, titulo en blanco-, asi que su fondo no cambia con el tema y su
 * texto tampoco puede. Tomar `--color-error` o `--color-marca` la ataba a la
 * variante oscura de esos tokens, que esta aclarada para leerse SOBRE fondo
 * oscuro y por eso no aguanta texto blanco ENCIMA: axe midio 3.42:1 y 2.33:1
 * en modo oscuro (punto 20 de la auditoria).
 *
 * Los tres valores estan elegidos contra el texto que llevan encima:
 *   #d92d20 con blanco -> 4.83:1
 *   #e49b19 con tinta  -> 7.68:1
 *   #c91525 con blanco -> 5.81:1
 */
const ROJO_FILA = "#d92d20";
const AMBAR_COCINA = "#e49b19";
const ROJO_MARCA = "#c91525";

const SIN: Tramo[] = [
  {
    id: "fila",
    texto: "fila",
    minutos: 10,
    color: ROJO_FILA,
    icono: "perfil",
    detalle: "Diez minutos parado esperando que te tomen el pedido.",
    tuyo: false,
  },
  {
    id: "cocina",
    texto: "cocina",
    minutos: 10,
    color: AMBAR_COCINA,
    // El ámbar es el único tramo claro: blanco encima da 2.33:1 y hay que
    // llegar a 4.5. Con la tinta da 7.68:1. Lo marcó axe en la auditoría.
    textoOscuro: true,
    icono: "fuego",
    detalle: "Y otros diez esperando a que lo preparen, ya con el pedido hecho.",
    tuyo: false,
  },
  {
    id: "comes",
    texto: "comés",
    minutos: 10,
    color: "rgba(255,255,255,.28)",
    icono: "palomita",
    detalle: "Lo que sobra para comer: un tercio de tu receso.",
    tuyo: true,
  },
];

const CON: Tramo[] = [
  {
    id: "retiro",
    texto: "retiro",
    minutos: 2,
    color: ROJO_MARCA,
    icono: "carrito",
    detalle: "Mostrás el código y te lo entregan. La cocina ya lo hizo.",
    tuyo: false,
  },
  {
    id: "comes2",
    texto: "comés, y te sobra tiempo",
    minutos: 28,
    color: "rgba(255,255,255,.28)",
    icono: "palomita",
    detalle: "Veintiocho minutos tuyos. La cocina trabajó durante tu clase.",
    tuyo: true,
  },
];

/*
 * Los tres números del cierre, DERIVADOS de los tramos.
 *
 * Van los tres a la vista, y eso es una corrección de algo que confundía: antes
 * el pie decía solo "18 min que vuelven a ser tuyos" justo debajo de un tramo
 * que decía "28 minutos tuyos". Los dos números eran correctos —28 es cuánto
 * tenés para comer, 18 es cuánto GANÁS— pero puestos así se leían como una
 * contradicción, y quien la nota deja de creerle a la figura entera.
 *
 * La resta se muestra completa: 10 → 28, y la diferencia aparte. Un número que
 * no se puede auditar de un vistazo es un número que no convence.
 */
const suyos = (ts: Tramo[]) =>
  ts.filter((t) => t.tuyo).reduce((n, t) => n + t.minutos, 0);
const SIN_TURNO = suyos(SIN);
const CON_TURNO = suyos(CON);
const RECUPERADOS = CON_TURNO - SIN_TURNO;

/**
 * Dispara una vez cuando el elemento entra en pantalla.
 *
 * REGLA DURA: una animación puede retrasar el contenido, nunca esconderlo.
 *
 * Las barras arrancan en `scaleX(0)`, así que si el disparador no llega el
 * dibujo queda invisible para siempre — el usuario ve un rectángulo vacío donde
 * debería estar el argumento del producto. Y el disparador puede no llegar por
 * motivos que no controlamos: una pestaña en segundo plano no compone cuadros y
 * `IntersectionObserver` no reporta nada, y hay navegadores con la API detrás de
 * una bandera.
 *
 * Por eso hay un plazo máximo. Si a los 1200 ms nadie avisó, se muestra igual.
 * Se pierde el efecto, no la información.
 */
const PLAZO_MAXIMO = 1200;

function useAlVerse<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const red = window.setTimeout(() => setVisto(true), PLAZO_MAXIMO);

    if (typeof IntersectionObserver === "undefined") {
      return () => window.clearTimeout(red);
    }

    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisto(true);
          obs.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);

    return () => {
      window.clearTimeout(red);
      obs.disconnect();
    };
  }, []);

  return { ref, visto };
}

export function ComparacionReceso() {
  const { ref, visto } = useAlVerse<HTMLElement>();
  const [elegido, setElegido] = useState<Tramo | null>(null);
  const [vuelta, setVuelta] = useState(0);

  // Con movimiento reducido las barras salen completas de una: se ve el mismo
  // dato, sin el recorrido. Es la degradación correcta.
  const quieto = prefiereMenosMovimiento();
  const corriendo = visto || quieto;

  return (
    /* `data-volatil`: las barras y el contador crecen con animaciones de
       JavaScript, que `animations: "disabled"` de Playwright no congela. La
       regresión visual lo enmascara; su diseño se revisa a ojo. */
    <figure
      data-volatil
      ref={ref}
      className="mt-10 rounded-lg border border-white/15 bg-white/10 p-5 backdrop-blur lg:mt-0"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <figcaption className="etiqueta !text-white/70">
          Tu receso de 30 minutos
        </figcaption>
        <button
          type="button"
          onClick={() => {
            setElegido(null);
            setVuelta((v) => v + 1);
          }}
          className="toque flex items-center gap-1.5 rounded-full px-2 py-1 text-caption font-semibold text-white/60 transition-colors hover:text-white"
        >
          <Icono nombre="repetir" size={14} />
          Ver de nuevo
        </button>
      </div>

      <div key={vuelta} className="space-y-5">
        <Linea
          titulo="Sin TURNO"
          tramos={SIN}
          corriendo={corriendo}
          quieto={quieto}
          elegido={elegido}
          onElegir={setElegido}
          pie="20 de 30 minutos esperando"
        />
        <Linea
          titulo="Con TURNO"
          tramos={CON}
          corriendo={corriendo}
          quieto={quieto}
          elegido={elegido}
          onElegir={setElegido}
          /* La segunda línea arranca cuando la primera terminó: así se leen
             como una comparación y no como dos cosas que pasan a la vez. */
          retrasoBase={1400}
          pie="2 minutos de retiro · la cocina trabajó durante tu clase"
        />
      </div>

      {/* El detalle del tramo elegido. Altura fija para que seleccionar uno no
          empuje el contenido de abajo, que es lo que hace que una interfaz se
          sienta inestable. */}
      <div className="mt-4 min-h-14 rounded-md bg-white/10 px-3.5 py-3">
        {elegido ? (
          <p className="flex items-start gap-2.5 text-chico text-white">
            <span
              className="mt-0.5 shrink-0"
              style={{ color: elegido.tuyo ? "#ffffff" : elegido.color }}
            >
              <Icono nombre={elegido.icono} size={16} />
            </span>
            <span>
              <span className="hora font-bold">{elegido.minutos} min</span>{" "}
              <span className="font-semibold">· {elegido.texto}</span>
              <span className="mt-0.5 block text-white/70">
                {elegido.detalle}
              </span>
            </span>
          </p>
        ) : (
          <p className="text-chico text-white/60">
            Tocá cualquier tramo para ver cuánto tiempo se lleva.
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-white/15 pt-4">
        <p className="etiqueta mb-1.5 !text-white/60">Para comer te quedan</p>

        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-white">
          <span className="hora text-h2 font-bold text-white/40 line-through decoration-white/40">
            {SIN_TURNO} min
          </span>
          <Icono
            nombre="atras"
            size={18}
            className="rotate-180 text-white/40"
          />
          {/* Se le pasa SIEMPRE el valor final, nunca `corriendo ? x : 0`.
              `NumeroAnimado` arranca en el número correcto y se anima solo — su
              comentario lo dice: "si el JavaScript nunca llega, lo que se ve es
              el dato, no un cero que miente". Pasarle un cero mientras espera
              rompe justo esa garantía. */}
          <NumeroAnimado
            valor={CON_TURNO}
            sufijo=" min"
            duracion={1600}
            className="hora text-h1 font-bold"
          />
        </p>

        <p className="mt-1.5 text-chico text-white/70">
          Son{" "}
          <span className="hora font-bold text-white">
            {RECUPERADOS} minutos más
          </span>{" "}
          que haciendo la fila.
        </p>
      </div>
    </figure>
  );
}

function Linea({
  titulo,
  tramos,
  corriendo,
  quieto,
  elegido,
  onElegir,
  retrasoBase = 0,
  pie,
}: {
  titulo: string;
  tramos: Tramo[];
  corriendo: boolean;
  quieto: boolean;
  elegido: Tramo | null;
  onElegir: (t: Tramo | null) => void;
  retrasoBase?: number;
  pie: string;
}) {
  /*
   * Cada tramo empieza donde terminó el anterior: la barra se llena en el orden
   * real en que ocurren las cosas, no todas a la vez.
   *
   * Los desplazamientos se calculan ANTES de dibujar. Acumular dentro del
   * `map` mutaría una variable durante el render, y en un render interrumpido
   * los retrasos saldrían corridos.
   */
  const desde: number[] = [];
  tramos.reduce((acumulado, t) => {
    desde.push(acumulado);
    return acumulado + t.minutos;
  }, 0);

  return (
    <div>
      <p className="mb-1.5 text-chico font-semibold text-white">{titulo}</p>

      <div className="flex h-10 overflow-hidden rounded-md bg-white/10">
        {tramos.map((t, i) => {
          const retraso = quieto ? 0 : retrasoBase + (desde[i] ?? 0) * 42;
          const activo = elegido?.id === t.id;

          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={activo}
              aria-label={`${t.texto}, ${t.minutos} minutos`}
              onClick={() => onElegir(activo ? null : t)}
              className="relative flex items-center justify-center overflow-hidden text-caption font-semibold transition-[flex-grow,opacity] duration-300"
              style={{
                background: t.color,
                /* Tinta literal y no `--color-texto`: ese token es blanco en modo
                   oscuro, así que usarlo dejaba el mismo 2.33:1 que se quería
                   arreglar. El fondo ámbar es el mismo en los dos temas, así
                   que su texto también tiene que serlo. */
                color: t.textoOscuro ? "#171717" : "#ffffff",
                // El ancho ES el dato: cada minuto ocupa lo mismo en las dos
                // líneas, así que comparar es medir.
                flexGrow: t.minutos,
                flexBasis: 0,
                // El llenado: de 0 a su ancho, escalonado en el tiempo.
                transform: corriendo ? "scaleX(1)" : "scaleX(0)",
                transformOrigin: "left",
                transition: quieto
                  ? "none"
                  : `transform 620ms cubic-bezier(.22,1,.28,1) ${retraso}ms, opacity 200ms`,
                opacity: elegido && !activo ? 0.45 : 1,
              }}
            >
              <span className="truncate px-1.5">
                {t.minutos >= 6 ? t.texto : ""}
              </span>
              {activo && (
                <span className="absolute inset-0 ring-2 ring-inset ring-white" />
              )}
            </button>
          );
        })}
      </div>

      <p className="hora mt-1.5 text-caption text-white/70">{pie}</p>
    </div>
  );
}
