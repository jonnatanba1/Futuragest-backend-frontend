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

    // Parse vigenteDesde as a Date (UTC midnight for comparison)
    const vigenteDesdeDate = new Date(`${vigenteDesde}T00:00:00Z`);
    const vigenteDesdeStr = vigenteDesde; // keep for duplicate check

    // 2. Check overlap with already-liquidated CompensationPeriods
    //    PR-A: NullCompensationPeriodLookup always returns null.
    //    PR-B: real adapter queries the DB.
    const overlapping = await this.periodLookup.findOverlappingClosed(vigenteDesdeDate);
    if (overlapping !== null) {
      throw new JornadaPolicyOverlapsLiquidatedPeriodError(vigenteDesde);
    }

    // 3. Check for duplicate vigenteDesde in current timeline (domain check before INSERT)
    const timeline = await this.policyRepo.findTimeline();
    const duplicate = timeline.find((p) => {
      const pDateStr = p.vigenteDesde.toISOString().slice(0, 10);
      return pDateStr === vigenteDesdeStr;
    });
    if (duplicate) {
      throw new JornadaPolicyDuplicateEffectiveDateError(vigenteDesde);
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
      toleranciaMin: input.toleranciaMin ?? 5,
      horasDiarias: new Decimal(horasDiarias),
      horasSemanales: new Decimal(input.horasSemanales),
      vigenteDesde: vigenteDesdeDate,
    });
  }
}
