"use client";

/**
 * El pedido en curso, arriba de Inicio.
 *
 * Regla de los tres segundos (§51): al abrir la aplicación, si hay algo en
 * marcha tiene que ser lo primero que se vea. Un estudiante con un pedido
 * cocinándose no abrió TURNO para mirar el catálogo — abrió para saber si ya
 * puede ir.
 *
 * Sin pedidos en curso no dibuja nada. Un hueco vacío con el texto "no tenés
 * pedidos" arriba del menú sería ruido permanente para la mayoría de las
 * visitas.
 */

import { useEffect, useState } from "react";
import { PedidoActivo, type PedidoEnCurso } from "@/components/PedidoActivo";
import { siHaySesion } from "@/lib/sesion-cliente";
import { api } from "@/lib/cliente";
import { useSondeo } from "@/lib/sondeo";

const TERMINALES = ["RETIRADO", "NO_SHOW", "CANCELADO"];

export function BandaPedidoActivo() {
  const [pedidos, setPedidos] = useState<PedidoEnCurso[] | null>(null);
  const [hayQueMirar, setHayQueMirar] = useState(false);

  useEffect(() => {
    let vigente = true;
    siHaySesion(() =>
      api<{ pedidos: (PedidoEnCurso & { estado: string })[] }>("/api/pedidos"),
    )
      .then((r) => {
        if (!vigente || !r) return;
        const vivos = r.pedidos.filter((p) => !TERMINALES.includes(p.estado));
        setPedidos(vivos);
        setHayQueMirar(vivos.length > 0);
      })
      // Sin sesión ni siquiera se pide: el invitado vino a mirar el menú y
      // este viaje se sabía perdido de antemano (punto 25).
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  // El sondeo arranca SOLO si hay algo vivo que seguir, y se detiene con la
  // pestaña oculta (ADR-14). En la portada de un invitado no corre nunca.
  useSondeo(
    () => {
      if (!hayQueMirar) return;
      api<{ pedidos: (PedidoEnCurso & { estado: string })[] }>("/api/pedidos")
        .then((r) =>
          setPedidos(r.pedidos.filter((p) => !TERMINALES.includes(p.estado))),
        )
        .catch(() => undefined);
    },
    hayQueMirar ? 20000 : 3_600_000,
  );

  if (!pedidos || pedidos.length === 0) return null;

  return (
    <section className="mb-8">
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
