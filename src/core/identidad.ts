/**
 * TURNO — Identidad (§11).
 *
 * Enlace mágico: sin contraseñas. Elimina hash de credenciales, política de
 * complejidad, recuperación y cambio — toda una familia de vulnerabilidades que
 * no hay que defender porque no existe. Y verifica pertenencia por construcción:
 * solo quien accede al buzón institucional entra.
 *
 * Reglas de token, todas verificables:
 *   - se almacena SOLO el hash; el token en claro nunca toca la base ni un log
 *   - un solo uso: al canjearlo se marca `usadoEn` y no vuelve a servir
 *   - expiración corta (10–15 min) para el enlace, larga (60–90 d) para la sesión
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Dominios institucionales aceptados. Fuera de esto, la muestra deja de ser
 *  la población declarada en el Capítulo III. */
export const DOMINIOS_INSTITUCIONALES = ["uam.edu.ni", "uamv.edu.ni"] as const;

export const MINUTOS_VIGENCIA_ENLACE = 15;
export const DIAS_VIGENCIA_SESION = 75; // dentro del rango 60–90 de §11.3

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export function dominioDe(correo: string): string {
  return normalizarCorreo(correo).split("@")[1] ?? "";
}

export function esCorreoInstitucional(correo: string): boolean {
  const c = normalizarCorreo(correo);
  if (!RE_CORREO.test(c)) return false;
  return (DOMINIOS_INSTITUCIONALES as readonly string[]).includes(dominioDe(c));
}

/** Token opaco de 256 bits en base64url. Se devuelve en claro UNA sola vez. */
export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 sin sal, a propósito: el token tiene 256 bits de entropía aleatoria,
 * no es adivinable ni por diccionario ni por fuerza bruta. Aplicarle un KDF
 * lento (bcrypt/argon2) protegería contra un ataque que no existe y agregaría
 * latencia a cada petición autenticada.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación en tiempo constante: no filtra información por timing. */
export function tokenCoincide(token: string, hashEsperado: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hashEsperado, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function expiracionEnlace(desde = new Date()): Date {
  return new Date(desde.getTime() + MINUTOS_VIGENCIA_ENLACE * 60_000);
}

export function expiracionSesion(desde = new Date()): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA_SESION * 86_400_000);
}

/**
 * Asignación a la condición experimental (§6.4).
 *
 * Aleatoria por usuario, decidida en el SERVIDOR al momento del registro y
 * persistida. Nunca se recalcula: si dependiera del navegador, borrar cookies o
 * cambiar de teléfono movería al usuario de A a B y contaminaría el experimento.
 */
export function asignarCondicion(): "A" | "B" {
  return randomBytes(1)[0] % 2 === 0 ? "A" : "B";
}

export interface EstadoToken {
  valido: boolean;
  motivo?: "INEXISTENTE" | "EXPIRADO" | "YA_USADO";
}

export function evaluarToken(
  registro: { expiraEn: Date; usadoEn: Date | null } | null,
  ahora = new Date(),
): EstadoToken {
  if (!registro) return { valido: false, motivo: "INEXISTENTE" };
  if (registro.usadoEn) return { valido: false, motivo: "YA_USADO" };
  if (registro.expiraEn <= ahora) return { valido: false, motivo: "EXPIRADO" };
  return { valido: true };
}

export function evaluarSesion(
  registro: { expiraEn: Date; revocadaEn: Date | null } | null,
  ahora = new Date(),
): EstadoToken {
  if (!registro) return { valido: false, motivo: "INEXISTENTE" };
  if (registro.revocadaEn) return { valido: false, motivo: "YA_USADO" };
  if (registro.expiraEn <= ahora) return { valido: false, motivo: "EXPIRADO" };
  return { valido: true };
}
