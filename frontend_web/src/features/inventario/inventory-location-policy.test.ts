import { describe, expect, it } from 'vitest';
import {
  eligibleInventoryAssignees,
  eligibleShipmentReceivers,
  isOperationalInventoryLocation,
  MANUAL_INVENTORY_LOCATION_TYPES,
} from './inventory-location-policy';
import type { InventoryAssignee, InventoryLocation } from './inventory.types';

const location = {
  id: 'location-1',
  code: 'MW-1',
  name: 'Bodega Municipio 1',
  type: 'MUNICIPAL_WAREHOUSE',
  zoneId: 'zone-1',
  municipioId: 'municipio-1',
  active: true,
  inventoryEnabled: false,
} satisfies InventoryLocation;

const assignees = [
  { id: 'user-1', email: 'one@example.com', role: 'SUPERVISOR', supervisor: { id: 'supervisor-1', zoneId: 'zone-1', municipioId: 'municipio-1' } },
  { id: 'user-2', email: 'two@example.com', role: 'SUPERVISOR', supervisor: { id: 'supervisor-2', zoneId: 'zone-1', municipioId: 'municipio-2' } },
  { id: 'user-3', email: 'admin@example.com', role: 'SYSTEM_ADMIN', supervisor: null },
  { id: 'user-4', email: 'coordinator@example.com', role: 'COORDINADOR', coordinatedZoneId: 'zone-1', supervisor: null },
  { id: 'user-5', email: 'other-coordinator@example.com', role: 'COORDINADOR', coordinatedZoneId: 'zone-2', supervisor: null },
] satisfies InventoryAssignee[];

describe('inventory location policy', () => {
  it('does not offer manual municipal warehouse creation', () => {
    expect(MANUAL_INVENTORY_LOCATION_TYPES.map((item) => item.value)).not.toContain('MUNICIPAL_WAREHOUSE');
  });

  it('only offers existing supervisors from the warehouse municipality and zone', () => {
    expect(eligibleInventoryAssignees(location, assignees).map((item) => item.id)).toEqual(['user-1']);
  });

  it('excludes inactive and in-transit locations from operational selectors', () => {
    expect(isOperationalInventoryLocation(location)).toBe(true);
    expect(isOperationalInventoryLocation({ ...location, active: false })).toBe(false);
    expect(isOperationalInventoryLocation({ ...location, type: 'IN_TRANSIT' })).toBe(false);
  });

  it('offers supervisors from the municipality and the coordinator of its zone as receivers', () => {
    expect(eligibleShipmentReceivers(location, assignees).map((item) => item.id)).toEqual([
      'user-1',
      'user-4',
    ]);
  });
});
