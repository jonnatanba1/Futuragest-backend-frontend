export const INVENTORY_UNIT_OPTIONS = [
  { value: 'UND', label: 'Unidad' },
  { value: 'BOLSA', label: 'Bolsa' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'BULTO', label: 'Bulto' },
  { value: 'PAQUETE', label: 'Paquete' },
  { value: 'ROLLO', label: 'Rollo' },
  { value: 'CANASTILLA', label: 'Canastilla' },
  { value: 'PAR', label: 'Par' },
  { value: 'KG', label: 'Kilogramo (kg)' },
  { value: 'G', label: 'Gramo (g)' },
  { value: 'L', label: 'Litro (L)' },
  { value: 'ML', label: 'Mililitro (ml)' },
  { value: 'M', label: 'Metro (m)' },
] as const;
const AUTOMATIC_MEASUREMENT_CONVERSIONS: Record<string, { dimension: string; baseScale: number }> = {
  G: { dimension: 'mass', baseScale: 1 },
  KG: { dimension: 'mass', baseScale: 1000 },
  ML: { dimension: 'volume', baseScale: 1 },
  L: { dimension: 'volume', baseScale: 1000 },
};

export function automaticFactorToBase(baseUnitCode: string, unitCode: string): string | null {
  const baseUnit = AUTOMATIC_MEASUREMENT_CONVERSIONS[baseUnitCode];
  const unit = AUTOMATIC_MEASUREMENT_CONVERSIONS[unitCode];
  if (!baseUnit || !unit || baseUnit.dimension !== unit.dimension) return null;
  return String(unit.baseScale / baseUnit.baseScale);
}
