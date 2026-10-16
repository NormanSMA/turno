/**
 * Motor de sesiones y OAuth: Better Auth (ADR-24).
 *
 * Detrás de la fachada de `src/lib/auth.ts`: ningún otro archivo importa esto.
 * Better Auth guarda las sesiones y el vínculo con Google. Lo demás sigue en el
 * código propio, con sus pruebas:
 *
 *   - El enlace mágico vive en `token_acceso`. El plugin `magicLink` borra el
 *     token al canjearlo y se perdería la distinción "ya usado" frente a
 *     "inexistente", y la prueba de concurrencia (dos clics, una sesión).
 *   - La contraseña de las cuentas de operación sigue en `usuario.passwordHash`
 *     (scrypt, `core/credenciales.ts`). Un solo lugar, sin doble escritura.
 *
 * Consecuencia que se acepta: Better Auth guarda el token de sesión en claro en
 * `session.token`, y el motor anterior guardaba solo su hash. Mitigación: la
 * cookie está firmada y es `httpOnly`, y quien lee la base ya tiene todo lo
 * demás. Está registrado en ADR-24.
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./db";
import {
  asignarCondicion,
  DIAS_VIGENCIA_SESION,
  esCorreoInstitucional,
  normalizarCorreo,
} from "@/core/identidad";
import { usaPassword } from "@/core/credenciales";

export const COOKIE_SESION = "turno_sesion";

const enProduccion = process.env.NODE_ENV === "production";

export const googleHabilitado = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  appName: "TURNO",
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  basePath: "/api/auth/ba",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  user: {
    modelName: "usuario",
    fields: {
      email: "correo",
      name: "nombre",
      image: "imagen",
      createdAt: "creadoEn",
    },
    additionalFields: {
      rol: { type: "string", required: false, input: false },
      comercioId: { type: "string", required: false, input: false },
      condicionExperimental: { type: "string", required: false, input: false },
      esDemo: { type: "boolean", required: false, input: false },
    },
  },
  session: {
    modelName: "session",
    expiresIn: DIAS_VIGENCIA_SESION * 86_400,
    // Se renueva la vigencia como máximo una vez al día de uso.
    updateAge: 86_400,
  },
  account: {
    modelName: "account",
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  verification: { modelName: "verification" },

  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    // Nombre exacto de la cookie de siempre. Sin el prefijo `__Secure-`, que
    // Better Auth agrega por su cuenta sobre https.
    useSecureCookies: false,
    cookies: { session_token: { name: COOKIE_SESION } },
    defaultCookieAttributes: {
      secure: enProduccion,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  },

  // El límite de enlaces y pedidos es propio y persistente (`contador_limite`).
  rateLimit: { enabled: false },

  socialProviders: googleHabilitado
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          // `hd` solo admite un dominio y hay dos: se valida abajo.
          prompt: "select_account",
        },
      }
    : {},

  databaseHooks: {
    user: {
      create: {
        /**
         * Alta por Google. Solo correo institucional y verificado por Google.
         * Todo lo demás entra por enlace mágico a una cuenta `esDemo` creada
         * por el equipo, que ya existe y por eso no pasa por acá.
         */
        before: async (usuario) => {
          const correo = normalizarCorreo(usuario.email);
          if (!esCorreoInstitucional(correo) || !usuario.emailVerified) {
            throw new APIError("FORBIDDEN", {
              message: "Se requiere un correo institucional verificado",
            });
          }
          return {
            data: {
              ...usuario,
              email: correo,
              rol: "ESTUDIANTE",
              condicionExperimental: asignarCondicion(),
            },
          };
        },
      },
    },
    account: {
      create: {
        /** Google nunca se vincula a una cuenta de operación (ADR-08). */
        before: async (cuenta) => {
          if (cuenta.providerId === "credential") return;
          const usuario = await prisma.usuario.findUnique({
            where: { id: cuenta.userId },
            select: { rol: true },
          });
          if (usuario && usaPassword(usuario.rol)) {
            throw new APIError("FORBIDDEN", {
              message: "Las cuentas de operación entran con usuario y contraseña",
            });
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
