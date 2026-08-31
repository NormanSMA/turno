"use client";

/**
 * Quién tiene acceso (§33).
 *
 * Hasta acá las cuentas de operación se creaban por script y no había forma de
 * ver quién las tenía. Eso funciona con cuatro cuentas y deja de funcionar el
 * día que un comercio cambia de encargado.
 *
 * La pantalla está ordenada por riesgo, no alfabéticamente: primero lo que hay
 * que atender —contraseñas iniciales sin cambiar, cuentas que nunca entraron—
 * y después el resto. Una lista de accesos que no señala lo peligroso obliga a
 * revisarla entera cada vez, que es como se termina no revisándola nunca.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icono } from "@/components/iconos";
import { ErrorVista, Esqueleto } from "@/components/estados-ui";
import { api, ErrorApi } from "@/lib/cliente";

interface UsuarioAdmin {
  id: string;
  correo: string;
  rol: string;
  comercio: string | null;
  passwordInicial: boolean;
  sesionesActivas: number;
  ultimoAccesoEn: string | null;
  desde: string;
}

function cuando(iso: string | null): string {
  if (!iso) return "nunca entró";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return `hace ${Math.floor(dias / 30)} meses`;
}

export default function Pagina() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<{ usuarios: UsuarioAdmin[] }>("/api/admin/usuarios")
      .then((r) => {
        setUsuarios(r.usuarios);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof ErrorApi ? e.message : "No pudimos cargar."),
      );
  }, []);

  useEffect(cargar, [cargar]);

  async function actuar(u: UsuarioAdmin, accion: string, confirmacion: string) {
    if (!confirm(confirmacion)) return;
    setOcupado(u.id);
    setAviso(null);
    try {
      await api("/api/admin/usuarios", {
        method: "PATCH",
        body: JSON.stringify({ usuarioId: u.id, accion }),
      });
      cargar();
    } catch (e) {
      // El mensaje del servidor se muestra tal cual: las barandas explican por
      // qué se rechazó ("es el único administrador"), y reescribirlas acá haría
      // que la pantalla y la regla puedan contradecirse.
      setAviso(e instanceof ErrorApi ? e.message : "No se pudo aplicar.");
    } finally {
      setOcupado(null);
    }
  }

  // Primero lo que hay que atender. Una lista que no señala lo peligroso
  // obliga a revisarla entera, y así es como se termina no revisándola.
  const orden = (u: UsuarioAdmin) =>
    u.passwordInicial ? 0 : u.ultimoAccesoEn === null ? 1 : 2;
  const lista = usuarios ? [...usuarios].sort((a, b) => orden(a) - orden(b)) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:px-5">
      <Link href="/panel" className="etiqueta inline-flex items-center gap-1">
        ← Panel
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="titulo text-h1">Accesos</h1>
        <p className="mt-1 text-chico text-texto-2">
          Cuentas de operación y administración. Desactivar una cuenta no borra
          su historial: corta el acceso.
        </p>
      </header>

      {error && <ErrorVista texto={error} onReintentar={cargar} />}
      {aviso && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-aviso/40 bg-atencion-suave px-4 py-3 text-chico"
        >
          {aviso}
        </p>
      )}

      {!lista && !error && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {lista && (
        <ul className="space-y-2">
          {lista.map((u) => (
            <li
              key={u.id}
              className={`rounded-lg border bg-superficie p-4 ${
                u.passwordInicial ? "border-aviso/50" : "border-borde"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-cuerpo font-semibold">{u.correo}</p>
                  <p className="mt-0.5 text-caption text-texto-2">
                    {u.rol}
                    {u.comercio ? ` · ${u.comercio}` : ""} · último acceso{" "}
                    {cuando(u.ultimoAccesoEn)}
                  </p>
                </div>
                <span className="hora shrink-0 rounded-full bg-superficie-2 px-2.5 py-1 text-caption">
                  {u.sesionesActivas}{" "}
                  {u.sesionesActivas === 1 ? "sesión" : "sesiones"}
                </span>
              </div>

              {u.passwordInicial && (
                /* La contraseña inicial la conoce quien creó la cuenta, no solo
                   su dueño. Mientras no la cambie, es una puerta abierta. */
                <p className="mt-2 flex items-center gap-1.5 text-caption font-semibold text-aviso">
                  <Icono nombre="reloj" size={13} />
                  Sigue con la contraseña inicial sin cambiar
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={ocupado === u.id || u.sesionesActivas === 0}
                  onClick={() =>
                    actuar(
                      u,
                      "REVOCAR_SESIONES",
                      `Se van a cerrar las ${u.sesionesActivas} sesiones de ${u.correo}. Va a tener que volver a entrar.`,
                    )
                  }
                  className="presiona min-h-11 rounded-md border border-borde px-4 text-chico font-semibold disabled:opacity-40"
                >
                  Cerrar sus sesiones
                </button>

                {u.rol === "ADMIN" ? (
                  <button
                    type="button"
                    disabled={ocupado === u.id}
                    onClick={() =>
                      actuar(
                        u,
                        "QUITAR_ADMIN",
                        `${u.correo} deja de ser administrador y se cierran sus sesiones. ¿Seguir?`,
                      )
                    }
                    className="presiona min-h-11 rounded-md border border-error/40 px-4 text-chico font-semibold text-error disabled:opacity-40"
                  >
                    Quitar administrador
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={ocupado === u.id}
                    onClick={() =>
                      actuar(
                        u,
                        "HACER_ADMIN",
                        `${u.correo} va a poder ver el panel completo y operar cualquier comercio. ¿Seguir?`,
                      )
                    }
                    className="presiona min-h-11 rounded-md border border-borde px-4 text-chico font-semibold disabled:opacity-40"
                  >
                    Hacer administrador
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-caption text-texto-2">
        Cambiar un rol cierra las sesiones de esa cuenta: si no, el permiso
        viejo seguiría vivo hasta que expire su cookie. Todo queda registrado en{" "}
        <Link href="/panel/operacion" className="font-semibold text-marca-texto">
          Operación
        </Link>
        .
      </p>
    </main>
  );
}
