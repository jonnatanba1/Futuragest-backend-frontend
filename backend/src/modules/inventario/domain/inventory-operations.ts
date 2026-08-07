import type { ScopeContext } from '../../auth/domain/scope-context';

export class InventoryOperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InventoryOperationError';
  }
}

export interface CreateProductInput {
  sku: string;
  name: string;
  baseUnitCode: string;
}

export interface UpdateProductInput {
  name?: string;
  active?: boolean;
}

export interface AddProductUnitInput {
  unitCode: string;
  factorToBase: string;
  validFrom?: string;
}

export interface CreateLocationInput {
  code: string;
  name: string;
  type: 'CENTRAL_WAREHOUSE' | 'MUNICIPAL_WAREHOUSE' | 'SUPERVISOR_CUSTODY';
  zoneId?: string;
  municipioId?: string;
}

export interface UpdateLocationInput {
  name?: string;
  active?: boolean;
  inventoryEnabled?: boolean;
}

export interface AssignLocationInput {
  userId: string;
  supervisorId?: string;
  role: 'CUSTODIAN' | 'RECEIVER' | 'COUNTER';
  deviceId?: string;
  validFrom?: string;
}

export interface SetStockMinimumInput {
  locationId: string;
  productId: string;
  quantityBase: string;
}

export interface ResolveCommandInput {
  clientCommandId: string;
  action: 'APPROVE' | 'DISMISS';
  reason: string;
  locationId?: string;
}

export interface ReverseMovementInput {
  clientCommandId: string;
  reason: string;
}

export interface ShipmentLineInput {
  productId: string;
  unitVersionId: string;
  quantity: string;
}

export interface CreateShipmentInput {
  originLocationId: string;
  destinationLocationId: string;
  receiverUserId: string;
  notes?: string;
  items: ShipmentLineInput[];
}

export interface UpdateShipmentInput {
  notes?: string;
  destinationLocationId?: string;
  receiverUserId?: string;
  items?: ShipmentLineInput[];
}

export interface ShipmentCommandInput {
  clientCommandId: string;
  reason?: string;
}

export interface StockEntryInput extends ShipmentCommandInput {
  locationId: string;
  productId: string;
  unitVersionId: string;
  quantity: string;
  note?: string;
}

export interface ShipmentReceiptLineInput {
  shipmentItemId: string;
  receivedBase: string;
  damagedBase?: string;
  missingBase?: string;
}

export interface ReceiveShipmentInput extends ShipmentCommandInput {
  verificationMethod: 'BIOMETRIC';
  verificationReason?: string;
  capturedAtUtc: string;
  capturedOffsetMin: number;
  capturedLatitude?: number;
  capturedLongitude?: number;
  capturedAccuracyM?: number;
  items: ShipmentReceiptLineInput[];
}

export interface OpenCountInput {
  locationId: string;
}

export interface CountLineInput {
  productId: string;
  countedBase: string;
}

export interface ApproveCountInput extends ShipmentCommandInput {
  reason: string;
}

export interface OpeningBalanceRowInput {
  locationCode: string;
  productSku: string;
  quantityBase: string;
}

export interface ImportOpeningBalancesInput extends ShipmentCommandInput {
  sourceHash: string;
  rows: OpeningBalanceRowInput[];
}

export interface InventoryOperationsRepositoryPort {
  listProducts(actor: ScopeContext): Promise<unknown>;
  createProduct(actor: ScopeContext, input: CreateProductInput): Promise<unknown>;
  updateProduct(actor: ScopeContext, id: string, input: UpdateProductInput): Promise<unknown>;
  addProductUnit(actor: ScopeContext, id: string, input: AddProductUnitInput): Promise<unknown>;
  listLocations(actor: ScopeContext): Promise<unknown>;
  listAssignableUsers(actor: ScopeContext): Promise<unknown>;
  createLocation(actor: ScopeContext, input: CreateLocationInput): Promise<unknown>;
  updateLocation(actor: ScopeContext, id: string, input: UpdateLocationInput): Promise<unknown>;
  assignLocation(actor: ScopeContext, id: string, input: AssignLocationInput): Promise<unknown>;
  setStockMinimum(actor: ScopeContext, input: SetStockMinimumInput): Promise<unknown>;
  recordStockEntry(actor: ScopeContext, input: StockEntryInput): Promise<unknown>;
  listBalances(actor: ScopeContext): Promise<unknown>;
  listMovements(actor: ScopeContext, cursor?: string, productId?: string): Promise<unknown>;
  listAlerts(actor: ScopeContext): Promise<unknown>;
  listReviewCommands(actor: ScopeContext): Promise<unknown>;
  resolveCommand(actor: ScopeContext, id: string, input: ResolveCommandInput): Promise<unknown>;
  reverseMovement(actor: ScopeContext, id: string, input: ReverseMovementInput): Promise<unknown>;
  reconcile(actor: ScopeContext): Promise<unknown>;
  operationalMetrics(actor: ScopeContext): Promise<unknown>;
  createShipment(actor: ScopeContext, input: CreateShipmentInput): Promise<unknown>;
  updateShipment(actor: ScopeContext, id: string, input: UpdateShipmentInput): Promise<unknown>;
  dispatchShipment(actor: ScopeContext, id: string, input: ShipmentCommandInput): Promise<unknown>;
  cancelShipment(actor: ScopeContext, id: string): Promise<unknown>;
  listShipments(actor: ScopeContext): Promise<unknown>;
  getShipment(actor: ScopeContext, id: string): Promise<unknown>;
  receiveShipment(actor: ScopeContext, id: string, input: ReceiveShipmentInput): Promise<unknown>;
  returnShipment(actor: ScopeContext, id: string, input: ShipmentCommandInput): Promise<unknown>;
  resolveShipmentDiscrepancy(
    actor: ScopeContext,
    id: string,
    input: ShipmentCommandInput,
  ): Promise<unknown>;
  openCount(actor: ScopeContext, input: OpenCountInput): Promise<unknown>;
  saveCountLines(actor: ScopeContext, id: string, lines: CountLineInput[]): Promise<unknown>;
  submitCount(actor: ScopeContext, id: string): Promise<unknown>;
  approveCount(actor: ScopeContext, id: string, input: ApproveCountInput): Promise<unknown>;
  listCounts(actor: ScopeContext): Promise<unknown>;
  getCount(actor: ScopeContext, id: string): Promise<unknown>;
  importOpeningBalances(
    actor: ScopeContext,
    input: ImportOpeningBalancesInput,
  ): Promise<unknown>;
}

export const INVENTORY_OPERATIONS_REPOSITORY = Symbol('INVENTORY_OPERATIONS_REPOSITORY');
