import { JornadaPolicy } from '@prisma/client';

export const JORNADA_POLICY_REPOSITORY_PORT = Symbol('JornadaPolicyRepositoryPort');

export interface JornadaPolicyRepositoryPort {
  /**
   * Resolves the latest effective-dated policy using 3-level fallback:
   *   1. operarioId + vigenteDesde (per-worker override — highest priority)
   *   2. zoneId + vigenteDesde (per-zone default — operarioId IS NULL)
   *   3. vigenteDesde only (global default — both operarioId and zoneId are NULL)
   *
   * Returns null if no policy exists at any level for the given date.
   */
  findLatest(operarioId: string | null, zoneId: string | null, date: Date): Promise<JornadaPolicy | null>;
}
