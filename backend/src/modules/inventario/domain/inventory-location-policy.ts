import { InventoryOperationError } from './inventory-operations';

interface LocationIdentity {
  type: 'CENTRAL_WAREHOUSE' | 'MUNICIPAL_WAREHOUSE' | 'SUPERVISOR_CUSTODY' | 'IN_TRANSIT';
  zoneId: string | null;
  municipioId: string | null;
}

interface AssignmentIdentity {
  userId: string;
  supervisorId?: string;
}

interface SupervisorIdentity {
  id: string;
  userId: string;
  zoneId: string;
  municipioId: string;
}

export function assertLocationCanBeCreatedManually(type: LocationIdentity['type']): void {
  if (type === 'MUNICIPAL_WAREHOUSE') {
    throw new InventoryOperationError(
      'INVALID_INPUT',
      'Municipal warehouses are synchronized from existing municipalities and cannot be created manually.',
    );
  }
}

export function assertAssignmentMatchesLocation(
  location: LocationIdentity,
  input: AssignmentIdentity,
  supervisor: SupervisorIdentity | null,
): void {
  if (input.supervisorId && (!supervisor || supervisor.id !== input.supervisorId || supervisor.userId !== input.userId)) {
    throw new InventoryOperationError(
      'INVALID_INPUT',
      'supervisorId must belong to the assigned user.',
    );
  }

  if (location.type !== 'MUNICIPAL_WAREHOUSE') return;

  if (!input.supervisorId || !supervisor) {
    throw new InventoryOperationError(
      'INVALID_INPUT',
      'Municipal warehouse assignments require an existing supervisor.',
    );
  }

  if (
    !location.municipioId ||
    !location.zoneId ||
    supervisor.municipioId !== location.municipioId ||
    supervisor.zoneId !== location.zoneId
  ) {
    throw new InventoryOperationError(
      'INVALID_INPUT',
      'The supervisor must belong to the municipality and zone of the warehouse.',
    );
  }
}
