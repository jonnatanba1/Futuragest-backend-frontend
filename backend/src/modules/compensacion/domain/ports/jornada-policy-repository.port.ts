/**
 * JornadaPolicyRepositoryPort — domain port for JornadaPolicy persistence.
 *
 * SCOPE-AWARE — JornadaPolicy is keyed by (operarioId, zoneId, vigenteDesde):
 *   - operarioId === null AND zoneId === null → global policy (company-wide)
 *   - zoneId !== null → per-zone policy
 *   - operarioId !== null → per-operario override (operario may belong to a zone)
 * Adapter lives in iam/infrastructure/jornada-policy.repository.ts.
 *
 * APPEND-ONLY semantics for policy values: edits create a new row with updated vigenteDesde.
 * DELETE is allowed for removing mistaken/invalid entries.
 */

import type { Decimal } from '@prisma/client/runtime/client';

export const JORNADA_POLICY_REPOSITORY_PORT = Symbol('JornadaPolicyRepositoryPort');

export interface JornadaPolicyRecord {
  id: string;
  operarioId: string | null;
  zoneId: string | null;
  horaInicio: string;
  horaFin: string;
  diasLaborales: number[];
  almuerzoInicio: string | null;
  almuerzoFin: string | null;
  desayunoInicio: string | null;
  desayunoFin: string | null;
  toleranciaMin: number;
  horasDiarias: Decimal;
  horasSemanales: Decimal;
  vigenteDesde: Date;
  createdAt: Date;
}

export interface CreateJornadaPolicyData {
  operarioId: string | null;
  zoneId: string | null;
  horaInicio: string;
  horaFin: string;
  diasLaborales: number[];
  almuerzoInicio: string | null;
  almuerzoFin: string | null;
  desayunoInicio: string | null;
  desayunoFin: string | null;
  toleranciaMin: number;
  horasDiarias: Decimal;
  horasSemanales: Decimal;
  vigenteDesde: Date;
}

export interface FindByScopeOptions {
  /**
   * Filter by zoneId.
   * - `undefined` (absent) → no zoneId clause (all scopes)
   * - `null` or `''`       → global policies only (IS NULL)
   * - non-empty string     → that zone's policies
   */
  zoneId?: string | null;
  /**
   * Filter by operarioId.
   * - `undefined` (absent) → no operarioId clause
   * - `null`               → non-operario-scoped rows
   * - non-empty string     → that operario's rows
   */
  operarioId?: string | null;
}

export interface JornadaPolicyRepositoryPort {
  /** INSERT a new policy. NEVER updates existing rows. */
  create(data: CreateJornadaPolicyData): Promise<JornadaPolicyRecord>;

  /** Returns all policies ordered ascending by vigenteDesde. */
  findTimeline(): Promise<JornadaPolicyRecord[]>;

  /**
   * Scope-aware read (R1.1). Returns policies filtered by `opts` and ordered
   * ascending by `vigenteDesde`.
   *   - opts absent → all rows
   *   - opts.zoneId === null | ''  → global-only (IS NULL)
   *   - opts.zoneId non-empty      → that zone
   *   - opts.operarioId            → filter applied (null allowed)
   */
  findByScope(opts?: FindByScopeOptions): Promise<JornadaPolicyRecord[]>;

  /**
   * Scope-aware duplicate probe (R1.2). Returns true when a row already exists
   * for the exact (operarioId, zoneId, vigenteDesde) tuple.
   * `vigenteDesde` MUST be a UTC-midnight Date (sole writer is SetJornadaPolicyUseCase).
   */
  existsByOperarioZoneVigente(
    operarioId: string | null,
    zoneId: string | null,
    vigenteDesde: Date,
  ): Promise<boolean>;

  /**
   * Returns the most recent policy with vigenteDesde <= date.
   * Returns null if no policy has vigenteDesde <= date.
   */
  findLatestBefore(date: Date): Promise<JornadaPolicyRecord | null>;

  /** DELETE a policy by ID — for removing mistaken/invalid entries. */
  delete(id: string): Promise<void>;
}
