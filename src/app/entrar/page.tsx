"use client";

/**
 * Entrada por enlace mágico.
 *
 * Dos pasos en una pantalla: pedir el enlace y, si el usuario vuelve con
 * `?token=`, canjearlo automáticamente. Nunca hay contraseña que recordar ni
 * que recuperar.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navegacion } from "@/components/Navegacion";
import { rutaSegura } from "@/core/rutas";
import { api, ErrorApi } from "@/lib/cliente";

function Entrar() {
  const params = useSearchParams();
  // Nunca se usa el parametro crudo: una redireccion abierta despues del
  // inicio de sesion es un amplificador de phishing (ver core/rutas.ts).
  const volver = rutaSegura(params.get("volver"));
  const token = params.get("token");

  const [correo, setCorreo] = useState("");
  const [estado, setEstado] = useState<
    "inicio" | "enviando" | "enviado" | "canjeando" | "error"
  >(token ? "canjeando" : "inicio");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enlaceDesarrollo, setEnlaceDesarrollo] = useState<string | null>(null);
  // Una cuenta de operación que pide enlace mágico no se equivocó de sistema:
  // se equivocó de puerta. Hay que llevarla a la correcta, no solo negarle.
  const [esCuentaOperacion, setEsCuentaOperacion] = useState(false);

  useEffect(() => {
    if (!token) return;
    api("/api/auth/canjear", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        window.location.assign(volver);
      })
      .catch((e) => {
        setEstado("error");
        setMensaje(
          e instanceof ErrorApi
            ? e.message
            : "No pudimos validar el enlace. Pedí uno nuevo.",
        );
      });
  }, [token, volver]);

  async function pedirEnlace(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setMensaje(null);
    try {
      const r = await api<{ tokenDesarrollo?: string }>("/api/auth/enlace", {
        method: "POST",
        body: JSON.stringify({ correo, consentimiento: true }),
      });
      setEstado("enviado");
      if (r.tokenDesarrollo) {
        setEnlaceDesarrollo(
          `/entrar?token=${r.tokenDesarrollo}&volver=${encodeURIComponent(volver)}`,
        );
      }
    } catch (err) {
      setEstado("error");
      if (err instanceof ErrorApi && err.status === 403) {
        setEsCuentaOperacion(true);
        setMensaje(null);
        return;
      }
      setMensaje(
        err instanceof ErrorApi
          ? err.message
          : "No pudimos enviar el enlace. Probá de nuevo.",
      );
    }
  }

  if (estado === "canjeando") {
    return <Centro>Validando tu enlace…</Centro>;
  }

  if (esCuentaOperacion) {
    return (
      <Centro>
        <p className="etiqueta">Puerta equivocada</p>
        <h1 className="titulo mt-2 text-3xl">
          Esa cuenta entra con contraseña
        </h1>
        <p className="mt-3 text-sm text-tinta-suave">
          <strong>{correo}</strong> es una cuenta del comercio o del equipo. Esas
          no usan enlace mágico: entran con usuario y contraseña.
        </p>
        <Link
          href={`/acceso?volver=${encodeURIComponent(volver)}`}
          className="presiona brillo mt-6 block rounded-full bg-marca-fondo px-6 py-3 text-center font-semibold text-white"
        >
          Ir al acceso del comercio
        </Link>
        <button
          type="button"
          onClick={() => {
            setEsCuentaOperacion(false);
            setEstado("inicio");
          }}
          className="mt-3 text-sm font-medium text-tinta-suave underline underline-offset-2"
        >
          Usar otro correo
        </button>
      </Centro>
    );
  }

  if (estado === "enviado") {
    return (
      <Centro>
        <p className="etiqueta">Revisá tu correo</p>
        <h1 className="titulo mt-2 text-3xl">Te mandamos un enlace</h1>
        <p className="mt-3 text-sm text-tinta-suave">
          Abrilo desde este teléfono y quedás dentro. Vence en 15 minutos.
        </p>
        {enlaceDesarrollo && (
          <a
            href={enlaceDesarrollo}
            className="mt-6 block rounded-lg border border-dashed border-marca-texto bg-marca-fondo/5 px-4 py-3 text-sm font-medium text-marca-texto"
          >
            Enlace de desarrollo — entrar ahora
          </a>
        )}
      </Centro>
    );
  }

  return (
    <Centro>
      <p className="etiqueta">TURNO</p>
      <h1 className="titulo mt-2 text-4xl">Entrá con tu correo</h1>
      <p className="mt-3 text-sm text-tinta-suave">
        Sin contraseña. Te mandamos un enlace a tu correo de la UAM y con eso
        quedás dentro por el resto del semestre.
      </p>

      <form onSubmit={pedirEnlace} className="mt-6 space-y-3">
        <label className="block">
          <span className="etiqueta">Correo institucional</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="nombre@uam.edu.ni"
            className="mt-1 w-full rounded-lg border border-borde bg-papel-alto px-3 py-3 text-base"
          />
        </label>

        {mensaje && (
          <p role="alert" className="rounded-md bg-brasa-claro px-3 py-2 text-sm">
            {mensaje}
          </p>
        )}

        <button
          type="submit"
          disabled={estado === "enviando"}
          className="w-full rounded-full bg-marca-fondo px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {estado === "enviando" ? "Enviando…" : "Mandame el enlace"}
        </button>

        <p className="text-xs text-tinta-suave">
          Al entrar aceptás participar en el estudio. Tus datos se analizan de
          forma anónima y no se procesa ningún pago en la plataforma.
        </p>
      </form>

      {/* La puerta del comercio tiene que estar VISIBLE. Sin este enlace, un
          operador que llega acá no tiene forma de descubrir que su acceso es
          otro, y la interfaz se convierte en un callejón sin salida. */}
      <p className="mt-8 border-t border-borde pt-5 text-sm text-tinta-suave">
        ¿Trabajás en el comercio o sos del equipo de investigación?{" "}
        <Link
          href="/acceso"
          className="font-medium text-marca-texto underline underline-offset-2"
        >
          Entrá con tu contraseña
        </Link>
      </p>
    </Centro>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navegacion />
      <main className="mx-auto flex min-h-[80dvh] w-full max-w-md flex-col justify-center px-5 pb-28 pt-10 sm:pb-10">
        {children}
      </main>
    </>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Centro>Cargando…</Centro>}>
      <Entrar />
    </Suspense>
  );
}
