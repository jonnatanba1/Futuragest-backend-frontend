import { describe, expect, it } from 'vitest';
import { navItemsForRole } from './nav-config';

describe('inventory navigation isolation', () => {
  it('limits COMPRAS to the inventory domain', () => {
    expect(navItemsForRole('COMPRAS').map((item) => item.path)).toEqual(['/inventario']);
  });

  it('keeps inventory visible to its explicit operational roles', () => {
    expect(navItemsForRole('SUPERVISOR').map((item) => item.path)).toEqual(['/inventario']);
    expect(navItemsForRole('COORDINADOR').map((item) => item.path)).toContain('/inventario');
  });

  it('does not expose inventory to unrelated office roles', () => {
    expect(navItemsForRole('TALENTO_HUMANO').map((item) => item.path)).not.toContain('/inventario');
    expect(navItemsForRole('LIDER_OPERATIVO').map((item) => item.path)).not.toContain('/inventario');
  });
});
