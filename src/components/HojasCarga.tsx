"use client";

/**
 * Hojas inferiores con carga diferida.
 *
 * Vaul y Radix pesan unos 40 KB comprimidos y solo se ven al abrir una hoja.
 * Cada envoltorio descarga su hoja la primera vez que se abre y la deja montada
 * después, para que la animación de cierre siga funcionando.
 */

import { useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";

const Producto = dynamic(() => import("@/components/HojaProducto").then((m) => m.HojaProducto), { ssr: false });
const Ayuda = dynamic(() => import("@/components/HojaAyuda").then((m) => m.HojaAyuda), { ssr: false });
const Cambios = dynamic(() => import("@/components/HojaCambios").then((m) => m.HojaCambios), { ssr: false });
const Sesion = dynamic(() => import("@/components/HojaSesion").then((m) => m.HojaSesion), { ssr: false });
const FranjaAgotada = dynamic(
  () => import("@/components/HojaFranjaAgotada").then((m) => m.HojaFranjaAgotada),
  { ssr: false },
);
const ProblemaCocina = dynamic(
  () => import("@/components/HojaProblemaCocina").then((m) => m.HojaProblemaCocina),
  { ssr: false },
);

/** Verdadero desde la primera vez que `abierta` es verdadero. */
function useYaAbierta(abierta: boolean): boolean {
  const [ya, setYa] = useState(abierta);
  if (abierta && !ya) setYa(true);
  return ya || abierta;
}

export function HojaProductoCarga(props: ComponentProps<typeof Producto>) {
  const montada = useYaAbierta(props.producto !== null);
  return montada ? <Producto {...props} /> : null;
}

export function HojaAyudaCarga(props: ComponentProps<typeof Ayuda>) {
  const montada = useYaAbierta(props.abierta);
  return montada ? <Ayuda {...props} /> : null;
}

export function HojaCambiosCarga(props: ComponentProps<typeof Cambios>) {
  const montada = useYaAbierta(props.cambios.length > 0);
  return montada ? <Cambios {...props} /> : null;
}

export function HojaSesionCarga(props: ComponentProps<typeof Sesion>) {
  const montada = useYaAbierta(props.abierta);
  return montada ? <Sesion {...props} /> : null;
}

export function HojaFranjaAgotadaCarga(props: ComponentProps<typeof FranjaAgotada>) {
  const montada = useYaAbierta(props.motivo !== null);
  return montada ? <FranjaAgotada {...props} /> : null;
}

export function HojaProblemaCocinaCarga(props: ComponentProps<typeof ProblemaCocina>) {
  const montada = useYaAbierta(props.pedido !== null);
  return montada ? <ProblemaCocina {...props} /> : null;
}
