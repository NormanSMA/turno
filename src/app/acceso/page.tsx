"use client";

/**
 * Acceso para cuentas de operación: comercio y administración.
 *
 * Está en una ruta aparte de `/entrar` a propósito. Un estudiante nunca debería
 * ver un campo de contraseña —no tiene una, y ofrecerle uno lo manda a buscar
 * algo que no existe—; y el operador no debería tener que pasar por la pantalla
 * de enlace mágico para descubrir que su método es otro.
 */

import { Suspense, useState } from "react";
import { olvidarSesion } from "@/lib/sesion-cliente";
import { CampoPassword } from "@/components/CampoPassword";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { esRutaSegura } from "@/core/rutas";
import { api, ErrorApi } from "@/lib/cliente";

interface Respuesta {
  autenticado: boolean;
  rol: "COMERCIO" | "ADMIN";
  debeCambiarPassword: boolean;
}

function Acceso() {
  const params = useSearchParams();
  // Se descarta cualquier destino que no sea una ruta relativa de este sitio.
  const crudo = params.get("volver");
  const volver = esRutaSegura(crudo) ? crudo : null;

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api<Respuesta>("/api/auth/acceso", {
        method: "POST",
        body: JSON.stringify({ correo, password }),
      });

      // El destino depende del rol: al operador le sirve la cocina, al
      // administrador el panel. Mandar a los dos al mismo lado obligaría a uno
      // de los dos a navegar de más en cada acceso.
      const destino =
        volver ?? (r.rol === "ADMIN" ? "/panel" : "/cocina/cafeteria-central");

      /*
       * Recarga completa, no `router.replace`.
       *
       * La sesión se cachea a nivel de módulo para no pedirla N veces
       * (`lib/sesion-cliente`), y una navegación de cliente **no reinicia ese
       * módulo**: la aplicación seguía creyendo que quien acababa de entrar era
       * un invitado, con el menú de invitado, hasta que la persona recargaba a
       * mano. Entraba y quedaba afuera.
       *
       * `olvidarSesion()` existía justo para esto y no la llamaba nadie —el
       * comentario de ese archivo afirmaba "se invalida al entrar y al salir",
       * y era verdad solo al salir—. Se invalida igual, por si el destino no
       * llegara a recargar.
       *
       * Y hace falta la recarga completa además de la invalidación: desde la
       * fase 3 la portada resuelve la sesión en el SERVIDOR y la recibe como
       * prop, así que un árbol de React conservado seguiría mostrando el estado
       * anterior aunque la caché del cliente ya estuviera limpia. Es la misma
       * razón por la que salir y canjear el enlace mágico también recargan.
       */
      olvidarSesion();
      const url = r.debeCambiarPassword ? "/cuenta?cambiar=1" : destino;
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof ErrorApi
          ? err.message
          : "No pudimos validar el acceso. Revisá tu conexión.",
      );
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <p className="etiqueta">TURNO · Operación</p>
      <h1 className="titulo mt-2 text-4xl">Acceso del comercio</h1>
      <p className="mt-3 text-sm text-tinta-suave">
        Para la pantalla de cocina y el panel del piloto. Si sos estudiante,{" "}
        <Link href="/entrar" className="text-marca-texto underline underline-offset-2">
          entrá con tu correo
        </Link>
        .
      </p>

      <form onSubmit={entrar} className="mt-6 space-y-3">
        <label className="block">
          <span className="etiqueta">Correo</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-borde bg-papel-alto px-3 py-3 text-base"
          />
        </label>

        <CampoPassword
          etiqueta="Contraseña"
          valor={password}
          onCambiar={setPassword}
          autoComplete="current-password"
        />

        {error && (
          <p role="alert" className="rounded-md bg-brasa-claro px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-xs text-tinta-suave">
        Si perdiste la contraseña, el equipo la reemplaza desde el servidor. No
        hay recuperación por correo para estas cuentas.
      </p>
    </main>
  );
}

export default function Pagina() {
  return (
    <Suspense
      fallback={<main className="p-8 text-sm text-tinta-suave">Cargando…</main>}
    >
      <Acceso />
    </Suspense>
  );
}
