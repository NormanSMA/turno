/**
 * Generación de franjas — Δ y C(f) (§6.1).
 *
 * C(f) = personal de cocina × Δ, en minutos-cocina. Es una capacidad OBSERVADA,
 * no declarada: la fase 1 de calibración (§14.1) mide el throughput sostenido y
 * corrige este valor. El factor α se aplica después, en la regla de admisión, no
 * acá: se separa la capacidad física de la política de holgura para poder
 * recalibrar α a mitad del piloto sin regenerar las franjas.
 */

export interface EspecFranjas {
  inicio: Date;
  fin: Date;
  /** Δ — ancho de franja en minutos (variable experimental) */
  anchoMin: number;
  personalCocina: number;
  /** Override explícito de C(f) cuando se midió throughput real. */
  capacidadMinutosPorFranja?: number;
}

export interface FranjaGenerada {
  inicio: Date;
  fin: Date;
  capacidadMinutos: number;
}

export function generarFranjas(spec: EspecFranjas): FranjaGenerada[] {
  const { inicio, fin, anchoMin, personalCocina } = spec;
  if (anchoMin <= 0) throw new Error("El ancho de franja debe ser positivo");
  if (personalCocina <= 0) throw new Error("El personal de cocina debe ser positivo");
  if (fin <= inicio) throw new Error("La ventana de servicio está invertida");

  const capacidad =
    spec.capacidadMinutosPorFranja ?? personalCocina * anchoMin;

  const franjas: FranjaGenerada[] = [];
  const paso = anchoMin * 60_000;
  for (let t = inicio.getTime(); t + paso <= fin.getTime(); t += paso) {
    franjas.push({
      inicio: new Date(t),
      fin: new Date(t + paso),
      capacidadMinutos: capacidad,
    });
  }
  return franjas;
}
