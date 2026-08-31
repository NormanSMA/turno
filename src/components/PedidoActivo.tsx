"use client";

/**
 * Tarjeta de pedido en curso (Design System §25, §26).
 *
 * Es el componente más importante del producto: mientras dura un pedido, es la
 * única cosa que le importa al estudiante, y por eso aparece arriba de todo en
 * Inicio y en Pedidos.
 *
 * Responde las preguntas **en el orden en que se hacen**:
 *
 *   1. ¿dónde voy?      → comercio y ubicación, la línea principal
 *   2. ¿en qué está?    → el estado, en lenguaje humano y con color semántico
 *   3. ¿cuándo?         → la ventana de retiro
 *   4. ¿qué hago ahora? → la instrucción
 *   5. ¿y el código?    → el código de retiro
 *
 * Antes el estado era el título y el comercio un subtítulo truncado, que es el
 * orden invertido: nadie mira su pedido para auditar un estado, lo mira para
 * saber si tiene que moverse y hacia dónde. El lenguaje es humano (§06): "Lo
 * estamos preparando", no "EN_PREPARACION".
 *
 * **La tarjeta entera es el enlace.** Un botón rojo a ancho completo dentro de
 * una tarjeta que ya era clicable rompía la regla 80/15/5 y daba dos destinos
 * al mismo sitio. Ahora hay uno solo, y el `Ver pedido →` del pie es una señal
 * de a dónde lleva, no un segundo control.
 */

import Link from "next/link";
import { Icono, type NombreIcono } from "@/components/iconos";
import { horaCorta } from "@/lib/cliente";
import { minutosLegibles } from "@/lib/tiempo";
import { minutosHasta, useAhora } from "@/lib/reloj";

export interface PedidoEnCurso {
  id: string;
  codigo: string;
  estado: string;
  comercio: string;
  comercioUbicacion?: string | null;
  franjaInicio: string;
  franjaFin: string;
}

/**
 * Dónde se está dibujando la tarjeta.
 *
 * `banda` es la portada, donde compite con el resto de la pantalla y se queda
 * en lo esencial. `lista` es "Mis pedidos", donde el pedido ES el contenido y
 * hay lugar para la línea de progreso y el plan de los dos pasos.
 *
 * Es una prop y no dos componentes a propósito: dos tarjetas parecidas se
 * separan en la primera corrección que se aplica a una sola.
 */
export type VarianteTarjeta = "banda" | "lista";

/** Los cuatro pasos visibles. NO_SHOW y CANCELADO no llegan acá. */
const PASOS = ["RECIBIDO", "EN_PREPARACION", "LISTO", "RETIRADO"] as const;

const ETIQUETA_PASO: Record<string, string> = {
  RECIBIDO: "Confirmado",
  EN_PREPARACION: "Cocinando",
  LISTO: "Listo",
  RETIRADO: "Retirado",
};

/**
 * Cada estado con su nombre humano, su icono y su color semántico.
 *
 * Que el color salga del estado y no de quien llama es lo que impide que una
 * pantalla pinte de verde un pedido que todavía no está listo.
 */
const FORMA: Record<
  string,
  {
    titulo: string;
    icono: NombreIcono;
    color: string;
    fondo: string;
    /** Qué tiene que hacer AHORA. */
    ahora: string;
    /** Y qué viene después, para que no lo tome por sorpresa. */
    despues: string;
  }
> = {
  RECIBIDO: {
    titulo: "Tu turno está reservado",
    icono: "reloj",
    color: "text-texto-2",
    fondo: "bg-superficie-2",
    ahora: "Seguí en lo tuyo. Te avisamos cuando esté.",
    despues: "Después vas al mostrador y mostrás el código.",
  },
  EN_PREPARACION: {
    titulo: "Lo estamos preparando",
    icono: "fuego",
    color: "text-aviso",
    fondo: "bg-atencion-suave",
    ahora: "Esperá el aviso. Ya está en la cocina.",
    despues: "Después vas al mostrador y mostrás el código.",
  },
  LISTO: {
    titulo: "Ya podés pasar",
    icono: "campana",
    color: "text-exito",
    fondo: "bg-exito-suave",
    ahora: "Acercate al mostrador.",
    despues: "Mostrá el código y retirá.",
  },
};

export function PedidoActivo({
  p,
  variante = "lista",
}: {
  p: PedidoEnCurso;
  variante?: VarianteTarjeta;
}) {
  const forma = FORMA[p.estado] ?? FORMA.RECIBIDO!;
  const indice = PASOS.indexOf(p.estado as (typeof PASOS)[number]);
  const listo = p.estado === "LISTO";

  // El reloj entra por estado: leer la hora durante el render es impuro, y
  // además así dos pantallas abiertas muestran el mismo minuto.
  const faltan = minutosHasta(p.franjaInicio, useAhora());

  return (
    <Link
      href={`/pedido/${p.id}`}
      className="presiona block overflow-hidden rounded-lg border border-borde bg-superficie shadow-sm"
    >
      {/* ============================================ 1. ¿Dónde voy? y 2. ¿en qué está?
          El comercio manda la cabecera; el estado va debajo, con su icono y su
          color. El fondo semántico sigue tiñendo la franja entera, que es lo
          que hace legible el estado de un vistazo sin leer una palabra. */}
      <div className={`flex items-center gap-3 px-4 py-3.5 ${forma.fondo}`}>
        <span className={`shrink-0 ${forma.color}`}>
          <Icono nombre={forma.icono} size={22} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-cuerpo font-bold">{p.comercio}</p>
          <p className={`truncate text-chico font-medium ${forma.color}`}>
            {forma.titulo}
          </p>
          {/* La ubicación solo se dibuja si el comercio la tiene. Un guion o un
              "sin datos" ocuparía el mismo espacio sin decir nada (L6). */}
          {p.comercioUbicacion && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-caption text-texto-2">
              <span className="shrink-0">
                <Icono nombre="local" size={12} />
              </span>
              {p.comercioUbicacion}
            </p>
          )}
        </div>

        {/* 5. ¿Y el código? Va último en el orden de lectura pero arriba en la
            pantalla, porque en el mostrador se busca con el pulgar, no leyendo. */}
        <div className="shrink-0 text-right">
          <p className="etiqueta !text-caption">Código</p>
          <p className="hora text-h3 font-bold tracking-wider">{p.codigo}</p>
        </div>
      </div>

      <div className="p-4">
        {/* ============================================== La línea de progreso
            Solo el paso actual se resalta. Los futuros quedan en texto
            terciario: pintarlos todos con el mismo peso convierte una línea de
            tiempo en una fila de palabras. */}
        <ol className="flex items-center" aria-label="Estado del pedido">
          {PASOS.map((paso, i) => {
            const hecho = i <= indice;
            const actual = i === indice;
            return (
              <li
                key={paso}
                className={`flex items-center ${i === 0 ? "" : "flex-1"}`}
              >
                {i > 0 && (
                  <span
                    aria-hidden
                    className={`h-0.5 flex-1 ${
                      hecho ? "bg-marca-fondo" : "bg-superficie-3"
                    }`}
                  />
                )}
                <span
                  className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${
                    hecho ? "bg-marca-fondo" : "bg-superficie-3"
                  } ${actual ? "ring-4 ring-marca-texto/20" : ""}`}
                >
                  <span className="sr-only">
                    {ETIQUETA_PASO[paso]}
                    {actual ? " (actual)" : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <div aria-hidden className="mt-1.5 flex justify-between text-caption">
          {PASOS.map((paso, i) => (
            <span
              key={paso}
              className={
                i === indice
                  ? "font-semibold text-marca-texto"
                  : i < indice
                    ? "text-texto-2"
                    : "text-texto-3"
              }
            >
              {ETIQUETA_PASO[paso]}
            </span>
          ))}
        </div>

        {/* ================================================== 3. ¿Cuándo?
            Sube por encima de la instrucción: primero cuándo tengo que estar
            ahí, después qué hago mientras tanto. */}
        <div className="mt-4 flex items-center gap-2 rounded-sm bg-superficie-2 px-3 py-2.5">
          <span className="shrink-0 text-texto-2">
            <Icono nombre="reloj" size={18} />
          </span>
          <p className="text-chico">
            {listo ? (
              <span className="font-semibold">Ya podés pasar a retirarlo</span>
            ) : (
              <>
                Retirás entre{" "}
                <span className="hora font-semibold text-texto">
                  {horaCorta(p.franjaInicio)}
                </span>{" "}
                y{" "}
                <span className="hora font-semibold text-texto">
                  {horaCorta(p.franjaFin)}
                </span>
              </>
            )}
          </p>
        </div>

        {/*
         * -------------------------------------------- Tu recreo se acerca
         *
         * §23. Sin esto, la tarjeta se veía igual faltando una hora que
         * faltando cinco minutos — y el único tema de este producto es el
         * tiempo. Aparece solo cerca del retiro: una cuenta regresiva
         * permanente convierte una comodidad en una presión.
         *
         * Se calcula del inicio de la franja, no de un sondeo: el dato ya está
         * en la tarjeta y el navegador puede restar solo.
         */}
        {faltan > 0 && faltan <= 20 && !listo && (
          <p className="mt-3 flex items-center gap-2 rounded-sm border border-marca-texto/30 bg-marca-suave px-3 py-2.5 text-chico font-semibold">
            <Icono nombre="reloj" size={16} />
            Tu recreo se acerca: faltan {minutosLegibles(faltan)}
          </p>
        )}

        {/* ============================================ 4. ¿Qué hago ahora?
            En la portada compite con todo lo demás, así que se queda en la
            instrucción del momento; en "Mis pedidos", donde el pedido es el
            contenido, cabe también lo que viene después. */}
        <div className="mt-3 rounded-sm border border-borde px-3.5 py-3">
          <p className="flex items-start gap-2 text-chico">
            <span className="mt-0.5 shrink-0 font-bold text-marca-texto">
              Ahora
            </span>
            <span className="text-texto-2">{forma.ahora}</span>
          </p>
          {variante === "lista" && (
            <p className="mt-1.5 flex items-start gap-2 text-chico">
              <span className="mt-0.5 shrink-0 font-bold text-texto-3">
                Luego
              </span>
              <span className="text-texto-2">{forma.despues}</span>
            </p>
          )}
        </div>

        {/* La afirmación de destino, no un segundo botón: la tarjeta entera ya
            es el enlace y anidar otro daría dos paradas de teclado al mismo
            sitio. */}
        <p className="mt-3 flex items-center justify-end gap-1.5 text-chico font-semibold text-marca-texto">
          Ver pedido
          <Icono nombre="atras" size={15} className="rotate-180" />
        </p>
      </div>
    </Link>
  );
}
