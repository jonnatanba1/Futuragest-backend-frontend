import { InventoryOperationError } from './inventory-operations';
import {
  assertEligibleShipmentReceiver,
  assertMunicipalShipmentOrigin,
  assertShipmentReceiptIdentity,
} from './inventory-shipment-policy';

const destination = {
  type: 'MUNICIPAL_WAREHOUSE',
  zoneId: 'zone-1',
  municipioId: 'municipio-1',
};

describe('inventory shipment policy', () => {
  it('requires a central warehouse as shipment origin', () => {
    expect(() => assertMunicipalShipmentOrigin({ type: 'CENTRAL_WAREHOUSE' })).not.toThrow();
    expect(() => assertMunicipalShipmentOrigin({ type: 'MUNICIPAL_WAREHOUSE' })).toThrow(
      expect.objectContaining({ code: 'INVALID_ORIGIN' }),
    );
  });

  it('accepts a supervisor from the destination municipality', () => {
    expect(() =>
      assertEligibleShipmentReceiver(destination, {
        id: 'user-1',
        role: 'SUPERVISOR',
        coordinatedZoneId: null,
        supervisor: { zoneId: 'zone-1', municipioId: 'municipio-1' },
      }),
    ).not.toThrow();
  });

  it('accepts the coordinator of the destination zone', () => {
    expect(() =>
      assertEligibleShipmentReceiver(destination, {
        id: 'user-2',
        role: 'COORDINADOR',
        coordinatedZoneId: 'zone-1',
        supervisor: null,
      }),
    ).not.toThrow();
  });

  it('rejects cross-municipality supervisors and cross-zone coordinators', () => {
    expect(() =>
      assertEligibleShipmentReceiver(destination, {
        id: 'user-3',
        role: 'SUPERVISOR',
        coordinatedZoneId: null,
        supervisor: { zoneId: 'zone-1', municipioId: 'municipio-2' },
      }),
    ).toThrow(InventoryOperationError);
    expect(() =>
      assertEligibleShipmentReceiver(destination, {
        id: 'user-4',
        role: 'COORDINADOR',
        coordinatedZoneId: 'zone-2',
        supervisor: null,
      }),
    ).toThrow(InventoryOperationError);
  });

  it('allows only the assigned receiver with biometric verification', () => {
    expect(() => assertShipmentReceiptIdentity('receiver-1', 'receiver-1', 'BIOMETRIC')).not.toThrow();
    expect(() => assertShipmentReceiptIdentity('receiver-1', 'other-user', 'BIOMETRIC')).toThrow(
      InventoryOperationError,
    );
    expect(() =>
      assertShipmentReceiptIdentity('receiver-1', 'receiver-1', 'DEVICE_CREDENTIAL'),
    ).toThrow(InventoryOperationError);
  });
});
