import { InventoryOperationError } from './inventory-operations';

export interface MunicipalShipmentDestination {
  type: string;
  zoneId: string | null;
  municipioId: string | null;
}

export interface MunicipalShipmentOrigin {
  type: string;
}

export interface ShipmentReceiverCandidate {
  id: string;
  role: string;
  coordinatedZoneId: string | null;
  supervisor: {
    zoneId: string;
    municipioId: string;
  } | null;
}

export function assertMunicipalShipmentOrigin(origin: MunicipalShipmentOrigin): void {
  if (origin.type !== 'CENTRAL_WAREHOUSE') {
    throw new InventoryOperationError(
      'INVALID_ORIGIN',
      'Municipal shipments must originate from a central warehouse.',
    );
  }
}

export function assertEligibleShipmentReceiver(
  destination: MunicipalShipmentDestination,
  receiver: ShipmentReceiverCandidate | null,
): asserts receiver is ShipmentReceiverCandidate {
  if (
    destination.type !== 'MUNICIPAL_WAREHOUSE' ||
    !destination.zoneId ||
    !destination.municipioId
  ) {
    throw new InventoryOperationError(
      'INVALID_DESTINATION',
      'Shipments must target an existing municipal warehouse.',
    );
  }

  if (!receiver) {
    throw new InventoryOperationError('INVALID_RECEIVER', 'Shipment receiver was not found.');
  }

  const supervisorMatches =
    receiver.role === 'SUPERVISOR' &&
    receiver.supervisor?.zoneId === destination.zoneId &&
    receiver.supervisor.municipioId === destination.municipioId;
  const coordinatorMatches =
    receiver.role === 'COORDINADOR' && receiver.coordinatedZoneId === destination.zoneId;

  if (!supervisorMatches && !coordinatorMatches) {
    throw new InventoryOperationError(
      'INVALID_RECEIVER',
      'The receiver must be a supervisor from the destination municipality or its zone coordinator.',
    );
  }
}

export function assertShipmentReceiptIdentity(
  receiverUserId: string | null,
  actorUserId: string,
  verificationMethod: string,
): void {
  if (!receiverUserId || receiverUserId !== actorUserId) {
    throw new InventoryOperationError(
      'FORBIDDEN',
      'Only the person assigned to this shipment can confirm its receipt.',
    );
  }
  if (verificationMethod !== 'BIOMETRIC') {
    throw new InventoryOperationError(
      'BIOMETRIC_REQUIRED',
      'Biometric confirmation is required to receive municipal inventory.',
    );
  }
}
