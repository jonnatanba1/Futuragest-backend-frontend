/**
 * GetJornadaPolicyTimelineUseCase — returns JornadaPolicy records ordered asc.
 *
 * REQ-GJP-01: chronological list (no filter) — backward-compatible default.
 * R1.5 (T4): execute(opts) — when opts carries a concrete filter (zoneId or
 * operarioId explicitly set), dispatches to findByScope(opts) for a scope-aware
 * read. When opts is absent OR every filter field is undefined, falls back to
 * findTimeline() (all rows) — preserving the legacy global-read contract.
 */

import type {
  JornadaPolicyRepositoryPort,
  JornadaPolicyRecord,
  FindByScopeOptions,
} from '../domain/ports/jornada-policy-repository.port';

export interface GetTimelineOptions extends FindByScopeOptions {}

export class GetJornadaPolicyTimelineUseCase {
  constructor(private readonly policyRepo: JornadaPolicyRepositoryPort) {}

  /**
   * Dispatch rule:
   *   - opts absent                → findTimeline() (all rows)
   *   - opts present but every
   *     filter undefined            → findTimeline() (no filter requested)
   *   - any filter field !== undefined → findByScope(opts) (scope-aware read)
   *
   * Note: empty-string and null are treated as concrete filtered reads (global
   * scope) — only `undefined` means "no filter on this field". The controller
   * is responsible for normalizing `?zoneId=` (empty) → `null` before calling.
   */
  async execute(opts?: GetTimelineOptions): Promise<JornadaPolicyRecord[]> {
    if (opts && (opts.zoneId !== undefined || opts.operarioId !== undefined)) {
      return this.policyRepo.findByScope(opts);
    }
    return this.policyRepo.findTimeline();
  }
}