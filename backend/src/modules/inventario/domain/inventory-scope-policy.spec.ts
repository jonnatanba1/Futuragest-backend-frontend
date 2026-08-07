import type { ScopeContext } from '../../auth/domain/scope-context';
import { applyInventoryScope } from './inventory-scope-policy';

const NOW = new Date('2026-08-07T00:00:00.000Z');
const BASE = { active: true };

function context(overrides: Partial<ScopeContext>): ScopeContext {
  return { userId: 'user-1', role: 'SUPERVISOR', ...overrides };
}

describe('applyInventoryScope', () => {
  it.each(['SYSTEM_ADMIN', 'COMPRAS', 'GERENCIA'] as const)(
    '%s has global inventory visibility only through this policy',
    (role) => {
      expect(applyInventoryScope(context({ role }), 'InventoryBalance', BASE, NOW)).toBe(BASE);
    },
  );

  it('allows supervisors to read the global catalog', () => {
    expect(applyInventoryScope(context({}), 'Product', BASE, NOW)).toBe(BASE);
  });

  it('scopes a coordinator balance query to their zone', () => {
    expect(
      applyInventoryScope(
        context({ role: 'COORDINADOR', zoneId: 'zone-1' }),
        'InventoryBalance',
        BASE,
        NOW,
      ),
    ).toEqual({ AND: [BASE, { location: { zoneId: 'zone-1', inventoryEnabled: true } }] });
  });

  it('fails closed when a coordinator has no zone', () => {
    expect(
      applyInventoryScope(
        context({ role: 'COORDINADOR', zoneId: undefined }),
        'InventoryCommand',
        BASE,
        NOW,
      ),
    ).toEqual({ AND: [BASE, { id: { in: [] } }] });
  });

  it('scopes supervisor balances through an active location assignment', () => {
    expect(
      applyInventoryScope(context({ supervisorId: 'sup-1' }), 'InventoryBalance', BASE, NOW),
    ).toEqual({
      AND: [
        BASE,
        {
          location: {
            inventoryEnabled: true,
            assignments: {
              some: {
                userId: 'user-1',
                supervisorId: 'sup-1',
                validFrom: { lte: NOW },
                OR: [{ validUntil: null }, { validUntil: { gt: NOW } }],
              },
            },
          },
        },
      ],
    });
  });

  it('scopes coordinator shipments when either endpoint belongs to their zone', () => {
    expect(
      applyInventoryScope(
        context({ role: 'COORDINADOR', zoneId: 'zone-1' }),
        'Shipment',
        BASE,
        NOW,
      ),
    ).toEqual({
      AND: [
        BASE,
        {
          OR: [
            { originLocation: { zoneId: 'zone-1', inventoryEnabled: true } },
            { destinationLocation: { zoneId: 'zone-1', inventoryEnabled: true } },
          ],
        },
      ],
    });
  });

  it('shows a supervisor only shipments explicitly assigned for receipt', () => {
    expect(
      applyInventoryScope(context({ supervisorId: 'sup-1' }), 'Shipment', BASE, NOW),
    ).toEqual({ AND: [BASE, { receiverUserId: 'user-1' }] });
  });

  it('scopes supervisor counts through an active location assignment', () => {
    expect(
      applyInventoryScope(context({ supervisorId: 'sup-1' }), 'InventoryCount', BASE, NOW),
    ).toEqual({
      AND: [
        BASE,
        {
          location: {
            inventoryEnabled: true,
            assignments: {
              some: {
                userId: 'user-1',
                supervisorId: 'sup-1',
                validFrom: { lte: NOW },
                OR: [{ validUntil: null }, { validUntil: { gt: NOW } }],
              },
            },
          },
        },
      ],
    });
  });

  it.each(['TALENTO_HUMANO', 'LIDER_OPERATIVO'] as const)('denies %s in inventory', (role) => {
    expect(applyInventoryScope(context({ role }), 'Product', BASE, NOW)).toEqual({
      AND: [BASE, { id: { in: [] } }],
    });
  });
});
