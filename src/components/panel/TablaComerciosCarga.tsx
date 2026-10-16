"use client";

/** Envoltorio con carga diferida: TanStack Table no entra al bundle inicial. */

import dynamic from "next/dynamic";
import { Esqueleto } from "@/components/estados-ui";

export const TablaComerciosCarga = dynamic(
  () => import("@/components/panel/TablaComercios"),
  { ssr: false, loading: () => <Esqueleto className="h-40 w-full" /> },
);
