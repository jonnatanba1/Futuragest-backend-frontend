/**
 * Operario-related shared contract types.
 *
 * Plain TypeScript interfaces — no framework decorators.
 * Mirror the pattern of org.ts / asistencia.ts.
 */

export interface OperarioDto {
  id: string;
  fullName: string;
  documento: string;
  supervisorId: string;
  /** Derived: deactivatedAt === null */
  active: boolean;
  /** ISO 8601 timestamp or null when active */
  deactivatedAt: string | null;
  createdAt: string;
}

export interface CreateOperarioRequest {
  fullName: string;
  documento: string;
  supervisorId: string;
}

export interface OperarioImportRow {
  rowNumber: number;
  fullName: string;
  documento: string;
  supervisorEmail: string;
}

export interface ImportRowError {
  row: number;
  documento: string | null;
  reason: string;
}

export interface ImportResultDto {
  imported: number;
  failed: number;
  errors: ImportRowError[];
}
