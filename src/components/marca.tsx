/**
 * Marca de TURNO.
 *
 * El isotipo es la T convertida en bolsa de comida en movimiento: la
 * travesaño se enrolla como una hoja, el asta baja hasta el pie curvo, la bolsa
 * con el tenedor se apoya a la derecha y tres líneas de velocidad entran por la
 * izquierda. Rojo de marca con las líneas en ámbar.
 *
 * Está dibujado en SVG y no importado como PNG por tres razones concretas:
 *
 *   1. **Peso.** Cero kilobytes de imagen. Un PNG a 3× para pantallas retina
 *      son ~40 KB que se pagan en la primera carga, con datos móviles, cada vez
 *      que alguien abre la aplicación caminando por el campus (ADR-11).
 *   2. **Color.** Hereda los tokens. En modo oscuro el rojo se aclara solo,
 *      igual que el resto del sistema; un PNG quedaría con el rojo del modo
 *      claro sobre fondo negro.
 *   3. **Escala.** El mismo archivo sirve para el favicon de 16 px y para el
 *      cartel impreso con QR, sin exportar seis tamaños.
 *
 * El degradado está permitido acá: el Design System lo autoriza en marca y
 * elementos decorativos, y lo prohíbe en botones, inputs, tarjetas y texto.
 */

/*
 * Los ids de los degradados son FIJOS, no únicos por instancia.
 *
 * Repetir un id normalmente es un error: el navegador resuelve la primera
 * definición y las demás quedan muertas. Acá eso es exactamente lo que se
 * quiere, porque todas las instancias definen el MISMO degradado — así que la
 * que gane sirve para todas, y el documento queda con dos nodos de más en vez
 * de con un contador mutable.
 *
 * La alternativa (`useId`) obligaría a marcar el componente como cliente, y la
 * marca se usa en páginas de servidor como `not-found` y `sin-conexion`.
 */
const ID_ROJO = "turno-marca-rojo";
const ID_AMBAR = "turno-marca-ambar";

export function MarcaTurno({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="TURNO"
    >
      <defs>
        <linearGradient id={ID_ROJO} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-marca)" />
          <stop offset="100%" stopColor="var(--color-marca-fuerte)" />
        </linearGradient>
        <linearGradient id={ID_AMBAR} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-atencion)" />
          <stop offset="100%" stopColor="var(--color-aviso)" />
        </linearGradient>
      </defs>

      {/* Líneas de velocidad: larga, media y punto. Entran por la izquierda,
          que es de donde viene el movimiento en lectura occidental. */}
      <g fill={`url(#${ID_AMBAR})`}>
        <rect x="1" y="25" width="22" height="6" rx="3" />
        <rect x="6" y="34" width="17" height="6" rx="3" />
        <rect x="12" y="43" width="7" height="6" rx="3" />
      </g>

      {/* La T. El travesaño se enrolla a la derecha; el asta baja y apoya en
          un pie curvo, que es lo que le da el gesto de avance. */}
      <path
        fill={`url(#${ID_ROJO})`}
        d="M18 8h34c4.4 0 8 2.7 8 6.6 0 3.9-3.6 6.4-8 6.4h-2.6l-9.6 30.2C38.6 55.3 35.4 58 31.4 58c-4.8 0-8-3.4-6.6-8l10.6-33H18c-3.4 0-6-2-6-4.9C12 9.9 14.6 8 18 8Z"
      />

      {/* La bolsa, apoyada a la derecha del asta. */}
      <path
        fill="none"
        stroke="var(--color-marca-fuerte)"
        strokeWidth="3.4"
        strokeLinecap="round"
        d="M44 30v-4.5a4.5 4.5 0 0 1 9 0V30"
      />
      <path
        fill={`url(#${ID_ROJO})`}
        d="M41 30h15a2 2 0 0 1 2 2.2l-2 20A3 3 0 0 1 53 55H44a3 3 0 0 1-3-2.8l-2-20A2 2 0 0 1 41 30Z"
      />

      {/* El tenedor. Crema y no blanco puro: sobre el rojo, el blanco puro
          vibra; el crema se asienta. */}
      <g stroke="#fdf4ee" strokeWidth="2.1" strokeLinecap="round" fill="none">
        <path d="M45 35v5M48.5 35v5M52 35v5" />
        <path d="M48.5 40v10" strokeWidth="2.6" />
      </g>
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
            Pide · Recoge · Disfruta
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
    <div className={`relative overflow-hidden bg-[#171717] ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,.055) 0 1px, transparent 1px 68px)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(201,21,37,.42) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  );
}
