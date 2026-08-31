"use client";

/**
 * La franja contada en tiempo real (§03, §04, §21, §22). Antes se veía igual
 * faltando una hora que faltando dos minutos.
 *
 * La pieza clave es EN_RIESGO: avisa mientras todavía se puede llegar. Nunca
 * reta — solo dice cuánto queda y dónde es, que es lo accionable.
 */

import { Icono, type NombreIcono } from "@/components/iconos";
import { estadoTemporal, type Urgencia } from "@/core/urgencia";
import { useAhora } from "@/lib/reloj";
import { minutosLegibles } from "@/lib/tiempo";

const TONO: Record<Urgencia, { clase: string; icono: NombreIcono }> = {
  TRANQUILO: { clase: "border-borde bg-superficie", icono: "reloj" },
  PRONTO: { clase: "border-marca-texto/30 bg-marca-suave", icono: "reloj" },
  AHORA: { clase: "border-exito/40 bg-exito-suave", icono: "palomita" },
  ESPERANDO: { clase: "border-aviso/40 bg-atencion-suave", icono: "reloj" },
  EN_RIESGO: { clase: "border-error/50 bg-error-suave", icono: "reloj" },
  VENCIDO: { clase: "border-borde bg-superficie", icono: "reloj" },
};

export function AvisoUrgencia({
  estado,
  franjaInicio,
  franjaFin,
  listoEn,
  minutosNoShow,
  ubicacion,
}: {
  estado: string;
  franjaInicio: string;
  franjaFin: string;
  listoEn: string | null;
  minutosNoShow: number;
  ubicacion?: string | null;
}) {
  const ahora = useAhora();

  const t = estadoTemporal({
    estado,
    franjaInicio: new Date(franjaInicio),
    franjaFin: new Date(franjaFin),
    listoEn: listoEn ? new Date(listoEn) : null,
    minutosNoShow,
    ahora,
  });

  // La línea de tiempo ya cuenta esos dos; "falta bastante" es ruido fijo.
  if (t.urgencia === "TRANQUILO" || t.urgencia === "VENCIDO") return null;

  const { clase, icono } = TONO[t.urgencia];

  const titulo =
    t.urgencia === "PRONTO"
      ? `Tu retiro es en ${minutosLegibles(t.minutosParaRetirar)}`
      : t.urgencia === "AHORA"
        ? estado === "LISTO"
          ? "Tu pedido está listo"
          : "Es tu hora de retiro"
        : t.urgencia === "ESPERANDO"
          ? `Lleva ${minutosLegibles(t.minutosEsperando ?? 0)} esperándote`
          : `Te quedan ${minutosLegibles(t.minutosAntesDeNoShow ?? 0)} para retirarlo`;

  const detalle =
    t.urgencia === "PRONTO"
      ? "Andá saliendo. Cuando esté listo te avisamos acá mismo."
      : t.urgencia === "AHORA"
        ? estado === "LISTO"
          ? "Mostrá tu código en el mostrador."
          : "Ya podés acercarte: te avisamos apenas salga de cocina."
        : t.urgencia === "ESPERANDO"
          ? "Sigue guardado. Mientras más rápido lo retires, mejor se come."
          : // Se dice qué pasa después y que no es un castigo: el estudiante
            // que cree que ya lo perdió, directamente no va.
            "Pasado ese rato el comercio puede liberarlo. Si vas en camino, seguí — nadie te va a cobrar por llegar tarde.";

  return (
    <div
      role="status"
      /* `assertive` solo si hay algo que hacer: anunciar cada minuto sería
         insoportable con lector de pantalla. */
      aria-live={t.urgencia === "EN_RIESGO" ? "assertive" : "polite"}
      className={`entra rounded-md border px-4 py-3 ${clase}`}
    >
      <p className="flex items-center gap-2 text-cuerpo font-semibold">
        <span className={t.urgencia === "EN_RIESGO" ? "text-error" : undefined}>
          <Icono nombre={icono} size={18} />
        </span>
        {titulo}
      </p>
      <p className="mt-1 text-chico text-texto-2">{detalle}</p>
      {ubicacion && t.urgencia !== "ESPERANDO" && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-texto-2">
          <Icono nombre="local" size={14} />
          {ubicacion}
        </p>
      )}
    </div>
  );
}
