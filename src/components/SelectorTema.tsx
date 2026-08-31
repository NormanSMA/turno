"use client";

/**
 * Selector de tema (Design System §41).
 *
 * Tres opciones y no dos. "Sistema" es la que viene por defecto y la que más
 * gente deja puesta: el teléfono ya sabe si es de noche, y obligar a elegir a
 * mano es trabajo que la aplicación puede evitarse.
 *
 * El estado vive en `data-tema` sobre `<html>` y se recuerda en el navegador.
 * `globals.css` lo lee así:
 *
 *   sin atributo   → manda `prefers-color-scheme`
 *   data-tema=claro  → claro aunque el sistema esté oscuro
 *   data-tema=oscuro → oscuro aunque el sistema esté claro
 *
 * Se aplica también en `Arranque`, antes de que el usuario llegue acá: si solo
 * se aplicara en esta pantalla, cada carga empezaría en claro y saltaría a
 * oscuro, que es peor que no tener la opción.
 */

import { useCallback, useSyncExternalStore } from "react";
import { Icono } from "@/components/iconos";

export type Tema = "sistema" | "claro" | "oscuro";

export const CLAVE_TEMA = "turno-tema";

/** Escribe el tema en el documento. Compartida con `Arranque`. */
export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (tema === "sistema") raiz.removeAttribute("data-tema");
  else raiz.setAttribute("data-tema", tema);
}

export function leerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    if (v === "claro" || v === "oscuro" || v === "sistema") return v;
  } catch {
    // Modo privado o almacenamiento bloqueado: se usa el del sistema, que es
    // el valor por defecto correcto y no requiere guardar nada.
  }
  return "sistema";
}

const OPCIONES: { valor: Tema; texto: string }[] = [
  { valor: "sistema", texto: "Sistema" },
  { valor: "claro", texto: "Claro" },
  { valor: "oscuro", texto: "Oscuro" },
];

/*
 * El tema es estado que vive FUERA de React —en `localStorage` y en un atributo
 * del documento— y puede cambiar desde otra pestaña. `useSyncExternalStore` es
 * la herramienta correcta para eso, igual que en `src/lib/aviso.ts`, y además
 * resuelve la hidratación: la instantánea del servidor es "sistema" y el
 * cliente corrige sin discrepancia.
 */
const oyentes = new Set<() => void>();

function suscribir(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  // `storage` avisa cuando el cambio vino de OTRA pestaña. Sin esto, cambiar
  // el tema en una dejaría a la otra mostrando el selector desactualizado.
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

function avisarCambio() {
  oyentes.forEach((f) => f());
}

export function SelectorTema() {
  const tema = useSyncExternalStore(
    suscribir,
    leerTema,
    () => "sistema" as Tema,
  );

  const elegir = useCallback((v: Tema) => {
    try {
      localStorage.setItem(CLAVE_TEMA, v);
    } catch {
      // Sin persistencia el tema dura la sesión. Es una degradación aceptable.
    }
    aplicarTema(v);
    avisarCambio();
  }, []);

  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-chico font-medium">
        <Icono nombre="luna" size={18} />
        Tema
      </p>
      <p className="mb-3 text-caption text-texto-2">
        El modo oscuro no es el claro invertido: tiene su propia paleta.
      </p>

      <div
        role="radiogroup"
        aria-label="Tema de la aplicación"
        className="flex gap-1 rounded-full border border-borde bg-fondo p-1"
      >
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={tema === o.valor}
            onClick={() => elegir(o.valor)}
            className={`flex-1 rounded-full px-3 py-2 text-chico font-semibold transition-colors ${
              tema === o.valor
                ? "bg-marca-fondo text-white"
                : "text-texto-2 hover:text-texto"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}
