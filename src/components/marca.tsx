import Image from "next/image";

/**
 * Marca de TURNO.
 *
 * El isotipo es la T convertida en bolsa de comida en movimiento: el travesaño
 * se enrolla como una hoja, la bolsa con el tenedor se apoya a la derecha y
 * tres líneas de velocidad entran por la izquierda.
 *
 * ## Por qué dejó de ser un SVG dibujado a mano
 *
 * Lo estaba, por peso, herencia de color y escala. El problema es que había
 * **tres versiones distintas del mismo logo**: este trazo, otro en
 * `icono-marca.ts` para el favicon, y la ilustración del correo. Ninguna
 * coincidía con las otras, así que la marca se veía diferente según dónde se
 * mirara — que es justo lo que una marca no puede hacer.
 *
 * El PNG resuelve eso: **un solo archivo es la marca**, y el favicon, la
 * cabecera y el correo salen todos de él. Se paga con ~9 KB, que `next/image`
 * sirve como WebP y el navegador cachea. La consistencia vale más.
 *
 * ## Sobre el color en modo oscuro
 *
 * El SVG heredaba los tokens y se aclaraba solo; este no. No hace falta: el
 * rojo del isotipo es luminoso y el fondo oscuro es #101010, así que el
 * contraste sobra en los dos temas.
 */

/**
 * Proporción real del archivo, medida sobre el PNG ya recortado.
 *
 * Está en una constante y no incrustada en el JSX para que sea un solo punto
 * de corrección: si alguien reemplaza el archivo por uno de otra forma, el
 * logo se deforma en cinco pantallas a la vez y este número es lo único que
 * hay que tocar.
 */
const PROPORCION = 148 / 120;

/**
 * `size` es la **altura**, no el lado.
 *
 * El isotipo es apaisado. Si `size` fuese el ancho, el logo encogería al
 * ponerlo junto a texto de la misma altura nominal y quedaría descuadrado
 * contra la palabra en `LogotipoTurno`.
 */
export function MarcaTurno({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/marca/isotipo.png"
      alt="TURNO"
      width={Math.round(size * PROPORCION)}
      height={size}
      className={`shrink-0 ${className}`}
      priority
    />
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
