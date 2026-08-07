export type InventoryLocationType =
  | 'CENTRAL_WAREHOUSE'
  | 'MUNICIPAL_WAREHOUSE'
  | 'SUPERVISOR_CUSTODY'
  | 'IN_TRANSIT';

export interface InventoryUnit {
  id: string;
  unitCode: string;
  factorToBase: string;
  isBase: boolean;
  validFrom: string;
  validUntil: string | null;
}

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  baseUnitCode: string;
  active: boolean;
  deactivatedAt: string | null;
  updatedAt: string;
  unitVersions: InventoryUnit[];
}

export interface InventoryAssignee {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'SYSTEM_ADMIN' | 'COMPRAS' | 'COORDINADOR' | 'SUPERVISOR';
  supervisor?: { id: string; zoneId: string; municipioId: string } | null;
}

export interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  type: InventoryLocationType;
  zoneId: string | null;
  municipioId: string | null;
  active: boolean;
  inventoryEnabled: boolean;
  zone?: { id: string; name: string } | null;
  municipio?: { id: string; name: string; zoneId: string } | null;
  assignments?: Array<{
    id: string;
    userId: string;
    role: 'CUSTODIAN' | 'RECEIVER' | 'COUNTER';
    validFrom: string;
    validUntil: string | null;
    user: { id: string; email: string; displayName?: string | null };
  }>;
}

export interface InventoryBalance {
  id: string;
  locationId: string;
  productId: string;
  quantityBase: string;
  version: number;
  updatedAt: string;
  location: InventoryLocation;
  product: InventoryProduct;
}

export interface InventoryMovement {
  id: string;
  type: string;
  quantityBase: string;
  locationId: string;
  productId: string;
  capturedAtUtc: string;
  businessDate: string;
  createdAt: string;
  sourceMovementId: string | null;
  location: InventoryLocation;
  product: InventoryProduct;
  command: { clientCommandId: string; actorUserId: string; status: string };
}

export interface InventoryAlert {
  location: InventoryLocation;
  product: InventoryProduct;
  quantityBase: string;
  minimumBase: string;
  shortageBase: string;
}

export interface InventoryReviewCommand {
  id: string;
  clientCommandId: string;
  type: string;
  status: 'NEEDS_REVIEW';
  payload: Record<string, unknown>;
  reviewCode: string | null;
  reviewReason: string | null;
  receivedAt: string;
  location: InventoryLocation | null;
  actor: { id: string; email: string; displayName?: string | null };
}

export interface InventoryCommandResult {
  commandId: string;
  status: string;
  code: string;
  movementIds: string[];
  serverReceivedAt: string;
}

export interface ShipmentItem {
  id: string;
  productId: string;
  unitVersionId: string;
  quantityBase: string;
  receivedBase: string;
  damagedBase: string;
  lostBase: string;
  product: InventoryProduct;
  unitVersion: InventoryUnit;
}

export interface InventoryShipment {
  id: string;
  code: string;
  status:
    | 'DRAFT'
    | 'DISPATCHED'
    | 'PARTIALLY_RECEIVED'
    | 'DISCREPANCY_REVIEW'
    | 'RECEIVED'
    | 'CANCELLED'
    | 'RETURNED'
    | 'CLOSED_WITH_DISCREPANCY';
  originLocationId: string;
  destinationLocationId: string;
  inTransitLocationId: string | null;
  notes: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  originLocation: InventoryLocation;
  destinationLocation: InventoryLocation;
  items: ShipmentItem[];
}

export interface InventoryCountLine {
  id: string;
  productId: string;
  expectedBase?: string | null;
  countedBase: string | null;
  differenceBase?: string | null;
  product: InventoryProduct;
  unitVersion: InventoryUnit;
}

export interface InventoryCount {
  id: string;
  locationId: string;
  status: 'OPEN' | 'SUBMITTED' | 'CLOSED' | 'CANCELLED';
  counterUserId: string;
  approverUserId: string | null;
  cutoffAt: string;
  submittedAt: string | null;
  closedAt: string | null;
  reason: string | null;
  createdAt: string;
  location: InventoryLocation;
  counter: { id: string; email: string; displayName?: string | null };
  approver?: { id: string; email: string; displayName?: string | null } | null;
  lines?: InventoryCountLine[];
  _count?: { lines: number };
}

export interface InventoryReconciliation {
  checkedAt: string;
  balanceCount: number;
  movementCount: number;
  mismatches: Array<{
    locationId: string;
    productId: string;
    locationCode: string | null;
    productSku: string | null;
    ledgerQuantityBase: string;
    balanceQuantityBase: string;
    differenceBase: string;
  }>;
}
