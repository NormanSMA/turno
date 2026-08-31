"use client";

/**
 * Un número que cuenta hasta su valor.
 *
 * Por qué en el panel de métricas y no en toda la web: en la cocina y en el
 * pedido, los números son operativos — "en 7 min", "3 pedidos" — y un número
 * que se mueve mientras alguien lo lee con prisa es un estorbo. En el panel,
 * en cambio, las cifras son el resultado del piloto y se leen sentado; el
 * conteo hace dos cosas útiles: marca que el dato terminó de cargar, y da
 * magnitud — 758 tarda perceptiblemente más en llegar que 37.
 *
 * Cuenta una sola vez, cuando el valor entra a la vista. Un panel con doce
 * indicadores que cuentan todos a la vez al montar es ruido; uno que cuenta al
 * llegar acompaña la lectura.
 */

import { useEffect, useRef, useState } from "react";
import { prefiereMenosMovimiento, suavizado } from "@/lib/movimiento";

export function NumeroAnimado({
  valor,
  decimales = 0,
  sufijo = "",
  duracion = 900,
  className,
}: {
  valor: number;
  decimales?: number;
  sufijo?: string;
  duracion?: number;
  className?: string;
}) {
  // Arranca en el valor final. Así el HTML del servidor ya trae la cifra
  // correcta: si el JavaScript nunca llega, o llega tarde, lo que se ve es el
  // dato — no un cero que miente.
  const [mostrado, setMostrado] = useState(valor);
  const nodo = useRef<HTMLSpanElement>(null);
  const yaContó = useRef(false);

  useEffect(() => {
    const el = nodo.current;
    if (!el || yaContó.current) return;
    if (prefiereMenosMovimiento() || !("IntersectionObserver" in window)) return;

    let cuadro = 0;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting || yaContó.current) return;
        yaContó.current = true;
        observador.disconnect();

        const inicio = performance.now();
        const paso = (ahora: number) => {
          const t = Math.min(1, (ahora - inicio) / duracion);
          setMostrado(valor * suavizado(t));
          if (t < 1) cuadro = requestAnimationFrame(paso);
        };
        cuadro = requestAnimationFrame(paso);
      },
      { threshold: 0.4 },
    );

    observador.observe(el);
    return () => {
      observador.disconnect();
      cancelAnimationFrame(cuadro);
    };
  }, [valor, duracion]);

  // El valor final se anuncia entero al lector de pantalla; los pasos
  // intermedios son ruido para quien escucha, así que van con aria-hidden.
  return (
    <span ref={nodo} className={className}>
      <span aria-hidden>
        {mostrado.toLocaleString("es-NI", {
          minimumFractionDigits: decimales,
          maximumFractionDigits: decimales,
        })}
        {sufijo}
      </span>
      <span className="sr-only">
        {valor.toLocaleString("es-NI", {
          minimumFractionDigits: decimales,
          maximumFractionDigits: decimales,
        })}
        {sufijo}
      </span>
    </span>
  );
}
