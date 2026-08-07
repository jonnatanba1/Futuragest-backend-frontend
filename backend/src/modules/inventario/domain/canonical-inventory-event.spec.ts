import {
  canonicalInventoryPayload,
  hashInventoryPayload,
  normalizeInventoryDecimal,
} from './canonical-inventory-event';
import type { MobileInventoryEvent } from './inventory-command';

const EVENT: MobileInventoryEvent = {
  clientEventId: '16d047b6-49e4-4a53-9e23-e579cb193463',
  schemaVersion: 1,
  type: 'FIELD_ISSUE',
  assignmentId: 'ac0b3734-c4a3-4a31-bfcc-1b6664d249c3',
  productId: 'ef3fed38-a78d-49d9-9ddb-bdfde70dc663',
  unitVersionId: '3513bc6e-d257-485a-977c-dad3533c7ac5',
  quantity: '10.500000',
  capturedAtUtc: '2026-08-07T01:00:00-05:00',
  capturedOffsetMin: -300,
  verificationMethod: 'BIOMETRIC',
  latitude: 8.75,
  longitude: -75.88,
  accuracyMeters: 8,
};

describe('canonical inventory event', () => {
  it.each([
    ['10.500000', '10.5'],
    ['10.000000', '10'],
    ['0.125000', '0.125'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeInventoryDecimal(input)).toBe(expected);
  });

  it.each(['0', '-1', '01', '1.0000001', '1e3', 'NaN'])(
    'rejects non-canonical or unsafe quantity %s',
    (input) => expect(() => normalizeInventoryDecimal(input)).toThrow(),
  );

  it('produces the same hash for equivalent decimal and timestamp forms', () => {
    const first = canonicalInventoryPayload(EVENT);
    const second = canonicalInventoryPayload({
      ...EVENT,
      quantity: '10.5',
      capturedAtUtc: '2026-08-07T06:00:00.000Z',
    });
    expect(hashInventoryPayload(first)).toBe(hashInventoryPayload(second));
  });

  it('changes the hash when a stock-affecting field changes', () => {
    const first = canonicalInventoryPayload(EVENT);
    const second = canonicalInventoryPayload({ ...EVENT, quantity: '10.6' });
    expect(hashInventoryPayload(first)).not.toBe(hashInventoryPayload(second));
  });

  it('includes a trimmed operational justification in the immutable payload', () => {
    expect(canonicalInventoryPayload({ ...EVENT, reason: '  Material sin usar  ' })).toMatchObject({
      reason: 'Material sin usar',
    });
  });
});
