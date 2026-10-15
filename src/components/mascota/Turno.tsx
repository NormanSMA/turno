"use client";

import { m } from "motion/react";

/**
 * Mascota "turno" (ADR-22).
 *
 * Un reloj con piernas: la cara es el reloj de la marca y la franja dorada es
 * su ceja. Es SVG en código para que use los tokens y para que cada parte
 * (parpadeo, brazo) se anime por separado con Motion. Sin Rive ni Lottie.
 *
 * Estados: `saluda` (onboarding, bienvenida), `listo` (pedido listo, éxito),
 * `espera` (línea de tiempo, cocina preparando), `error` (algo falló, no hay
 * franja). Con movimiento reducido, `MotionConfig` apaga los bucles y la
 * mascota queda en su pose final.
 */
export type EstadoMascota = "saluda" | "listo" | "espera" | "error";

const RESORTE = { type: "spring", stiffness: 320, damping: 14 } as const;

export function MascotaTurno({
  estado = "saluda",
  size = 160,
  conGorro = false,
  titulo,
}: {
  estado?: EstadoMascota;
  size?: number;
  /** Gorro de cocina: para las pantallas del comercio y la cocina. */
  conGorro?: boolean;
  /** Texto accesible. Sin texto, la mascota es decorativa. */
  titulo?: string;
}) {
  const boca =
    estado === "error"
      ? "M44 82 Q60 74 76 82"
      : estado === "espera"
        ? "M48 80 L72 80"
        : "M44 76 Q60 92 76 76";

  return (
    <m.svg
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={RESORTE}
    >
      {/* Piernas */}
      <rect x="40" y="108" width="10" height="22" rx="5" fill="var(--color-texto)" />
      <rect x="70" y="108" width="10" height="22" rx="5" fill="var(--color-texto)" />
      <rect x="34" y="124" width="22" height="9" rx="4.5" fill="var(--color-texto)" />
      <rect x="64" y="124" width="22" height="9" rx="4.5" fill="var(--color-texto)" />

      {/* Brazo izquierdo, quieto */}
      <path d="M16 70 Q6 82 12 96" fill="none" stroke="var(--color-marca-fondo)" strokeWidth="6" strokeLinecap="round" />

      {/* Brazo derecho: saluda, celebra o descansa */}
      <m.g
        style={{ transformBox: "view-box", transformOrigin: "104px 72px" }}
        animate={
          estado === "saluda"
            ? { rotate: [0, -22, 6, -22, 0] }
            : estado === "listo"
              ? { rotate: [0, -50, -44, -50] }
              : { rotate: 0 }
        }
        transition={
          estado === "saluda"
            ? { duration: 1.6, repeat: 2, repeatDelay: 2.4 }
            : estado === "listo"
              ? { duration: 0.9, repeat: 1 }
              : { duration: 0.2 }
        }
      >
        <path d="M104 72 Q114 56 108 42" fill="none" stroke="var(--color-marca-fondo)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="108" cy="40" r="5" fill="var(--color-fidelidad)" />
      </m.g>

      {/* Cuerpo: el reloj */}
      <circle cx="60" cy="68" r="46" fill="var(--color-marca-fondo)" />
      <circle cx="60" cy="68" r="38" fill="var(--color-fondo)" />

      {/* Franja dorada: la ceja */}
      <path d="M36 50 A30 30 0 0 1 60 38" fill="none" stroke="var(--color-fidelidad)" strokeWidth="7" strokeLinecap="round" />

      {/* Ojos con parpadeo */}
      <m.g
        style={{ transformBox: "view-box", transformOrigin: "60px 62px" }}
        animate={estado === "espera" ? { scaleY: [1, 1, 0.1, 1] } : { scaleY: [1, 1, 1, 0.1, 1] }}
        transition={{ duration: 4, repeat: Infinity, times: estado === "espera" ? [0, 0.6, 0.65, 0.7] : [0, 0.5, 0.9, 0.94, 1] }}
      >
        <circle cx="46" cy="62" r="5" fill="var(--color-texto)" />
        <circle cx="74" cy="62" r="5" fill="var(--color-texto)" />
      </m.g>

      <path d={boca} fill="none" stroke="var(--color-texto)" strokeWidth="4" strokeLinecap="round" />

      {/* Gotas de ánimo según estado */}
      {estado === "espera" && (
        <m.circle
          cx="86"
          cy="48"
          r="3.5"
          fill="var(--color-fidelidad)"
          animate={{ y: [0, 10], opacity: [1, 0] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      )}
      {estado === "listo" && (
        <>
          <m.path d="M20 30 L26 36 M26 30 L20 36" stroke="var(--color-fidelidad)" strokeWidth="3" strokeLinecap="round" animate={{ scale: [0.6, 1.1, 0.9] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ transformBox: "view-box", transformOrigin: "23px 33px" }} />
          <m.circle cx="96" cy="22" r="3" fill="var(--color-fidelidad)" animate={{ scale: [0.5, 1.2, 0.8] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ transformBox: "view-box", transformOrigin: "96px 22px" }} />
        </>
      )}

      {conGorro && (
        <g>
          <rect x="38" y="14" width="44" height="12" rx="3" fill="var(--color-superficie)" stroke="var(--color-borde)" strokeWidth="2" />
          <circle cx="44" cy="12" r="10" fill="var(--color-superficie)" stroke="var(--color-borde)" strokeWidth="2" />
          <circle cx="60" cy="8" r="12" fill="var(--color-superficie)" stroke="var(--color-borde)" strokeWidth="2" />
          <circle cx="76" cy="12" r="10" fill="var(--color-superficie)" stroke="var(--color-borde)" strokeWidth="2" />
          <rect x="38" y="16" width="44" height="10" rx="3" fill="var(--color-superficie)" />
        </g>
      )}
    </m.svg>
  );
}
