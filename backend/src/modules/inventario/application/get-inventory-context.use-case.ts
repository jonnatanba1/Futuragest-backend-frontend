import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import type {
  InventoryContextRepositoryPort,
  InventoryContextSnapshot,
} from '../domain/inventory-context';

export class GetInventoryContextUseCase {
  constructor(
    private readonly repository: InventoryContextRepositoryPort,
    private readonly scopeHolder: ScopeContextHolder,
  ) {}

  execute(): Promise<InventoryContextSnapshot> {
    return this.repository.getForActor(this.scopeHolder.current());
  }
}
