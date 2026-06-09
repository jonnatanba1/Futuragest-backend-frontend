/**
 * JornadaPolicyRepositoryPort — domain port for JornadaPolicy persistence.
 *
 * Global (not scoped) — JornadaPolicy is a company-wide setting, not per-zone.
 * Adapter lives in iam/infrastructure/jornada-policy.repository.ts.
 *
 * APPEND-ONLY semantics: only create, no update/delete methods.
 */

import type { Decimal } from '@prisma/client/runtime/client';

export const JORNADA_POLICY_REPOSITORY_PORT = Symbol('JornadaPolicyRepositoryPort');

export interface JornadaPolicyRecord {
  id: string;
  horasDiarias: Decimal;
  vigenteDesde: Date;
  createdAt: Date;
}

export interface CreateJornadaPolicyData {
  horasDiarias: Decimal;
  vigenteDesde: Date;
}

export interface JornadaPolicyRepositoryPort {
  /** INSERT a new policy. NEVER updates existing rows. */
  create(data: CreateJornadaPolicyData): Promise<JornadaPolicyRecord>;

  /** Returns all policies ordered ascending by vigenteDesde. */
  findTimeline(): Promise<JornadaPolicyRecord[]>;

  /**
   * Returns the most recent policy with vigenteDesde <= date.
   * Returns null if no policy has vigenteDesde <= date.
   */
  findLatestBefore(date: Date): Promise<JornadaPolicyRecord | null>;
}
