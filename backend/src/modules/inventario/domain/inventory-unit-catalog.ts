import { InventoryOperationError } from './inventory-operations';

export const INVENTORY_UNIT_CODES = [
  'UND', 'BOLSA', 'CAJA', 'BULTO', 'PAQUETE', 'ROLLO', 'CANASTILLA', 'PAR', 'KG', 'G', 'L', 'ML', 'M',
] as const;

export type InventoryUnitCode = (typeof INVENTORY_UNIT_CODES)[number];

export function normalizeInventoryUnitCode(value: string): InventoryUnitCode {
  const code = value.trim().toUpperCase();
  if (!(INVENTORY_UNIT_CODES as readonly string[]).includes(code)) {
    throw new InventoryOperationError('INVALID_UNIT_CODE', 'Unit code must be selected from the inventory catalog.');
  }
  return code as InventoryUnitCode;
}
