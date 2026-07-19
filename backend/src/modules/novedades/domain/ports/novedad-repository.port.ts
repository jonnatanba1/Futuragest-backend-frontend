/**
 * NovedadRepositoryPort — domain port for Novedad persistence operations.
 *
 * ALL Novedad Prisma access (reads AND writes) must go through the single
 * sanctioned implementation: ScopedNovedadRepository.
 *
 * Read operations are scope-enforced via ScopedRepository base class.
 * Write operations (create, updateStatus, delete) live in the sanctioned
 * scoped-novedad.repository.ts file to satisfy the meta-guard scan.
 */

import type { Novedad, NovedadStatus, TipoNovedad, VerificationMethod } from '@prisma/client';

export const NOVEDAD_REPOSITORY_PORT = Symbol('NovedadRepositoryPort');

export interface CreateNovedadData {
  attendanceId: string;
  supervisorId: string;
  zoneId: string;
  /** Accepted as string (e.g. "2.50") or number; stored as Decimal(5,2) in DB. */
  horasExtra: string | number;
  motivo?: string | null;
  /** Optional idempotency token for offline sync. */
  clientRef?: string | null;
  /** Type of novelty — LLEGADA_TARDE (auto-generated) or HORAS_EXTRA (default, supervisor-requested). */
  tipoNovedad?: TipoNovedad;
  /** true = system-created (late arrival); false = supervisor-requested. */
  autoGenerada?: boolean;
  /** Only set when tipoNovedad = LLEGADA_TARDE. Minutes late from horaInicio. */
  minutosTarde?: number | null;
}

export interface UpdateNovedadStatusData {
  status: NovedadStatus;
  approvedByUserId: string | null;
  decidedAt: Date | null;
  /** Audit label only — no authorization logic may depend on this field. */
  decisionVerification: VerificationMethod | null;
  /** Optional reason provided by the líder when rejecting the novedad. */
  rejectionReason?: string | null;
}

export interface NovedadRepositoryPort {
  /** Create a new novedad. May throw Prisma P2002 (partial unique violation). */
  create(data: CreateNovedadData): Promise<Novedad>;

  /** Find a novedad by clientRef within the current principal's scope.
   *  Returns null if not found or out of scope. */
  findByClientRef(clientRef: string): Promise<Novedad | null>;

  /** Scoped find by id — returns null if not found or out of scope. */
  findByIdScoped(id: string): Promise<Novedad | null>;

  /** Scoped list — returns novedades visible to the current principal. */
  findManyScoped(filter?: object): Promise<Novedad[]>;

  /** Update novedad status (approve/reject). Returns updated record. */
  updateStatus(id: string, data: UpdateNovedadStatusData): Promise<Novedad>;

  /** Hard delete a novedad row (cancel). */
  delete(id: string): Promise<void>;
}
