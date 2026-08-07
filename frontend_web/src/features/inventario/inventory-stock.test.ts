import { availableProductIdsAtLocation, stockByProduct } from './inventory-stock';
import type { InventoryBalance } from './inventory.types';

const balance = (productId: string, quantityBase: string, type = 'CENTRAL_WAREHOUSE'): InventoryBalance => ({
  id: productId + quantityBase,
  locationId: type === 'CENTRAL_WAREHOUSE' ? 'central' : 'municipal',
  productId,
  quantityBase,
  version: 1,
  updatedAt: '2026-08-07T00:00:00.000Z',
  location: { id: type, code: type, name: type, type: type as InventoryBalance['location']['type'], zoneId: null, municipioId: null, active: true, inventoryEnabled: true },
  product: { id: productId, sku: productId, name: productId, baseUnitCode: 'UND', active: true, deactivatedAt: null, updatedAt: '', unitVersions: [] },
});

describe('inventory stock helpers', () => {
  it('aggregates central stock by product', () => {
    expect(stockByProduct([balance('a', '3'), balance('a', '2'), balance('b', '5', 'MUNICIPAL_WAREHOUSE')], 'CENTRAL_WAREHOUSE')).toEqual({ a: 5 });
  });

  it('excludes zero stock products from a selected origin', () => {
    expect([...availableProductIdsAtLocation([balance('a', '0'), balance('b', '1')], 'central')]).toEqual(['b']);
  });
});
