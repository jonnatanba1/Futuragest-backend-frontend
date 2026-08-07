import type { ScopeContext } from '../../auth/domain/scope-context';

export interface InventoryContextSnapshot {
  schemaVersion: 1;
  serverTime: string;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    baseUnitCode: string;
    updatedAt: string;
  }>;
  units: Array<{
    id: string;
    productId: string;
    unitCode: string;
    factorToBase: string;
    validFrom: string;
    validUntil: string | null;
  }>;
  assignments: Array<{
    id: string;
    locationId: string;
    locationCode: string;
    locationName: string;
    supervisorId: string | null;
    version: number;
    validFrom: string;
    validUntil: string | null;
  }>;
  balances: Array<{
    locationId: string;
    productId: string;
    quantityBase: string;
    version: number;
    updatedAt: string;
  }>;
  pendingReceipts: Array<{
    id: string;
    code: string;
    status: 'DISPATCHED' | 'PARTIALLY_RECEIVED';
    destinationLocationId: string;
    destinationCode: string;
    destinationName: string;
    dispatchedAt: string | null;
    items: Array<{
      id: string;
      productId: string;
      productSku: string;
      productName: string;
      quantityBase: string;
      receivedBase: string;
      damagedBase: string;
      lostBase: string;
    }>;
  }>;
}

export interface InventoryContextRepositoryPort {
  getForActor(actor: ScopeContext): Promise<InventoryContextSnapshot>;
}

export const INVENTORY_CONTEXT_REPOSITORY = Symbol('InventoryContextRepositoryPort');
