/**
 * Marca de TURNO (ADR-22).
 *
 * El isotipo es un reloj con una franja marcada: el producto no vende comida,
 * vende una hora de retiro dentro de la capacidad de la cocina. Sin bolsa ni
 * líneas de velocidad, que era lo que lo acercaba a las apps de entrega.
 *
 * Es un SVG en código y no un PNG: hereda el color del texto (`currentColor`
 * para el aro y la manecilla) y el dorado de fidelidad para la franja, así que
 * sigue la paleta en claro y en oscuro sin archivos aparte. El favicon sale de
 * la misma geometría (`src/app/icon.svg`).
 */

/** Geometría compartida con `src/app/icon.svg`: centro 32,32, radio 26. */
export function MarcaTurno({
  size = 40,
  className = "",
  titulo = "TURNO",
}: {
  size?: number;
  className?: string;
  /** Texto accesible. Vacío para que el logo sea decorativo. */
  titulo?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role={titulo ? "img" : undefined}
      aria-label={titulo || undefined}
      aria-hidden={titulo ? undefined : true}
    >
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" />
      <path
        d="M32 6 A26 26 0 0 1 54.52 45"
        fill="none"
        stroke="var(--color-fidelidad)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M32 32 L46.72 40.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="3.5" fill="currentColor" />
    </svg>
  );
}

/**
 * Logotipo: isotipo + palabra.
 *
 * La palabra va en minúsculas y con el peso más alto de Geist. `size` controla
 * el isotipo y la tipografía se deriva de él, para que no se descuadren cuando
 * alguien cambia uno solo.
 */
export function LogotipoTurno({
  size = 30,
  conLema = false,
  className = "",
}: {
  size?: number;
  conLema?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <MarcaTurno size={size} />
      <span className="inline-flex flex-col">
        <span
          className="font-extrabold leading-none tracking-[-0.03em]"
          style={{ fontSize: size * 0.78 }}
        >
          turno
        </span>
        {conLema && (
          <span
            className="mt-1 font-semibold uppercase leading-none tracking-[0.28em] text-texto-2"
            style={{ fontSize: Math.max(7, size * 0.2) }}
          >
            Pedí · Llegá · Retirá
          </span>
        )}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */

/** Geometría del arco: 270°, abierto abajo, como un medidor. */
const RADIO = 34;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
const ARCO = 0.75;

function trazo(fraccion: number) {
  const visible = CIRCUNFERENCIA * ARCO * Math.max(0, Math.min(1, fraccion));
  return { strokeDasharray: `${visible} ${CIRCUNFERENCIA}` };
}

/**
 * Medidor de ocupación de una franja.
 *
 * `ocupacion` es carga/capacidad efectiva. El color sale del propio dato y no
 * de quien llama: por debajo del 75 % hay holgura, por encima del 95 % ya no
 * cabe nada. Que el color salga del número es lo que impide que una pantalla
 * pinte de verde una franja llena.
 */
export function MedidorFranja({
  ocupacion,
  size = 44,
  grosor = 7,
  className = "",
  children,
}: {
  ocupacion: number;
  size?: number;
  grosor?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const color =
    ocupacion >= 0.95
      ? "var(--color-error)"
      : ocupacion >= 0.75
        ? "var(--color-aviso)"
        : "var(--color-exito)";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 80 80"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* El arco gira para que su apertura quede abajo, como un tacómetro. */}
        <g transform="rotate(135 40 40)">
          <circle
            cx="40"
            cy="40"
            r={RADIO}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth={grosor}
            strokeLinecap="round"
            style={trazo(1)}
          />
          <circle
            cx="40"
            cy="40"
            r={RADIO}
            fill="none"
            stroke={color}
            strokeWidth={grosor}
            strokeLinecap="round"
            style={trazo(ocupacion)}
          />
        </g>
      </svg>
      {children && <span className="relative">{children}</span>}
    </span>
  );
}

/**
 * Fondo de cabecera.
 *
 * Campo oscuro con una retícula de franjas: la trama del producto —el tiempo
 * partido en ventanas— en vez de un adorno. El calor entra por una esquina,
 * del lado del acento, para que la cabecera tenga una dirección.
 */
export function CabeceraTurno({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-cocina ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(247,244,238,.07) 0 1px, transparent 1px 68px)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(182,141,89,.32) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  );
}
