import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth-motor";

/**
 * Punto de entrada de Better Auth (ADR-24). Hoy sirve el acceso con Google:
 * `/api/auth/ba/sign-in/social` y `/api/auth/ba/callback/google`.
 * El resto del acceso pasa por las rutas propias de `/api/auth/*`.
 */
export const { GET, POST } = toNextJsHandler(auth);
