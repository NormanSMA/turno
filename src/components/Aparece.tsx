"use client";

import { m } from "motion/react";

// Entrada con resorte corto para bloques que aparecen dentro de una pantalla.
// Solo transform y opacity: no mueve el layout, así que el CLS sigue en 0.
export function Aparece({
  children,
  className,
  retraso = 0,
}: {
  children: React.ReactNode;
  className?: string;
  retraso?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32, delay: retraso }}
    >
      {children}
    </m.div>
  );
}
