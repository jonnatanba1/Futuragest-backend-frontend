/**
 * GetJornadaPolicyTimelineUseCase — returns all JornadaPolicy records ordered asc.
 * REQ-GJP-01: chronological list, no filter, global (not scoped).
 */

import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';

export class GetJornadaPolicyTimelineUseCase {
  constructor(private readonly policyRepo: JornadaPolicyRepositoryPort) {}

  execute(): Promise<JornadaPolicyRecord[]> {
    return this.policyRepo.findTimeline();
  }
}
