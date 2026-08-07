import { InventoryOperationError } from './inventory-operations';
import { normalizeInventoryUnitCode } from './inventory-unit-catalog';

describe('inventory unit catalog', () => {
  it('normalizes a unit selected from the standard catalog', () => {
    expect(normalizeInventoryUnitCode(' caja ')).toBe('CAJA');
  });

  it('rejects arbitrary unit codes', () => {
    expect(() => normalizeInventoryUnitCode('PALLET')).toThrow(InventoryOperationError);
  });
});
