import type { InventoryAssignee, InventoryLocation } from './inventory.types';

export const MANUAL_INVENTORY_LOCATION_TYPES = [
  { value: 'CENTRAL_WAREHOUSE', label: 'Bodega central' },
  { value: 'SUPERVISOR_CUSTODY', label: 'Custodia de supervisor' },
] as const;

export function isOperationalInventoryLocation(location: InventoryLocation): boolean {
  return location.active && location.type !== 'IN_TRANSIT';
}

export function eligibleInventoryAssignees(
  location: InventoryLocation | undefined,
  assignees: InventoryAssignee[],
): InventoryAssignee[] {
  if (location?.type !== 'MUNICIPAL_WAREHOUSE') return assignees;

  return assignees.filter((assignee) =>
    assignee.role === 'SUPERVISOR'
      && assignee.supervisor?.municipioId === location.municipioId
      && assignee.supervisor?.zoneId === location.zoneId,
  );
}

export function eligibleShipmentReceivers(
  destination: InventoryLocation | undefined,
  assignees: InventoryAssignee[],
): InventoryAssignee[] {
  if (
    destination?.type !== 'MUNICIPAL_WAREHOUSE'
    || !destination.zoneId
    || !destination.municipioId
  ) return [];

  return assignees.filter((assignee) => {
    if (assignee.role === 'SUPERVISOR') {
      return assignee.supervisor?.municipioId === destination.municipioId
        && assignee.supervisor.zoneId === destination.zoneId;
    }
    return assignee.role === 'COORDINADOR'
      && assignee.coordinatedZoneId === destination.zoneId;
  });
}
