import { InventoryOperationError } from './inventory-operations';
import {
  assertAssignmentMatchesLocation,
  assertLocationCanBeCreatedManually,
} from './inventory-location-policy';

describe('inventory location policy', () => {
  it('prevents manual municipal warehouse creation', () => {
    expect(() => assertLocationCanBeCreatedManually('MUNICIPAL_WAREHOUSE')).toThrow(
      InventoryOperationError,
    );
    expect(() => assertLocationCanBeCreatedManually('CENTRAL_WAREHOUSE')).not.toThrow();
  });

  it('accepts an existing supervisor from the same municipality and zone', () => {
    expect(() =>
      assertAssignmentMatchesLocation(
        { type: 'MUNICIPAL_WAREHOUSE', municipioId: 'm-1', zoneId: 'z-1' },
        { userId: 'u-1', supervisorId: 's-1' },
        { id: 's-1', userId: 'u-1', municipioId: 'm-1', zoneId: 'z-1' },
      ),
    ).not.toThrow();
  });

  it('rejects a supervisor from another municipality or another user', () => {
    expect(() =>
      assertAssignmentMatchesLocation(
        { type: 'MUNICIPAL_WAREHOUSE', municipioId: 'm-1', zoneId: 'z-1' },
        { userId: 'u-1', supervisorId: 's-1' },
        { id: 's-1', userId: 'u-2', municipioId: 'm-2', zoneId: 'z-1' },
      ),
    ).toThrow(InventoryOperationError);
  });
});
