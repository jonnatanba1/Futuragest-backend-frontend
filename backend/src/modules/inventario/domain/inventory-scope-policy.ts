import type { ScopeContext } from '../../auth/domain/scope-context';

export type InventoryScopedModel =
  | 'Product'
  | 'ProductUnitVersion'
  | 'InventoryLocation'
  | 'InventoryLocationAssignment'
  | 'InventoryCommand'
  | 'InventoryMovement'
  | 'InventoryBalance'
  | 'StockMinimum';

const DENY = { id: { in: [] as string[] } } as const;
const INVENTORY_GLOBAL_ROLES = new Set(['SYSTEM_ADMIN', 'COMPRAS', 'GERENCIA']);
const CATALOG_MODELS = new Set<InventoryScopedModel>(['Product', 'ProductUnitVersion']);

function and(base: object, scope: object): object {
  return { AND: [base, scope] };
}

/**
 * Fail-closed inventory scope policy.
 *
 * This is deliberately separate from the shared IAM scope filter. COMPRAS is
 * global only inside inventory and must never inherit access to other domains.
 */
export function applyInventoryScope(
  ctx: ScopeContext,
  model: InventoryScopedModel,
  where: object = {},
  now: Date = new Date(),
): object {
  if (INVENTORY_GLOBAL_ROLES.has(ctx.role)) return where;

  if (CATALOG_MODELS.has(model)) {
    return ctx.role === 'COORDINADOR' || ctx.role === 'SUPERVISOR' ? where : and(where, DENY);
  }

  if (ctx.role === 'COORDINADOR') {
    if (!ctx.zoneId) return and(where, DENY);

    switch (model) {
      case 'InventoryLocation':
        return and(where, { zoneId: ctx.zoneId });
      case 'InventoryLocationAssignment':
      case 'InventoryBalance':
      case 'StockMinimum':
      case 'InventoryMovement':
        return and(where, { location: { zoneId: ctx.zoneId } });
      case 'InventoryCommand':
        return and(where, { zoneId: ctx.zoneId });
      default:
        return and(where, DENY);
    }
  }

  if (ctx.role === 'SUPERVISOR') {
    if (!ctx.userId || !ctx.supervisorId) return and(where, DENY);

    const activeAssignment = {
      assignments: {
        some: {
          userId: ctx.userId,
          supervisorId: ctx.supervisorId,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
      },
    };

    switch (model) {
      case 'InventoryLocation':
        return and(where, activeAssignment);
      case 'InventoryLocationAssignment':
        return and(where, { userId: ctx.userId, supervisorId: ctx.supervisorId });
      case 'InventoryBalance':
      case 'StockMinimum':
      case 'InventoryMovement':
        return and(where, { location: activeAssignment });
      case 'InventoryCommand':
        return and(where, { actorUserId: ctx.userId });
      default:
        return and(where, DENY);
    }
  }

  return and(where, DENY);
}
