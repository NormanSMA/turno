/**
 * TURNO — Contraseñas para cuentas de operación (§11, ADR-08).
 *
 * El enlace mágico es correcto para el ESTUDIANTE: entra una vez por semestre,
 * desde su teléfono, con su buzón a mano. Para las cuentas de operación no lo es:
 *
 *   - La pantalla de cocina es COMPARTIDA. Pedir un enlace al buzón personal de
 *     alguien para desbloquear la caja registradora del turno es inviable en
 *     hora pico, y termina en que una persona deja su sesión abierta para todos.
 *   - La cuenta de administración necesita acceso DETERMINISTA: si el correo se
 *     demora o el proveedor falla justo durante la defensa, no hay panel.
 *
 * Son pocas cuentas, creadas a mano por el equipo, sin auto-registro. Eso hace
 * que la superficie de ataque de las contraseñas sea acotada y auditable.
 *
 * Derivación: scrypt de la biblioteca estándar de Node. Es memoria-dura (resiste
 * ataque por GPU) y no agrega una dependencia externa al proyecto. Elegirlo en
 * vez de bcrypt/argon2 es una decisión de reducción de superficie, no de pereza:
 * una dependencia menos es una cadena de suministro menos que auditar.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derivar = promisify(scrypt) as (
  clave: string,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Parámetros de coste. Se versionan en el propio hash para poder subirlos
 *  después sin invalidar las contraseñas existentes. */
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const LARGO_CLAVE = 32;
const LARGO_SAL = 16;

/** Mínimo para cuentas de operación. Más largo que el típico de 8: son cuentas
 *  con poder sobre datos del piloto y no las escribe nadie a diario. */
export const LARGO_MINIMO = 12;

export interface ValidacionPassword {
  valida: boolean;
  motivo?: string;
}

export function validarPassword(password: string): ValidacionPassword {
  if (password.length < LARGO_MINIMO) {
    return {
      valida: false,
      motivo: `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres`,
    };
  }
  if (password.length > 200) {
    // Cota superior: sin ella, una cadena enorme convierte el login en un
    // ataque de denegación por consumo de memoria contra el propio servidor.
    return { valida: false, motivo: "La contraseña es demasiado larga" };
  }
  if (/^\s|\s$/.test(password)) {
    return {
      valida: false,
      motivo: "La contraseña no puede empezar ni terminar con espacios",
    };
  }
  return { valida: true };
}

/**
 * Devuelve `scrypt$N$r$p$sal$hash`, todo en base64url.
 * El formato incluye los parámetros para que un hash viejo se siga verificando
 * aunque se suba el coste más adelante.
 */
export async function hashPassword(password: string): Promise<string> {
  const v = validarPassword(password);
  if (!v.valida) throw new Error(v.motivo);

  const sal = randomBytes(LARGO_SAL);
  const clave = await derivar(password.normalize("NFKC"), sal, LARGO_CLAVE, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    sal.toString("base64url"),
    clave.toString("base64url"),
  ].join("$");
}

/**
 * Verifica en tiempo constante. Nunca lanza por un hash malformado: devuelve
 * false, para que un registro corrupto no se distinga de una contraseña mala.
 */
export async function verificarPassword(
  password: string,
  hashGuardado: string | null | undefined,
): Promise<boolean> {
  if (!hashGuardado) return false;
  const partes = hashGuardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  let sal: Buffer;
  let esperado: Buffer;
  try {
    sal = Buffer.from(partes[4], "base64url");
    esperado = Buffer.from(partes[5], "base64url");
  } catch {
    return false;
  }
  if (sal.length === 0 || esperado.length === 0) return false;

  try {
    const clave = await derivar(password.normalize("NFKC"), sal, esperado.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
    return timingSafeEqual(clave, esperado);
  } catch {
    return false;
  }
}

/**
 * Contraseña inicial legible para entregar a un operador.
 * Sin caracteres ambiguos: se dicta en voz alta en un mostrador ruidoso.
 */
export function passwordSugerida(): string {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  let s = "";
  for (const b of bytes) s += abc[b % abc.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12);
}

/** Roles que entran con contraseña en vez de enlace mágico. */
export const ROLES_CON_PASSWORD = ["COMERCIO", "ADMIN"] as const;

export function usaPassword(rol: string): boolean {
  return (ROLES_CON_PASSWORD as readonly string[]).includes(rol);
}
