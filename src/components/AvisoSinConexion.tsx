"use client";

/**
 * Aviso de falta de conexión, con tres textos distintos según lo que esté en
 * juego (§38).
 *
 * "Sin conexión" a secas no sirve, porque el riesgo no es el mismo:
 *
 *   NAVEGANDO   molesta, no cuesta nada. Basta decir que lo que se ve puede
 *               estar viejo, y desde cuándo.
 *   CON PEDIDO  el estudiante entra en pánico creyendo que perdió la reserva.
 *               Lo primero que hay que decirle es que su pedido SIGUE en pie —
 *               la reserva vive en el servidor, no en su teléfono.
 *   CONFIRMANDO acá sí hay que frenar. Confirmar contra datos viejos podría
 *               reservar una hora que ya no existe, y peor: hacerle creer que
 *               tiene un pedido que nunca se creó.
 *
 * La última es la importante y la que casi nadie implementa. Un botón de
 * confirmar que "funciona" sin red es una mentira con consecuencias en el
 * mostrador.
 */

import { useEffect, useState } from "react";
import { Icono } from "@/components/iconos";

/**
 * ¿Hay red?
 *
 * `navigator.onLine` miente en un sentido conocido: dice `true` cuando hay
 * interfaz de red aunque no haya salida a internet — que es exactamente el WiFi
 * de un campus con el portal caído. Por eso se combina con los eventos y con lo
 * que digan las peticiones reales; acá se cubre el caso barato y `desdeCache`
 * cubre el caro.
 */
export function useHayRed(): boolean {
  // Arranca en `true` y no en `navigator.onLine`: en el servidor no existe, y
  // suponer que no hay red pintaría el aviso en cada primer render.
  const [hayRed, setHayRed] = useState(true);

  useEffect(() => {
    const sincronizar = () => setHayRed(navigator.onLine);
    sincronizar();
    window.addEventListener("online", sincronizar);
    window.addEventListener("offline", sincronizar);
    return () => {
      window.removeEventListener("online", sincronizar);
      window.removeEventListener("offline", sincronizar);
    };
  }, []);

  return hayRed;
}

export type ContextoSinRed = "navegando" | "con-pedido" | "confirmando";

export function AvisoSinConexion({
  contexto,
  /** Cuándo se leyó por última vez del servidor. */
  actualizado,
  className = "",
}: {
  contexto: ContextoSinRed;
  actualizado?: string | null;
  className?: string;
}) {
  const hayRed = useHayRed();
  if (hayRed) return null;

  const conPedido = contexto === "con-pedido";
  const confirmando = contexto === "confirmando";

  return (
    <div
      role="status"
      className={`rounded-md border px-4 py-3 ${
        confirmando
          ? "border-error/40 bg-error-suave"
          : "border-aviso/40 bg-atencion-suave"
      } ${className}`}
    >
      <p className="flex items-center gap-2 text-cuerpo font-semibold">
        <Icono nombre={confirmando ? "cerrar" : "reloj"} size={18} />
        {confirmando
          ? "Necesitamos conexión para confirmar"
          : "Estás sin conexión"}
      </p>

      <p className="mt-1 text-chico text-texto-2">
        {confirmando
          ? "Confirmar sin red podría reservarte una hora que ya no existe. Volvé a intentar en cuanto tengas señal — tu pedido no se pierde."
          : conPedido
            ? "Tu pedido sigue reservado: la hora la guarda el servidor, no tu teléfono."
            : "Te mostramos lo último que supimos. Puede haber cambiado."}
      </p>

      {conPedido && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-exito">
          <Icono nombre="palomita" size={14} />
          Tu código de retiro sigue sirviendo en el mostrador.
        </p>
      )}

      {actualizado && (
        <p className="hora mt-2 text-caption text-texto-2">
          Última actualización: {actualizado}
        </p>
      )}
    </div>
  );
}
