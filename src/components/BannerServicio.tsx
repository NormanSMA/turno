"use client";

/**
 * Banner de servicio (§37). Quien no se entera de que la cafetería dejó de
 * recibir pedidos camina hasta allá igual, y ese viaje es lo que el producto
 * existe para evitar.
 *
 *   - Solo aparece cuando hay algo que decir; un "todo bien" permanente es
 *     ruido y quema el aviso para cuando importe.
 *   - La tranquilidad va junto al problema: pausar NO cancela lo confirmado.
 *     Sin esa frase el banner produce el pánico que quiere prevenir.
 */

import { useEffect, useState } from "react";
import { Icono } from "@/components/iconos";
import { api } from "@/lib/cliente";

export function BannerServicio() {
  const [pausados, setPausados] = useState<string[]>([]);

  useEffect(() => {
    let vigente = true;
    const cargar = () =>
      api<{ pausados: string[] }>("/api/estado-servicio")
        .then((r) => vigente && setPausados(r.pausados))
        // Que este aviso no cargue no es algo que reportarle a nadie: el
        // banner simplemente no aparece y la aplicación funciona igual.
        .catch(() => undefined);

    cargar();
    // Cada dos minutos: una pausa dura minutos, no segundos, y este dato lo
    // consultan todos los que abren la portada.
    const t = setInterval(cargar, 120_000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, []);

  if (pausados.length === 0) return null;

  const varios = pausados.length > 1;

  return (
    <div
      role="status"
      className="mb-4 rounded-md border border-aviso/40 bg-atencion-suave px-4 py-3"
    >
      <p className="flex items-start gap-2 text-cuerpo font-semibold">
        <span className="mt-0.5 shrink-0 text-aviso">
          <Icono nombre="reloj" size={18} />
        </span>
        <span>
          {pausados.join(", ")}{" "}
          {varios
            ? "no están recibiendo pedidos"
            : "no está recibiendo pedidos"}{" "}
          por ahora
        </span>
      </p>
      <p className="mt-1 pl-6 text-chico text-texto-2">
        Están terminando lo que tienen en cocina. Probá en unos minutos.
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 pl-6 text-caption text-exito">
        <Icono nombre="palomita" size={14} />
        Si ya tenés un pedido confirmado, sigue en pie.
      </p>
    </div>
  );
}
