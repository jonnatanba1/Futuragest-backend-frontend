import type { InventoryBalance } from './inventory.types';

export function stockByProduct(balances: InventoryBalance[], locationType?: string) {
  return balances.reduce<Record<string, number>>((totals, balance) => {
    if (!locationType || balance.location.type === locationType) {
      totals[balance.productId] = (totals[balance.productId] ?? 0) + Number(balance.quantityBase);
    }
    return totals;
  }, {});
}

export function availableProductIdsAtLocation(balances: InventoryBalance[], locationId: string) {
  return new Set(
    balances
      .filter((balance) => balance.locationId === locationId && Number(balance.quantityBase) > 0)
      .map((balance) => balance.productId),
  );
}
