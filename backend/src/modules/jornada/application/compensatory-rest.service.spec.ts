/**
 * T4.3 RED → GREEN → TRIANGULATE → REFACTOR
 * CompensatoryRestService — unit tests.
 *
 * Covers REQ-006 (CompensatoryRest Tracking):
 *   - 1 Sunday → OCCASIONAL
 *   - 2 Sundays → both OCCASIONAL
 *   - 3 Sundays → all reclassified to HABITUAL
 *   - 2 Sundays + 1 holiday → HABITUAL
 *   - 4+ → all HABITUAL
 *   - Month boundary resets
 *   - Feature-gate: COMPENSATORY_REST_ENABLED
 *   - Non-dominical, non-festivo → no-op
 */

import { Decimal } from '@prisma/client/runtime/client';
import { CompensatoryRestService } from './compensatory-rest.service';

// In-memory stub repository for testing
interface StoredRest {
  operarioId: string;
  attendanceId: string;
  month: string;
  type: 'OCCASIONAL' | 'HABITUAL';
  status: string;
}

class InMemoryCompensatoryRestRepo {
  private records: StoredRest[] = [];

  countByOperarioAndMonth(operarioId: string, month: string): number {
    return this.records.filter((r) => r.operarioId === operarioId && r.month === month).length;
  }

  findByOperarioAndMonth(operarioId: string, month: string): StoredRest[] {
    return this.records.filter((r) => r.operarioId === operarioId && r.month === month);
  }

  findByAttendanceId(attendanceId: string): StoredRest | null {
    return this.records.find((r) => r.attendanceId === attendanceId) ?? null;
  }

  create(record: StoredRest): void {
    this.records.push(record);
  }

  updateType(attendanceId: string, type: 'OCCASIONAL' | 'HABITUAL'): void {
    const record = this.records.find((r) => r.attendanceId === attendanceId);
    if (record) {
      record.type = type;
    }
  }

  getAll(): StoredRest[] {
    return [...this.records];
  }
}

// In-memory stub for AttendanceBreakdown
interface StubBreakdown {
  attendanceId: string;
  esDominical: boolean;
  esFestivo: boolean;
  // Prisma relation: Attendance
  attendance: {
    operarioId: string;
    date: string; // YYYY-MM-DD
  };
}

class InMemoryBreakdownRepo {
  private breakdowns: Map<string, StubBreakdown> = new Map();

  set(breakdown: StubBreakdown): void {
    this.breakdowns.set(breakdown.attendanceId, breakdown);
  }

  async findByAttendanceId(attendanceId: string): Promise<StubBreakdown | null> {
    return this.breakdowns.get(attendanceId) ?? null;
  }
}

// Helpers
function monthFromDate(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

describe('CompensatoryRestService', () => {
  let service: CompensatoryRestService;
  let restRepo: InMemoryCompensatoryRestRepo;
  let breakdownRepo: InMemoryBreakdownRepo;

  beforeEach(() => {
    process.env.COMPENSATORY_REST_ENABLED = 'true';
    restRepo = new InMemoryCompensatoryRestRepo();
    breakdownRepo = new InMemoryBreakdownRepo();
    service = new CompensatoryRestService(breakdownRepo as any, restRepo as any);
  });

  function seedBreakdown(attId: string, operarioId: string, date: string, dominical: boolean, festivo: boolean) {
    breakdownRepo.set({
      attendanceId: attId,
      esDominical: dominical,
      esFestivo: festivo,
      attendance: { operarioId, date },
    });
  }

  function seedExistingRest(operarioId: string, attendanceId: string, month: string, type: 'OCCASIONAL' | 'HABITUAL') {
    restRepo.create({ operarioId, attendanceId, month, type, status: 'PENDING' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-01: Non-dominical, non-festivo → no-op
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-01 — non-dominical weekday → does nothing', async () => {
    seedBreakdown('att-1', 'O1', '2026-06-03', false, false);

    await service.generateIfApplicable('att-1');

    expect(restRepo.getAll()).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-02a: 1 Sunday → OCCASIONAL
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-02a — 1 Sunday worked → OCCASIONAL', async () => {
    seedBreakdown('att-sun1', 'O1', '2026-06-07', true, false);

    await service.generateIfApplicable('att-sun1');

    const records = restRepo.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('OCCASIONAL');
    expect(records[0].operarioId).toBe('O1');
    expect(records[0].month).toBe('2026-06');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-02b: 2 Sundays → both OCCASIONAL
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-02b — 2 Sundays in same month → both OCCASIONAL', async () => {
    seedBreakdown('att-sun1', 'O1', '2026-06-07', true, false);
    seedBreakdown('att-sun2', 'O1', '2026-06-14', true, false);

    await service.generateIfApplicable('att-sun1');
    await service.generateIfApplicable('att-sun2');

    const records = restRepo.getAll();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.type === 'OCCASIONAL')).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-03: 3 Sundays → all HABITUAL (reclassification)
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-03 — 3 Sundays → all reclassified to HABITUAL', async () => {
    seedBreakdown('att-sun1', 'O1', '2026-06-07', true, false);
    seedBreakdown('att-sun2', 'O1', '2026-06-14', true, false);
    seedBreakdown('att-sun3', 'O1', '2026-06-21', true, false);

    // First two are OCCASIONAL initially
    await service.generateIfApplicable('att-sun1');
    await service.generateIfApplicable('att-sun2');

    let records = restRepo.getAll();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.type === 'OCCASIONAL')).toBe(true);

    // Third triggers reclassification
    await service.generateIfApplicable('att-sun3');

    records = restRepo.getAll();
    expect(records).toHaveLength(3);
    // ALL three must now be HABITUAL
    expect(records.every((r) => r.type === 'HABITUAL')).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-04: 2 Sundays + 1 holiday = 3 → HABITUAL
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-04 — 2 Sundays + 1 holiday in same month → HABITUAL', async () => {
    seedBreakdown('att-sun1', 'O1', '2026-06-07', true, false);
    seedBreakdown('att-sun2', 'O1', '2026-06-14', true, false);
    seedBreakdown('att-hol1', 'O1', '2026-06-29', false, true); // holiday (St. Peter and Paul)

    await service.generateIfApplicable('att-sun1');
    await service.generateIfApplicable('att-sun2');
    await service.generateIfApplicable('att-hol1');

    const records = restRepo.getAll();
    expect(records).toHaveLength(3);
    expect(records.every((r) => r.type === 'HABITUAL')).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-05: 4+ Sundays → all HABITUAL
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-05 — 4 Sundays → all HABITUAL (already reclassified at 3rd, 4th is HABITUAL directly)', async () => {
    seedBreakdown('att-sun1', 'O1', '2026-06-07', true, false);
    seedBreakdown('att-sun2', 'O1', '2026-06-14', true, false);
    seedBreakdown('att-sun3', 'O1', '2026-06-21', true, false);
    seedBreakdown('att-sun4', 'O1', '2026-06-28', true, false);

    await service.generateIfApplicable('att-sun1');
    await service.generateIfApplicable('att-sun2');
    await service.generateIfApplicable('att-sun3');
    await service.generateIfApplicable('att-sun4');

    const records = restRepo.getAll();
    expect(records).toHaveLength(4);
    expect(records.every((r) => r.type === 'HABITUAL')).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-06: Month boundary resets count
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-06 — month boundary resets: 2 Sundays in June, 2 in July → all OCCASIONAL', async () => {
    // June
    seedBreakdown('att-jun1', 'O1', '2026-06-07', true, false);
    seedBreakdown('att-jun2', 'O1', '2026-06-14', true, false);
    // July
    seedBreakdown('att-jul1', 'O1', '2026-07-05', true, false);
    seedBreakdown('att-jul2', 'O1', '2026-07-12', true, false);

    await service.generateIfApplicable('att-jun1');
    await service.generateIfApplicable('att-jun2');
    await service.generateIfApplicable('att-jul1');
    await service.generateIfApplicable('att-jul2');

    const records = restRepo.getAll();
    expect(records).toHaveLength(4);
    expect(records.every((r) => r.type === 'OCCASIONAL')).toBe(true);

    const juneRecords = records.filter((r) => r.month === '2026-06');
    const julyRecords = records.filter((r) => r.month === '2026-07');
    expect(juneRecords).toHaveLength(2);
    expect(julyRecords).toHaveLength(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-07: Feature-gate OFF → no-op
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-07 — COMPENSATORY_REST_ENABLED=false → no-op', async () => {
    process.env.COMPENSATORY_REST_ENABLED = 'false'; // flag OFF
    const offService = new CompensatoryRestService(
      breakdownRepo as any,
      restRepo as any,
    );

    seedBreakdown('att-sun1', 'O1', '2026-06-07', true, false);
    await offService.generateIfApplicable('att-sun1');

    expect(restRepo.getAll()).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-08: Different operarios — per-operario counting
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-08 — per-operario: O1 has 3 Sundays (HABITUAL), O2 has 1 (OCCASIONAL)', async () => {
    seedBreakdown('att-o1-sun1', 'O1', '2026-06-07', true, false);
    seedBreakdown('att-o1-sun2', 'O1', '2026-06-14', true, false);
    seedBreakdown('att-o1-sun3', 'O1', '2026-06-21', true, false);
    seedBreakdown('att-o2-sun1', 'O2', '2026-06-07', true, false);

    await service.generateIfApplicable('att-o1-sun1');
    await service.generateIfApplicable('att-o1-sun2');
    await service.generateIfApplicable('att-o1-sun3');
    await service.generateIfApplicable('att-o2-sun1');

    const o1Records = restRepo.getAll().filter((r) => r.operarioId === 'O1');
    const o2Records = restRepo.getAll().filter((r) => r.operarioId === 'O2');

    expect(o1Records).toHaveLength(3);
    expect(o1Records.every((r) => r.type === 'HABITUAL')).toBe(true);
    expect(o2Records).toHaveLength(1);
    expect(o2Records[0].type).toBe('OCCASIONAL');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RC-09: Idempotent — already has compensatory rest for this attendance
  // ═══════════════════════════════════════════════════════════════════════════

  it('RC-09 — idempotent: calling twice for same attendance does not duplicate', async () => {
    seedBreakdown('att-sun1', 'O1', '2026-06-07', true, false);

    await service.generateIfApplicable('att-sun1');
    await service.generateIfApplicable('att-sun1'); // second call

    const records = restRepo.getAll();
    expect(records).toHaveLength(1); // NOT 2
  });
});
