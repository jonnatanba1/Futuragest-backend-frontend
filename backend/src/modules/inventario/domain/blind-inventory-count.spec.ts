import { redactOpenInventoryCount } from './blind-inventory-count';

describe('redactOpenInventoryCount', () => {
  const count = {
    id: 'count-1',
    status: 'OPEN',
    lines: [
      {
        id: 'line-1',
        productId: 'product-1',
        countedBase: '3',
        expectedBase: '10',
        differenceBase: '-7',
      },
    ],
  };

  it('removes expected and difference quantities while a count is open', () => {
    expect(redactOpenInventoryCount(count)).toEqual({
      id: 'count-1',
      status: 'OPEN',
      lines: [{ id: 'line-1', productId: 'product-1', countedBase: '3' }],
    });
  });

  it('reveals the immutable snapshot after submission', () => {
    const submitted = { ...count, status: 'SUBMITTED' };
    expect(redactOpenInventoryCount(submitted)).toBe(submitted);
  });
});
