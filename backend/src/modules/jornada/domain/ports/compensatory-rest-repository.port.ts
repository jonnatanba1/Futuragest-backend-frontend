/**
 * CompensatoryRestRepositoryPort — narrow port for CompensatoryRest CRUD
 * consumed by CompensatoryRestService.
 *
 * Defined in jornada/domain/ports/ following the hexagonal ports-adapters pattern.
 */

export const COMPENSATORY_REST_REPOSITORY_PORT = Symbol('CompensatoryRestRepositoryPort');

export interface CompensatoryRestRecord {
  id: string;
  operarioId: string;
  attendanceId: string;
  month: string;
  type: 'OCCASIONAL' | 'HABITUAL';
  status: string;
  scheduledDate?: string | null;
  notes?: string | null;
}

export interface CompensatoryRestRepositoryPort {
  /**
   * Count existing CompensatoryRest records for a given operario+month.
   */
  countByOperarioAndMonth(operarioId: string, month: string): Promise<number>;

  /**
   * Find CompensatoryRest records, optionally filtering by operario and month.
   */
  findMany(opts?: { operarioId?: string; month?: string }): Promise<CompensatoryRestRecord[]>;

  /**
   * Find all CompensatoryRest records for operario+month.
   */
  findByOperarioAndMonth(operarioId: string, month: string): Promise<CompensatoryRestRecord[]>;

  /**
   * Check if a CompensatoryRest already exists for this attendance (idempotency).
   * Returns the record or null.
   */
  findByAttendanceId(attendanceId: string): Promise<CompensatoryRestRecord | null>;

  /**
   * Create a CompensatoryRest record.
   */
  create(input: CreateCompensatoryRestInput): Promise<CompensatoryRestRecord>;

  /**
   * Update the type of an existing CompensatoryRest record (OCCASIONAL → HABITUAL).
   */
  updateType(attendanceId: string, type: 'OCCASIONAL' | 'HABITUAL'): Promise<void>;

  /**
   * Update schedule, status and notes.
   */
  update(id: string, data: { status?: string; scheduledDate?: string | null; notes?: string | null }): Promise<CompensatoryRestRecord>;
}

export interface CreateCompensatoryRestInput {
  operarioId: string;
  attendanceId: string;
  month: string;
  type: 'OCCASIONAL' | 'HABITUAL';
  status: string;
}
