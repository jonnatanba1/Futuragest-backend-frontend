import { Prisma } from '@prisma/client';

export interface ShipmentReceiptTotals {
  quantityBase: Prisma.Decimal;
  receivedBase: Prisma.Decimal;
  damagedBase: Prisma.Decimal;
  lostBase: Prisma.Decimal;
}

export type ShipmentReceiptStatus =
  | 'DISCREPANCY_REVIEW'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED';

/**
 * Zero is not a discrepancy. Decimal#isPositive treats zero as positive, so
 * every check here must use a strict greater-than comparison.
 */
export function determineShipmentReceiptStatus(
  items: readonly ShipmentReceiptTotals[],
): ShipmentReceiptStatus {
  const hasDiscrepancy = items.some(
    (item) => item.damagedBase.gt(0) || item.lostBase.gt(0),
  );
  if (hasDiscrepancy) return 'DISCREPANCY_REVIEW';

  const fullyAccounted = items.every((item) =>
    item.receivedBase
      .plus(item.damagedBase)
      .plus(item.lostBase)
      .equals(item.quantityBase),
  );
  return fullyAccounted ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
}
