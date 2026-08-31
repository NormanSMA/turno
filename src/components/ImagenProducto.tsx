import Image from "next/image";

/**
 * Imagen de producto con respaldo dibujado.
 *
 * Un comercio del campus no va a tener foto de todo, y un hueco gris con un
 * icono de "imagen rota" se ve peor que no tener foto. Cuando falta la imagen se
 * dibuja un mosaico derivado del NOMBRE del producto: siempre el mismo patrón
 * para el mismo plato, distinto entre platos. Así el catálogo se ve compuesto
 * incluso vacío, y el usuario puede reconocer un producto por su mancha de color
 * antes de leer el texto.
 */

/*
 * Pares (trazo, fondo) para el mosaico de respaldo.
 *
 * NINGUNO es el rojo de marca, y es deliberado: el mosaico rellena un hueco, no
 * señala una acción. Si usara el color de marca competiría con los botones
 * primarios de la misma pantalla y el catálogo entero se leería como un tablero
 * de avisos.
 *
 * Son literales y no tokens porque el mosaico también se imprime en los
 * carteles con QR, donde no hay hoja de estilos ni tema del sistema.
 */
const PALETA = [
  ["#2f7fc9", "#e0edfb"],
  ["#d98a1b", "#fdf0dc"],
  ["#5a52c4", "#e6e6f9"],
  ["#258a4b", "#dff0e6"],
  ["#a86a3d", "#f6e9df"],
] as const;

function semilla(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ImagenProducto({
  nombre,
  url,
  className = "",
  sizes = "(min-width: 640px) 25vw, 33vw",
  prioridad = false,
}: {
  nombre: string;
  url?: string | null;
  className?: string;
  sizes?: string;
  prioridad?: boolean;
}) {
  if (url) {
    /*
     * Las fotos que subió el comercio NO pasan por el optimizador.
     *
     * Ya vienen del navegador en WebP y con el lado mayor acotado a 1200 px —
     * exactamente lo que el optimizador haría. Dejarlas pasar sería pagar dos
     * veces el mismo trabajo, y encima en el presupuesto de CPU que el ADR-18
     * mostró que es el recurso que se agota primero.
     *
     * Las externas (Unsplash y compañía) sí se optimizan: llegan a resolución
     * completa y en formatos pesados.
     */
    const propia = url.startsWith("/api/imagenes/");
    return (
      <Image
        src={url}
        alt={nombre}
        fill
        sizes={sizes}
        priority={prioridad}
        unoptimized={propia}
        className={`object-cover ${className}`}
      />
    );
  }

  const s = semilla(nombre);
  const [fuerte, suave] = PALETA[s % PALETA.length];
  const inicial = nombre.trim().charAt(0).toUpperCase();
  const giro = (s % 4) * 90;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={nombre}
      className={`h-full w-full ${className}`}
    >
      <rect width="100" height="100" fill={suave} />
      <g transform={`rotate(${giro} 50 50)`} opacity="0.5">
        <circle cx="20" cy="80" r="42" fill={fuerte} opacity="0.18" />
        <circle cx="85" cy="18" r="26" fill={fuerte} opacity="0.14" />
      </g>
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-geist), sans-serif"
        fontSize="42"
        fontWeight="700"
        fill={fuerte}
        opacity="0.85"
      >
        {inicial}
      </text>
    </svg>
  );
}
