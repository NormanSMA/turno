"use client";

/**
 * Preferencias de aviso (§25).
 *
 * Un sistema que avisa sin dar control termina en el peor lugar posible: el
 * usuario bloquea las notificaciones del navegador. Ese bloqueo es difícil de
 * revertir y se lleva puesto el aviso que sí importaba —"tu pedido está
 * listo"—. Dar el interruptor fino acá es lo que evita que alguien use el
 * interruptor grueso del sistema operativo.
 *
 * Tres decisiones:
 *
 *   1. **Guarda al tocar**, sin botón de guardar. Son cuatro interruptores
 *      independientes; un formulario con "Guardar cambios" agrega un paso para
 *      confirmar algo que ya se entendió al tocarlo.
 *   2. **Se advierte lo que apagar cuesta**, pero no se impide. Apagar "tu
 *      pedido está listo" es una decisión legítima; esconderla sería decidir
 *      por el usuario.
 *   3. **Los avisos de sistema no están en la lista.** "El comercio dejó de
 *      recibir pedidos" no es una preferencia: es información para no cruzar
 *      el campus en vano.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navegacion } from "@/components/Navegacion";
import { Icono } from "@/components/iconos";
import { Esqueleto } from "@/components/estados-ui";
import { api } from "@/lib/cliente";

interface Preferencias {
  confirmacion: boolean;
  listo: boolean;
  recordatorio: boolean;
  promociones: boolean;
}

type Clave = keyof Preferencias;

const OPCIONES: {
  clave: Clave;
  titulo: string;
  detalle: string;
  advertencia?: string;
}[] = [
  {
    clave: "confirmacion",
    titulo: "Pedido confirmado",
    detalle: "Cuando tu turno queda reservado, con la hora y el código.",
  },
  {
    clave: "listo",
    titulo: "Pedido listo",
    detalle: "El momento en que ya podés pasar a retirarlo.",
    advertencia:
      "Sin este aviso vas a tener que abrir la aplicación para saber si ya salió de cocina.",
  },
  {
    clave: "recordatorio",
    titulo: "Recordatorio de retiro",
    detalle: "Un aviso antes de que se cumpla tu hora, para que no se te pase.",
  },
  {
    clave: "promociones",
    titulo: "Ofertas de los comercios",
    detalle: "Descuentos y platos nuevos. Está apagado salvo que lo enciendas.",
  },
];

export default function Pagina() {
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api<{ preferencias: Preferencias }>("/api/preferencias")
      .then((r) => vigente && setPrefs(r.preferencias))
      .catch(() => vigente && setError("No pudimos cargar tus preferencias."));
    return () => {
      vigente = false;
    };
  }, []);

  async function alternar(clave: Clave) {
    if (!prefs) return;
    const nuevo = !prefs[clave];
    // Optimista: el interruptor es lo que confirma que se entendió el toque.
    setPrefs({ ...prefs, [clave]: nuevo });
    setError(null);
    try {
      await api("/api/preferencias", {
        method: "PATCH",
        body: JSON.stringify({ [clave]: nuevo }),
      });
    } catch {
      // Acá sí se avisa, al revés que en favoritos: si alguien apagó un aviso
      // y no se guardó, va a seguir recibiéndolo y va a creer que el sistema lo
      // ignoró. Esa es la ruta directa al bloqueo del navegador.
      setPrefs({ ...prefs, [clave]: !nuevo });
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    }
  }

  return (
    <>
      <Navegacion />
      <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-6 sm:px-5 sm:pb-12">
        <Link
          href="/avisos"
          className="etiqueta inline-flex items-center gap-1 hover:text-texto"
        >
          ← Avisos
        </Link>

        <header className="mb-5 mt-3">
          <h1 className="titulo text-h1">Qué querés que te avisemos</h1>
          <p className="mt-1 text-chico text-texto-2">
            Se aplica a las notificaciones del navegador y a tu bandeja. Tu
            pedido cambia de estado igual: lo que apagás es el mensaje, no lo que
            pasa.
          </p>
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-md border border-error/40 bg-error-suave px-4 py-3 text-chico">
            {error}
          </p>
        )}

        {!prefs && !error && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {prefs && (
          <ul className="space-y-2">
            {OPCIONES.map((o) => {
              const activo = prefs[o.clave];
              return (
                <li key={o.clave}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activo}
                    onClick={() => alternar(o.clave)}
                    className="presiona flex w-full items-start gap-3 rounded-md border border-borde bg-superficie px-4 py-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-cuerpo font-semibold">
                        {o.titulo}
                      </span>
                      <span className="mt-0.5 block text-chico text-texto-2">
                        {o.detalle}
                      </span>
                      {/* La advertencia aparece solo cuando ya está apagado:
                          mostrarla siempre sería presionar para no tocarlo. */}
                      {!activo && o.advertencia && (
                        <span className="mt-2 flex items-start gap-1.5 text-caption text-aviso">
                          <Icono nombre="reloj" size={13} className="mt-0.5" />
                          {o.advertencia}
                        </span>
                      )}
                    </span>

                    {/* Interruptor dibujado con tokens: la forma cambia además
                        del color, para quien no distingue rojo de gris. */}
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                        activo ? "bg-marca-fondo" : "bg-superficie-3"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-full bg-superficie transition-transform ${
                          activo ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-caption text-texto-2">
          Esto no reemplaza el permiso del navegador. Si bloqueaste las
          notificaciones desde el sistema, hay que reactivarlas ahí.
        </p>
      </main>
    </>
  );
}
