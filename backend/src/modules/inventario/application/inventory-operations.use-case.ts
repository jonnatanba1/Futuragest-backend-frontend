import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type {
  AddProductUnitInput,
  ApproveCountInput,
  AssignLocationInput,
  CountLineInput,
  CreateLocationInput,
  CreateProductInput,
  CreateShipmentInput,
  ImportOpeningBalancesInput,
  InventoryOperationsRepositoryPort,
  OpenCountInput,
  ReceiveShipmentInput,
  ResolveCommandInput,
  ReverseMovementInput,
  SetStockMinimumInput,
  StockEntryInput,
  ShipmentCommandInput,
  UpdateProductInput,
  UpdateLocationInput,
  UpdateShipmentInput,
} from '../domain/inventory-operations';

export class InventoryOperationsUseCase {
  constructor(
    private readonly repository: InventoryOperationsRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
  ) {}

  private actor() {
    return this.scopeHolder.current();
  }

  listProducts() { return this.repository.listProducts(this.actor()); }
  createProduct(input: CreateProductInput) { return this.repository.createProduct(this.actor(), input); }
  updateProduct(id: string, input: UpdateProductInput) { return this.repository.updateProduct(this.actor(), id, input); }
  addProductUnit(id: string, input: AddProductUnitInput) { return this.repository.addProductUnit(this.actor(), id, input); }
  listLocations() { return this.repository.listLocations(this.actor()); }
  listAssignableUsers() { return this.repository.listAssignableUsers(this.actor()); }
  createLocation(input: CreateLocationInput) { return this.repository.createLocation(this.actor(), input); }
  updateLocation(id: string, input: UpdateLocationInput) { return this.repository.updateLocation(this.actor(), id, input); }
  assignLocation(id: string, input: AssignLocationInput) { return this.repository.assignLocation(this.actor(), id, input); }
  setStockMinimum(input: SetStockMinimumInput) { return this.repository.setStockMinimum(this.actor(), input); }
  recordStockEntry(input: StockEntryInput) { return this.repository.recordStockEntry(this.actor(), input); }
  listBalances() { return this.repository.listBalances(this.actor()); }
  listMovements(cursor?: string, productId?: string) { return this.repository.listMovements(this.actor(), cursor, productId); }
  listAlerts() { return this.repository.listAlerts(this.actor()); }
  listReviewCommands() { return this.repository.listReviewCommands(this.actor()); }
  resolveCommand(id: string, input: ResolveCommandInput) { return this.repository.resolveCommand(this.actor(), id, input); }
  reverseMovement(id: string, input: ReverseMovementInput) { return this.repository.reverseMovement(this.actor(), id, input); }
  reconcile() { return this.repository.reconcile(this.actor()); }
  operationalMetrics() { return this.repository.operationalMetrics(this.actor()); }
  createShipment(input: CreateShipmentInput) { return this.repository.createShipment(this.actor(), input); }
  updateShipment(id: string, input: UpdateShipmentInput) { return this.repository.updateShipment(this.actor(), id, input); }
  dispatchShipment(id: string, input: ShipmentCommandInput) { return this.repository.dispatchShipment(this.actor(), id, input); }
  cancelShipment(id: string) { return this.repository.cancelShipment(this.actor(), id); }
  listShipments() { return this.repository.listShipments(this.actor()); }
  getShipment(id: string) { return this.repository.getShipment(this.actor(), id); }
  receiveShipment(id: string, input: ReceiveShipmentInput) { return this.repository.receiveShipment(this.actor(), id, input); }
  returnShipment(id: string, input: ShipmentCommandInput) { return this.repository.returnShipment(this.actor(), id, input); }
  resolveShipmentDiscrepancy(id: string, input: ShipmentCommandInput) { return this.repository.resolveShipmentDiscrepancy(this.actor(), id, input); }
  openCount(input: OpenCountInput) { return this.repository.openCount(this.actor(), input); }
  saveCountLines(id: string, lines: CountLineInput[]) { return this.repository.saveCountLines(this.actor(), id, lines); }
  submitCount(id: string) { return this.repository.submitCount(this.actor(), id); }
  approveCount(id: string, input: ApproveCountInput) { return this.repository.approveCount(this.actor(), id, input); }
  listCounts() { return this.repository.listCounts(this.actor()); }
  getCount(id: string) { return this.repository.getCount(this.actor(), id); }
  importOpeningBalances(input: ImportOpeningBalancesInput) { return this.repository.importOpeningBalances(this.actor(), input); }
}
