"use client";

/**
 * Cambio de contraseña de una cuenta de operación.
 *
 * Se llega acá obligatoriamente en el primer acceso, cuando la contraseña la
 * generó el script y todavía figura en el papelito con que se la entregaron al
 * operador. Cambiarla revoca todas las sesiones, incluida la propia: eso es
 * correcto —si no, un cambio de contraseña no expulsaría a nadie— y hay que
 * decirlo antes, no después, para que no parezca que la app se rompió.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ErrorApi } from "@/lib/cliente";

function Cuenta() {
  const router = useRouter();
  const obligatorio = useSearchParams().get("cambiar") === "1";

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (nueva !== repetir) {
      setError("Las dos contraseñas nuevas no coinciden");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await api<{ destino: string }>("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ actual, nueva }),
      });
      setDestino(r.destino);
    } catch (err) {
      setError(
        err instanceof ErrorApi
          ? err.message
          : "No pudimos cambiar la contraseña.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (destino) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
        <p className="etiqueta">Listo</p>
        <h1 className="titulo mt-2 text-3xl">Contraseña cambiada</h1>
        <p className="mt-3 text-sm text-tinta-suave">
          Tu sesión sigue abierta. Si habías entrado desde otro dispositivo, esa
          sesión quedó cerrada.
        </p>
        <button
          type="button"
          onClick={() => router.replace(destino)}
          className="presiona brillo mt-6 rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white"
        >
          Continuar
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <p className="etiqueta">TURNO · Operación</p>
      <h1 className="titulo mt-2 text-3xl">
        {obligatorio ? "Elegí tu contraseña" : "Cambiar contraseña"}
      </h1>
      <p className="mt-3 text-sm text-tinta-suave">
        {obligatorio
          ? "Entraste con la contraseña que te entregó el equipo. Cambiala por una tuya antes de seguir."
          : "Al cambiarla se cierran las sesiones abiertas en otros dispositivos."}
      </p>

      <form onSubmit={guardar} className="mt-6 space-y-3">
        <label className="block">
          <span className="etiqueta">Contraseña actual</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className="mt-1 w-full rounded-sm border border-borde bg-papel-alto px-3 py-3 text-base"
          />
        </label>

        <label className="block">
          <span className="etiqueta">Contraseña nueva</span>
          <input
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className="mt-1 w-full rounded-sm border border-borde bg-papel-alto px-3 py-3 text-base"
          />
          <span className="mt-1 block text-xs text-tinta-suave">
            Al menos 12 caracteres.
          </span>
        </label>

        <label className="block">
          <span className="etiqueta">Repetí la nueva</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            className="mt-1 w-full rounded-sm border border-borde bg-papel-alto px-3 py-3 text-base"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-sm bg-alerta-claro px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="presiona brillo w-full rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {enviando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}

export default function Pagina() {
  return (
    <Suspense
      fallback={<main className="p-8 text-sm text-tinta-suave">Cargando…</main>}
    >
      <Cuenta />
    </Suspense>
  );
}
