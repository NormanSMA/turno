"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * TanStack Query (ADR-23). Reemplaza al sondeo manual: la caché evita pedir lo
 * mismo dos veces y `refetchInterval` se pausa solo con la pestaña oculta
 * (`refetchIntervalInBackground` queda en false), igual que `useSondeo`.
 *
 * Valores por defecto pensados para una cocina con datos que cambian cada pocos
 * segundos: sin reintentos infinitos y sin recargar al volver a enfocar la
 * ventana si el dato es reciente.
 */
export function ConsultasProveedor({ children }: { children: React.ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
