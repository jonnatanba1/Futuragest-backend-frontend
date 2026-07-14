/**
 * OperarioRepositoryPort — domain port for operario write and lookup operations.
 *
 * Pure domain interface (hexagonal port). Infrastructure layer provides the
 * concrete adapter (ScopedOperarioRepository).
 *
 * All write methods go through this port — NEVER raw prisma.operario.* outside
 * the sanctioned repository (scope-meta-guard enforces this).
 */

import type { Operario } from '@prisma/client';

/** Injection token for OperarioRepositoryPort. */
export const OPERARIO_REPOSITORY = Symbol('OperarioRepositoryPort');

export interface OperarioRepositoryPort {
  /**
   * Creates a new operario record.
   * Throws DuplicateDocumentoError if documento is already in use (P2002).
   */
  create(data: {
    fullName: string;
    documento: string;
    supervisorId: string;
    cargo: string;
    areaId?: string;
  }): Promise<Operario>;

  /**
   * Finds an operario by documento (global, unscoped — for dup check).
   * Returns null if not found.
   */
  findByDocumento(documento: string): Promise<Operario | null>;

  /**
   * Finds an operario by id within the current scope (role-filtered).
   * Returns null if not found or out of scope.
   */
  findByIdScoped(id: string): Promise<Operario | null>;

  /**
   * Sets or clears the deactivatedAt timestamp for an operario.
   * Pass a Date to deactivate, null to reactivate.
   */
  setDeactivatedAt(id: string, date: Date | null): Promise<Operario>;

  /**
   * Reassigns an operario to a different supervisor.
   * Throws Prisma P2003 if supervisorId does not reference a real Supervisor.
   */
  setSupervisor(id: string, supervisorId: string): Promise<Operario>;

  /**
   * Bulk-creates operarios in a single $transaction.
   * Returns the count of successfully inserted rows.
   */
  bulkCreate(
    rows: Array<{ fullName: string; documento: string; supervisorId: string; cargo: string; areaId?: string }>,
  ): Promise<number>;

  /**
   * Resolves a supervisor by their user email.
   * Returns { id } of the Supervisor record, or null if not found.
   * Uses a SEPARATE query — never includes supervisor on Operario (W4 guard).
   */
  resolveSupervisorByEmail(email: string): Promise<{ id: string } | null>;
}
