import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearInventoryCommandId, stableInventoryCommandId } from './inventory-command-id';

describe('inventory command id', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333');
  });

  it('reuses the UUID while retrying the same operation payload', () => {
    const first = stableInventoryCommandId('receipt:shipment-1', { received: '4' });
    const retry = stableInventoryCommandId('receipt:shipment-1', { received: '4' });
    expect(retry).toBe(first);
  });

  it('rotates the UUID when the payload changes or the operation succeeds', () => {
    const first = stableInventoryCommandId('receipt:shipment-1', { received: '4' });
    const changed = stableInventoryCommandId('receipt:shipment-1', { received: '5' });
    clearInventoryCommandId('receipt:shipment-1');
    const completed = stableInventoryCommandId('receipt:shipment-1', { received: '5' });
    expect(changed).not.toBe(first);
    expect(completed).not.toBe(changed);
  });
});
