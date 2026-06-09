/**
 * CompensationPeriodLookupPort — narrow read-only port used by SetJornadaPolicyUseCase
 * to validate that a new vigenteDesde does not fall inside an already-liquidated period.
 *
 * PR-A: This port is defined here with a stub implementation that returns null
 * (no liquidated periods). The real Prisma adapter and full CompensationPeriod
 * repository are wired in PR-B.
 *
 * Design §5, tasks A4: "define the port dependency but stub/inject a port that
 * returns 'no liquidated periods' / null".
 */

export const COMPENSATION_PERIOD_LOOKUP_PORT = Symbol('CompensationPeriodLookupPort');

export interface CompensationPeriodLookupPort {
  /**
   * Returns the first CompensationPeriod whose [desde, hasta] range overlaps
   * the given vigenteDesde, or null if none exists.
   *
   * PR-A: always returns null (stub).
   * PR-B: real implementation queries the CompensationPeriod table.
   */
  findOverlappingLiquidated(
    vigenteDesde: Date,
  ): Promise<{ desde: Date; hasta: Date } | null>;
}

/**
 * NullCompensationPeriodLookup — PR-A stub.
 *
 * Always returns null (no liquidated periods exist before PR-B introduces
 * the CompensationPeriod table). Replace with real adapter in PR-B.
 */
export class NullCompensationPeriodLookup implements CompensationPeriodLookupPort {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findOverlappingLiquidated(_vigenteDesde: Date): Promise<{ desde: Date; hasta: Date } | null> {
    return Promise.resolve(null);
  }
}
