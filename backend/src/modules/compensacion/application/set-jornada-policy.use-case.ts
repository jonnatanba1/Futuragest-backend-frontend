/**
 * SetJornadaPolicyUseCase — INSERT-only use-case for creating JornadaPolicy records.
 *
 * Validation order (spec §3 REQ-SJP-01–04):
 *   1. horasDiarias range [0.5, 24] — domain validation before any DB call.
 *   2. vigenteDesde does not overlap any already-liquidated CompensationPeriod
 *      (delegates to CompensationPeriodLookupPort — stub in PR-A, real in PR-B).
 *   3. No duplicate vigenteDesde in the current timeline (domain check before INSERT).
 *   4. INSERT via JornadaPolicyRepositoryPort.create (append-only — no UPDATE).
 *
 * APPEND-ONLY: this use-case NEVER calls update or delete on JornadaPolicy. REQ-JP-02.
 */

import { Decimal } from '@prisma/client/runtime/client';
import type { JornadaPolicyRepositoryPort, JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { CompensationPeriodLookupPort } from '../domain/ports/compensation-period-lookup.port';
import {
  JornadaPolicyInvalidHorasError,
  JornadaPolicyOverlapsLiquidatedPeriodError,
  JornadaPolicyDuplicateEffectiveDateError,
} from '../domain/compensacion.errors';

const MIN_HORAS = 0.5;
const MAX_HORAS = 24;

export interface SetJornadaPolicyInput {
  operarioId?: string | null;
  zoneId?: string | null;
  horaInicio: string;
  horaFin: string;
  diasLaborales: number[];
  almuerzoInicio?: string | null;
  almuerzoFin?: string | null;
  desayunoInicio?: string | null;
  desayunoFin?: string | null;
  toleranciaMin?: number;
  horasDiarias: number;
  horasSemanales: number;
  vigenteDesde: string; // YYYY-MM-DD Colombia local
}

export class SetJornadaPolicyUseCase {
  constructor(
    private readonly policyRepo: JornadaPolicyRepositoryPort,
    private readonly periodLookup: CompensationPeriodLookupPort,
  ) {}

  async execute(input: SetJornadaPolicyInput): Promise<JornadaPolicyRecord> {
    const { horasDiarias, vigenteDesde } = input;

    // 1. Validate horasDiarias range [0.5, 24] — domain guard before DB calls
    if (horasDiarias < MIN_HORAS || horasDiarias > MAX_HORAS) {
      throw new JornadaPolicyInvalidHorasError(horasDiarias);
    }

    // Parse vigenteDesde as a Date (UTC midnight for comparison and storage).
    // The date stored in DB is ALWAYS UTC midnight — existsByOperarioZoneVigente
    // relies on this for the equality check (see JornadaPolicyRepository).
    const vigenteDesdeDate = new Date(`${vigenteDesde}T00:00:00Z`);

    // 2. Check overlap with already-liquidated CompensationPeriods
    //    PR-A: NullCompensationPeriodLookup always returns null.
    //    PR-B: real adapter queries the DB.
    const overlapping = await this.periodLookup.findOverlappingClosed(vigenteDesdeDate);
    if (overlapping !== null) {
      throw new JornadaPolicyOverlapsLiquidatedPeriodError(vigenteDesde);
    }

    // 3. Scope-aware duplicate check (R1.4): reject when a row already exists
    //    for the exact (operarioId, zoneId, vigenteDesde) tuple. Replaces the
    //    legacy global `findTimeline()` + `.find()` check.
    const scopeOperarioId = input.operarioId ?? null;
    const scopeZoneId = input.zoneId ?? null;
    const exists = await this.policyRepo.existsByOperarioZoneVigente(
      scopeOperarioId,
      scopeZoneId,
      vigenteDesdeDate,
    );
    if (exists) {
      throw new JornadaPolicyDuplicateEffectiveDateError({
        vigenteDesde,
        operarioId: scopeOperarioId,
        zoneId: scopeZoneId,
      });
    }

    // 4. INSERT — append-only, no update path
    return this.policyRepo.create({
      operarioId: input.operarioId ?? null,
      zoneId: input.zoneId ?? null,
      horaInicio: input.horaInicio,
      horaFin: input.horaFin,
      diasLaborales: input.diasLaborales,
      almuerzoInicio: input.almuerzoInicio ?? null,
      almuerzoFin: input.almuerzoFin ?? null,
      desayunoInicio: input.desayunoInicio ?? null,
      desayunoFin: input.desayunoFin ?? null,
      toleranciaMin: input.toleranciaMin ?? 5,
      horasDiarias: new Decimal(horasDiarias),
      horasSemanales: new Decimal(input.horasSemanales),
      vigenteDesde: vigenteDesdeDate,
    });
  }
}
