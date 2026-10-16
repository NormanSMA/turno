"use client";

/**
 * El pedido en curso, arriba de Inicio.
 *
 * Regla de los tres segundos (§51): al abrir la aplicación, si hay algo en
 * marcha tiene que ser lo primero que se vea. Un estudiante con un pedido
 * cocinándose no abrió TURNO para mirar el catálogo — abrió para saber si ya
 * puede ir.
 *
 * En móvil lo muestra el dock de la navegación (`EstadoPedidoDock`), así que la
 * banda solo se dibuja desde `sm`. Sin pedidos en curso no dibuja nada.
 */

import Link from "next/link";
import { PedidoActivo, type PedidoEnCurso } from "@/components/PedidoActivo";
import { horaCorta } from "@/lib/cliente";
import { usePedidosEnCurso } from "@/lib/consultas-pedido-activo";

const ESTADO_CORTO: Record<string, string> = {
  RECIBIDO: "Confirmado",
  EN_PREPARACION: "Cocinando",
  LISTO: "Ya podés pasar",
};

/** Fila de estado del dock móvil: código, estado y hora del primer pedido. */
export function EstadoPedidoDock({ pedido }: { pedido: PedidoEnCurso }) {
  return (
    <Link
      href={`/pedido/${pedido.id}`}
      className="toque flex min-h-11 items-center gap-3 rounded-full px-4 text-chico text-cocina-tinta"
    >
      <span className="hora text-cuerpo font-bold tracking-wider">
        {pedido.codigo}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">
        {ESTADO_CORTO[pedido.estado] ?? ESTADO_CORTO.RECIBIDO}
      </span>
      <span className="hora shrink-0">{horaCorta(pedido.franjaInicio)}</span>
    </Link>
  );
}

export function BandaPedidoActivo() {
  const pedidos = usePedidosEnCurso();

  if (pedidos.length === 0) return null;

  return (
    <section className="mb-8 hidden sm:block">
      <h2 className="etiqueta mb-2">
        {pedidos.length === 1 ? "Tu pedido" : "Tus pedidos"}
      </h2>
      <div className="grid gap-3">
        {pedidos.map((p) => (
          <PedidoActivo key={p.id} p={p} variante="banda" />
        ))}
      </div>
    </section>
  );
}
