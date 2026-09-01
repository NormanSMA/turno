/**
 * Las carreras de grado del campus.
 *
 * ## Por qué una lista y no texto libre a secas
 *
 * El campo existía como texto libre, y eso produce datos que no se pueden
 * agrupar: "Ing. Sistemas", "ingenieria de sistemas", "Sistemas" y "ISI" son
 * cuatro filas distintas para el análisis y una sola carrera en la realidad. El
 * dato se recoge para saber en qué horarios conviene abrir más franjas, así que
 * si no se puede agrupar, no sirve para nada.
 *
 * ## Por qué se sigue pudiendo escribir
 *
 * Un desplegable cerrado es peor: esta lista sale de la página pública de la
 * universidad y **puede estar incompleta o quedar vieja**. Quien estudie algo
 * que no está —una carrera nueva, un posgrado, un intercambio— se encontraría
 * con que el sistema le dice que su carrera no existe. Eso, por un campo
 * opcional que solo sirve para planificar horarios, es un mal negocio.
 *
 * La solución es un `<datalist>`: sugiere sin obligar. Quien encuentra la suya
 * la elige y el dato queda normalizado; quien no, escribe. Y las que se
 * escriban a mano son justamente la señal de qué le falta a esta lista.
 *
 * ## De dónde salen
 *
 * De la portada de `uam.edu.ni` (consultada el 2026-09-01). La página de oferta
 * académica completa devolvía 404, así que **esta lista no está verificada
 * contra una fuente oficial completa** y probablemente le falte algo. Está
 * ordenada por facultad, como la publica la universidad.
 */

export interface Carrera {
  nombre: string;
  facultad: string;
}

export const CARRERAS: readonly Carrera[] = [
  // Ciencias Administrativas y Económicas
  { nombre: "Administración de Empresas", facultad: "Ciencias Administrativas y Económicas" },
  { nombre: "Contabilidad y Finanzas", facultad: "Ciencias Administrativas y Económicas" },
  { nombre: "Economía Empresarial", facultad: "Ciencias Administrativas y Económicas" },
  { nombre: "Negocios Internacionales", facultad: "Ciencias Administrativas y Económicas" },

  // Ciencias Jurídicas, Humanidades y Relaciones Internacionales
  { nombre: "Derecho", facultad: "Ciencias Jurídicas y Relaciones Internacionales" },
  { nombre: "Diplomacia y Relaciones Internacionales", facultad: "Ciencias Jurídicas y Relaciones Internacionales" },

  // Ciencias Médicas
  { nombre: "Medicina General", facultad: "Ciencias Médicas" },
  { nombre: "Psicología", facultad: "Ciencias Médicas" },
  { nombre: "Nutrición", facultad: "Ciencias Médicas" },
  { nombre: "Odontología", facultad: "Ciencias Médicas" },

  // Ingeniería y Arquitectura
  { nombre: "Arquitectura", facultad: "Ingeniería y Arquitectura" },
  { nombre: "Ingeniería Civil", facultad: "Ingeniería y Arquitectura" },
  { nombre: "Ingeniería Industrial", facultad: "Ingeniería y Arquitectura" },
  { nombre: "Ingeniería de Sistemas", facultad: "Ingeniería y Arquitectura" },

  // Marketing, Diseño y Ciencias de la Comunicación
  { nombre: "Marketing y Publicidad", facultad: "Marketing, Diseño y Comunicación" },
  { nombre: "Diseño y Comunicación Visual", facultad: "Marketing, Diseño y Comunicación" },
  { nombre: "Comunicación y Relaciones Públicas", facultad: "Marketing, Diseño y Comunicación" },

  // UAM College
  { nombre: "Major in Global Management", facultad: "UAM College" },
  { nombre: "Major in Global Finance", facultad: "UAM College" },
  { nombre: "Major in Strategic Marketing", facultad: "UAM College" },
  { nombre: "Major in International Development", facultad: "UAM College" },
];

/** Solo los nombres, en el orden en que se publican. */
export const NOMBRES_CARRERAS: readonly string[] = CARRERAS.map((c) => c.nombre);

/**
 * Normaliza para comparar: sin tildes, sin mayúsculas, sin espacios de más.
 *
 * "Ingeniería de Sistemas", "ingenieria de sistemas" e "INGENIERIA DE SISTEMAS"
 * tienen que contar como la misma carrera al analizar los datos del piloto.
 */
export function normalizarCarrera(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Devuelve la carrera del catálogo que corresponde a lo que se escribió, o
 * `null` si no coincide con ninguna.
 *
 * Existe para el análisis, no para validar: nadie rechaza un texto porque no
 * esté acá. Lo que permite es contar cuántos escribieron una carrera conocida
 * —aunque la hayan tecleado distinto— y cuántos escribieron otra cosa, que es
 * la señal de qué le falta al catálogo.
 */
export function reconocerCarrera(texto: string | null): Carrera | null {
  if (!texto) return null;
  const q = normalizarCarrera(texto);
  return CARRERAS.find((c) => normalizarCarrera(c.nombre) === q) ?? null;
}
