export type InventoryLocationType =
  | 'CENTRAL_WAREHOUSE'
  | 'MUNICIPAL_WAREHOUSE'
  | 'SUPERVISOR_CUSTODY'
  | 'IN_TRANSIT';

export type InventoryMovementType =
  | 'OPENING_BALANCE'
  | 'FIELD_ISSUE'
  | 'FIELD_RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'COUNT_ADJUSTMENT_IN'
  | 'COUNT_ADJUSTMENT_OUT'
  | 'DAMAGE_OR_LOSS'
  | 'IN_TRANSIT_LOSS'
  | 'IN_TRANSIT_DAMAGE'
  | 'REVERSAL';

export type ShipmentStatus =
  | 'DRAFT'
  | 'DISPATCHED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'DISCREPANCY_REVIEW'
  | 'CLOSED_WITH_DISCREPANCY'
  | 'RETURNED'
  | 'CANCELLED';

export type InventoryCountStatus =
  | 'OPEN'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'CLOSED';

export interface ProductUnitVersion {
  id: string;
  unitCode: string;
  factorToBase: string;
  validFrom: string;
  validUntil?: string | null;
}

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  baseUnitCode: string;
  active: boolean;
  unitVersions?: ProductUnitVersion[];
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  type: InventoryLocationType;
  zoneId?: string | null;
  municipioId?: string | null;
  active: boolean;
}

export interface InventoryBalance {
  id: string;
  locationId: string;
  locationName?: string;
  locationCode?: string;
  productId: string;
  productSku?: string;
  productName?: string;
  quantityBase: string;
  version: number;
  minimumQuantity?: string;
  isBelowMinimum?: boolean;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  commandId?: string | null;
  locationId: string;
  locationName?: string;
  productId: string;
  productName?: string;
  type: InventoryMovementType;
  quantityBase: string;
  unitCode: string;
  reversalOfMovementId?: string | null;
  capturedAt: string;
  businessDate: string;
  createdAt: string;
}

export interface ShipmentItem {
  id: string;
  productId: string;
  productName?: string;
  quantityDispatched: string;
  quantityReceived?: string;
  unitCode: string;
}

export interface Shipment {
  id: string;
  code: string;
  originLocationId: string;
  originLocationName?: string;
  destinationLocationId: string;
  destinationLocationName?: string;
  status: ShipmentStatus;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  items: ShipmentItem[];
  createdAt: string;
}

export interface InventoryCountLine {
  id: string;
  productId: string;
  productName?: string;
  expectedQuantity: string;
  countedQuantity?: string | null;
  differenceQuantity?: string | null;
  unitCode: string;
}

export interface InventoryCount {
  id: string;
  locationId: string;
  locationName?: string;
  status: InventoryCountStatus;
  cutoffDate: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  lines: InventoryCountLine[];
  createdAt: string;
}
