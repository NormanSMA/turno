"use client";

/**
 * Campo de contraseña con el ojo para verla.
 *
 * Ocultar lo que se escribe protege de quien mire por encima del hombro, pero
 * cobra un precio: en un teléfono, con el pulgar y apurado, escribir una
 * contraseña a ciegas es la causa más común de "no me deja entrar". Y el
 * sistema no puede distinguir un dedo torpe de una credencial equivocada, así
 * que responde lo mismo a las dos cosas.
 *
 * Poder mirar lo que uno escribió resuelve eso sin debilitar nada: la
 * contraseña sigue oculta por omisión y quien la muestra lo hace a propósito,
 * habiendo decidido que nadie lo está mirando.
 *
 * Detalles que hacen que funcione de verdad:
 *
 *  - `type="button"`, o el botón enviaría el formulario en cada toque.
 *  - El `aria-label` **dice qué va a pasar**, no en qué estado está: quien usa
 *    un lector de pantalla necesita saber qué hace el botón, no describir el
 *    icono.
 *  - `aria-pressed` comunica el estado, que es el mecanismo correcto para un
 *    control que alterna.
 *  - El botón queda fuera del `<label>`: dentro, un toque en él contaría
 *    también como toque en la etiqueta y devolvería el foco al campo.
 */

import { useId, useState } from "react";
import { Icono } from "@/components/iconos";

export function CampoPassword({
  etiqueta,
  valor,
  onCambiar,
  autoComplete,
  minLength,
  requerido = true,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  requerido?: boolean;
  /** Texto bajo el campo, por ejemplo el mínimo de caracteres. */
  ayuda?: React.ReactNode;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="block">
      <label htmlFor={id} className="etiqueta">
        {etiqueta}
      </label>

      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required={requerido}
          minLength={minLength}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          // El relleno derecho reserva el sitio del botón: sin él, el texto
          // pasa por debajo del icono y deja de leerse justo cuando se lo
          // quiere leer.
          className="w-full rounded-sm border border-borde bg-papel-alto py-3 pl-3 pr-12 text-base outline-none focus:border-marca-texto"
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          // 44px de lado, que es el mínimo táctil de WCAG 2.5.5, en vez de la
          // utilidad `.toque`: esa agranda el área con un `::after` y para eso
          // necesita `position: relative`, que pisa el `absolute` de acá y
          // manda el botón fuera del campo. Dos utilidades que no se pueden
          // combinar; el tamaño real no necesita truco.
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm text-texto-2 hover:text-texto"
        >
          <Icono nombre={visible ? "ojo-cerrado" : "ojo"} size={18} />
        </button>
      </div>

      {ayuda && <span className="mt-1 block text-caption text-texto-2">{ayuda}</span>}
    </div>
  );
}
