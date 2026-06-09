/**
 * OperarioReaderPort — scoped existence check for the compensacion module.
 *
 * Used by GetPeriodBalanceUseCase to confirm an operario is visible to the
 * current principal BEFORE computing the balance. If findById returns null,
 * the operario is either non-existent or outside the caller's scope →
 * GetPeriodBalanceUseCase throws OperarioNotInScopeError (HTTP 404,
 * fail-closed per REQ-RBAC-04).
 *
 * Intentionally minimal — exposes only the existence check needed, keeping
 * the compensacion domain decoupled from the IAM domain's full port.
 */

export const OPERARIO_READER_PORT = Symbol('OperarioReaderPort');

export interface OperarioReaderPort {
  /**
   * Returns the operario if it exists AND is visible to the current principal.
   * Returns null when the operario does not exist OR is outside scope.
   * Scope-enforced by the implementing adapter (ScopedOperarioRepository).
   */
  findById(id: string): Promise<{ id: string } | null>;
}
