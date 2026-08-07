import { Prisma } from '@prisma/client';
import { determineShipmentReceiptStatus } from './shipment-receipt-status';

function item(
  quantity: string,
  received: string,
  damaged = '0',
  lost = '0',
) {
  return {
    quantityBase: new Prisma.Decimal(quantity),
    receivedBase: new Prisma.Decimal(received),
    damagedBase: new Prisma.Decimal(damaged),
    lostBase: new Prisma.Decimal(lost),
  };
}

describe('determineShipmentReceiptStatus', () => {
  it('marks a full receipt with zero damage and loss as received', () => {
    expect(determineShipmentReceiptStatus([item('10', '10')])).toBe('RECEIVED');
  });

  it('keeps incomplete receipts open without fabricating a discrepancy', () => {
    expect(determineShipmentReceiptStatus([item('10', '4')])).toBe(
      'PARTIALLY_RECEIVED',
    );
  });

  it('requires review only when a strict positive damage or loss exists', () => {
    expect(determineShipmentReceiptStatus([item('10', '9', '1')])).toBe(
      'DISCREPANCY_REVIEW',
    );
  });
});
