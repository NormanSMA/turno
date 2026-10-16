"use client";

/**
 * Ayuda contextual (§08, §09, §17, §18). No es un centro de ayuda: el sistema
 * ya sabe de qué pedido se trata y en qué estado está.
 *
 *   - **Las opciones cambian con el estado.** A quien todavía está en cocina no
 *     se le ofrece "no me entregaron todo".
 *   - **Se responde acá, no se deriva.** Cuando el sistema tiene el dato,
 *     mandar a preguntar al mostrador es la fila que vino a evitar.
 */

import { useCallback, useRef, useState } from "react";
import { Icono } from "@/components/iconos";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

interface Tema {
  id: string;
  pregunta: string;
  /** Si falta, el estado actual no admite esta pregunta. */
  respuesta: string;
  /** Qué puede hacer después de leerla. */
  accion?: { texto: string; href: string };
}

function temasPara(args: {
  estado: string;
  codigo: string;
  comercio: string;
  ubicacion: string | null;
  minutosNoShow: number;
}): Tema[] {
  const { estado, codigo, comercio, ubicacion, minutosNoShow } = args;
  const donde = ubicacion ? `${comercio} (${ubicacion})` : comercio;

  const enCocina = ["RECIBIDO", "EN_PREPARACION"].includes(estado);
  const listo = estado === "LISTO";
  const entregado = estado === "RETIRADO";

  const temas: Tema[] = [];

  if (enCocina) {
    temas.push({
      id: "cuando",
      pregunta: "¿Cuándo va a estar listo?",
      respuesta:
        "Dentro de tu ventana de retiro. La cocina reservó ese tiempo para vos cuando confirmaste, y el aviso te llega apenas salga — no hace falta que estés mirando la pantalla.",
    });
    temas.push({
      id: "no-llego",
      pregunta: "No voy a poder llegar a esa hora",
      respuesta:
        estado === "RECIBIDO"
          ? "Todavía no entró a cocina, así que podés cancelarlo desde esta misma pantalla sin costo y la capacidad queda libre para otro."
          : "Ya lo están cocinando, así que no se puede cancelar desde acá. Pasá por el mostrador cuando puedas o avisales: el pedido te espera un rato después de tu hora.",
    });
  }

  if (listo) {
    temas.push({
      id: "donde",
      pregunta: "¿Dónde lo retiro?",
      respuesta: `En ${donde}. Mostrá el código ${codigo} en el mostrador — sirve dictado o como QR, cualquiera de los dos.`,
    });
    temas.push({
      id: "cuanto-espera",
      pregunta: "¿Hasta cuándo me lo guardan?",
      respuesta: `El comercio lo conserva unos ${minutosNoShow} minutos después de marcarlo listo. Si vas en camino, seguí: nadie te va a cobrar por llegar tarde.`,
    });
  }

  if (listo || entregado) {
    temas.push({
      id: "falta",
      pregunta: "Falta un producto de mi pedido",
      respuesta:
        "Decíselo al mostrador antes de irte, con el código a la vista. Ellos ven exactamente lo mismo que vos en su tablero, así que la comparación es directa.",
    });
  }

  temas.push({
    id: "no-aparece",
    pregunta: "Mi pedido no aparece o no es el mío",
    respuesta: `Verificá que el código sea ${codigo}. Si en el mostrador tienen otro nombre o otros productos, no lo aceptes: el código es lo único que identifica el pedido, y entregarlo al equivocado deja a los dos sin comida.`,
    accion: { texto: "Ver todos mis pedidos", href: "/mis-pedidos" },
  });

  temas.push({
    id: "otro",
    pregunta: "Tengo otro problema",
    respuesta: `Lo más rápido es el mostrador de ${donde} con tu código a mano: son ellos quienes tienen el pedido físico. Lo que se ve acá es un reflejo de lo que ellos marcan.`,
  });

  return temas;
}

export function HojaAyuda({
  abierta,
  onCerrar,
  ...datos
}: {
  abierta: boolean;
  onCerrar: () => void;
  estado: string;
  codigo: string;
  comercio: string;
  ubicacion: string | null;
  minutosNoShow: number;
}) {
  const primero = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const alCerrar = useCallback(() => {
    setAbierto(null);
    onCerrar();
  }, [onCerrar]);

  const temas = temasPara(datos);

  return (
    <Drawer
      open={abierta}
      onOpenChange={(a) => {
        if (!a) alCerrar();
      }}
    >
      <DrawerContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          primero.current?.focus();
        }}
        className="mx-auto w-full max-w-md border-borde bg-superficie text-texto data-[vaul-drawer-direction=bottom]:max-h-[88dvh]"
      >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <DrawerTitle className="titulo text-h2">
          ¿En qué te ayudamos?
        </DrawerTitle>
        <DrawerDescription className="mt-1 text-cuerpo text-texto-2">
          Sobre este pedido, {datos.codigo}.
        </DrawerDescription>

        <ul className="mt-4 space-y-2">
          {temas.map((t, n) => {
            const desplegado = abierto === t.id;
            return (
              <li
                key={t.id}
                className="overflow-hidden rounded-md border border-borde"
              >
                <button
                  ref={n === 0 ? primero : undefined}
                  type="button"
                  aria-expanded={desplegado}
                  onClick={() => setAbierto(desplegado ? null : t.id)}
                  className="presiona flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-cuerpo font-semibold"
                >
                  <span className="min-w-0 flex-1">{t.pregunta}</span>
                  <span
                    aria-hidden
                    className={`shrink-0 text-texto-3 transition-transform ${
                      desplegado ? "rotate-90" : ""
                    }`}
                  >
                    <Icono nombre="atras" size={16} className="rotate-180" />
                  </span>
                </button>

                {desplegado && (
                  <div className="border-t border-borde px-4 py-3">
                    <p className="text-chico text-texto-2">{t.respuesta}</p>
                    {t.accion && (
                      <a
                        href={t.accion.href}
                        className="mt-3 inline-flex text-chico font-semibold text-marca-texto"
                      >
                        {t.accion.texto}
                      </a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 border-t border-borde bg-superficie px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={alCerrar}
          className="presiona flex min-h-12 w-full items-center justify-center rounded-md border border-borde px-4 text-cuerpo font-semibold"
        >
          Cerrar
        </button>
      </div>
      </DrawerContent>
    </Drawer>
  );
}
