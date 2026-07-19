import { describe, expect, it } from 'vitest';
import type {
  AttendanceDto,
  JornadaPolicyDto,
  NovedadDto,
  OperarioDto,
} from '@futuragest/contracts';
import {
  absentToday,
  activeJornadaPolicy,
  averageShiftHours,
  cargoCounts,
  filterByRange,
  groupByDay,
  novedadAggregates,
  openAttendances,
  percentDelta,
  previousRange,
  rangeForPeriod,
  verificationCounts,
  zoneCounts,
} from './dashboard-metrics';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAttendance(overrides: Partial<AttendanceDto> = {}): AttendanceDto {
  return {
    id: 'att-1',
    supervisorId: 'sup-1',
    operarioId: 'op-1',
    zoneId: 'zone-1',
    date: '2026-06-10',
    checkInCapturedAt: '2026-06-10T08:00:00Z',
    checkInReceivedAt: '2026-06-10T08:00:01Z',
    checkInLat: 0,
    checkInLng: 0,
    checkInAccuracy: null,
    checkOutCapturedAt: null,
    checkOutReceivedAt: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracy: null,
    checkInPhotoKey: null,
    checkOutPhotoKey: null,
    checkInVerification: null,
    checkOutVerification: null,
    clientRef: 'ref-1',
    checkOutClientRef: null,
    completedAt: null,
    createdAt: '2026-06-10T08:00:01Z',
    updatedAt: '2026-06-10T08:00:01Z',
    ...overrides,
  };
}

function makeNovedad(overrides: Partial<NovedadDto> = {}): NovedadDto {
  return {
    id: 'nov-1',
    attendanceId: 'att-1',
    supervisorId: 'sup-1',
    zoneId: 'zone-1',
    tipoNovedad: 'HORAS_EXTRA',
    horasExtra: '2.00',
    minutosTarde: null,
    motivo: null,
    status: 'PENDING',
    clientRef: null,
    approvedByUserId: null,
    decidedAt: null,
    decisionVerification: null,
    rejectionReason: null,
    createdAt: '2026-06-10T09:00:00Z',
    updatedAt: '2026-06-10T09:00:00Z',
    ...overrides,
  };
}

function makeOperario(overrides: Partial<OperarioDto> = {}): OperarioDto {
  return {
    id: 'op-1',
    fullName: 'Operario Uno',
    documento: '12345678',
    supervisorId: 'sup-1',
    cargo: 'Barrido',
    active: true,
    deactivatedAt: null,
    areaId: null,
    areaName: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── rangeForPeriod ────────────────────────────────────────────────────────────

describe('rangeForPeriod', () => {
  const now = new Date(2026, 5, 10); // June 10 2026 local

  it('today → desde and hasta equal today', () => {
    const r = rangeForPeriod('today', now);
    expect(r.desde).toBe('2026-06-10');
    expect(r.hasta).toBe('2026-06-10');
  });

  it('7d → desde is 6 days before today', () => {
    const r = rangeForPeriod('7d', now);
    expect(r.desde).toBe('2026-06-04');
    expect(r.hasta).toBe('2026-06-10');
  });

  it('30d → desde is 29 days before today', () => {
    const r = rangeForPeriod('30d', now);
    expect(r.desde).toBe('2026-05-12');
    expect(r.hasta).toBe('2026-06-10');
  });
});

// ── previousRange ─────────────────────────────────────────────────────────────

describe('previousRange', () => {
  it('7d range → preceding 7 days', () => {
    const prev = previousRange({ desde: '2026-06-04', hasta: '2026-06-10' });
    expect(prev).toEqual({ desde: '2026-05-28', hasta: '2026-06-03' });
  });

  it('30d range → preceding 30 days', () => {
    const prev = previousRange({ desde: '2026-05-12', hasta: '2026-06-10' });
    expect(prev).toEqual({ desde: '2026-04-12', hasta: '2026-05-11' });
  });

  it('Hoy (single day) → yesterday', () => {
    const prev = previousRange({ desde: '2026-06-10', hasta: '2026-06-10' });
    expect(prev).toEqual({ desde: '2026-06-09', hasta: '2026-06-09' });
  });

  it('crosses month boundaries correctly', () => {
    const prev = previousRange({ desde: '2026-06-01', hasta: '2026-06-07' });
    expect(prev).toEqual({ desde: '2026-05-25', hasta: '2026-05-31' });
  });

  it('crosses year boundaries correctly', () => {
    const prev = previousRange({ desde: '2026-01-01', hasta: '2026-01-01' });
    expect(prev).toEqual({ desde: '2025-12-31', hasta: '2025-12-31' });
  });
});

// ── percentDelta ──────────────────────────────────────────────────────────────

describe('percentDelta', () => {
  it('computes positive delta', () => {
    expect(percentDelta(12, 10)).toBe(20);
  });

  it('computes negative delta', () => {
    expect(percentDelta(8, 10)).toBe(-20);
  });

  it('returns 0 when values are equal', () => {
    expect(percentDelta(5, 5)).toBe(0);
  });

  it('returns null when previous is 0 (no Infinity)', () => {
    expect(percentDelta(5, 0)).toBeNull();
    expect(percentDelta(0, 0)).toBeNull();
  });

  it('rounds to nearest integer', () => {
    expect(percentDelta(1, 3)).toBe(-67);
  });
});

// ── filterByRange ─────────────────────────────────────────────────────────────

describe('filterByRange', () => {
  const range = { desde: '2026-06-05', hasta: '2026-06-10' };

  it('keeps attendances within range (inclusive)', () => {
    const inside1 = makeAttendance({ id: 'a1', date: '2026-06-05' });
    const inside2 = makeAttendance({ id: 'a2', date: '2026-06-10' });
    const before = makeAttendance({ id: 'a3', date: '2026-06-04' });
    const after = makeAttendance({ id: 'a4', date: '2026-06-11' });

    const result = filterByRange([inside1, inside2, before, after], range);
    expect(result.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('returns empty array when no attendances match', () => {
    const old = makeAttendance({ date: '2026-01-01' });
    expect(filterByRange([old], range)).toHaveLength(0);
  });
});

// ── groupByDay ────────────────────────────────────────────────────────────────

describe('groupByDay', () => {
  it('fills every day in range even if no attendances on that day', () => {
    const range = { desde: '2026-06-08', hasta: '2026-06-10' };
    const buckets = groupByDay([], range);
    expect(buckets).toHaveLength(3);
    expect(buckets.map((b) => b.day)).toEqual(['2026-06-08', '2026-06-09', '2026-06-10']);
    expect(buckets.every((b) => b.completed === 0 && b.open === 0)).toBe(true);
  });

  it('counts completed vs open correctly', () => {
    const range = { desde: '2026-06-10', hasta: '2026-06-10' };
    const atts = [
      makeAttendance({ id: 'a1', completedAt: '2026-06-10T17:00:00Z' }),
      makeAttendance({ id: 'a2', completedAt: null }),
      makeAttendance({ id: 'a3', completedAt: null }),
    ];
    const [bucket] = groupByDay(atts, range);
    expect(bucket.completed).toBe(1);
    expect(bucket.open).toBe(2);
  });

  it('sorts buckets ascending by date', () => {
    const range = { desde: '2026-06-05', hasta: '2026-06-07' };
    const atts = [
      makeAttendance({ id: 'a1', date: '2026-06-07' }),
      makeAttendance({ id: 'a2', date: '2026-06-05' }),
    ];
    const buckets = groupByDay(atts, range);
    expect(buckets.map((b) => b.day)).toEqual(['2026-06-05', '2026-06-06', '2026-06-07']);
  });

  it('formats labels as DD/MM', () => {
    const range = { desde: '2026-06-10', hasta: '2026-06-10' };
    const [b] = groupByDay([], range);
    expect(b.label).toBe('10/06');
  });
});

// ── verificationCounts ────────────────────────────────────────────────────────

describe('verificationCounts', () => {
  it('counts each method and null as sin_dato', () => {
    const atts = [
      makeAttendance({ checkInVerification: 'BIOMETRIC' }),
      makeAttendance({ checkInVerification: 'BIOMETRIC' }),
      makeAttendance({ checkInVerification: 'DEVICE_CREDENTIAL' }),
      makeAttendance({ checkInVerification: 'NONE' }),
      makeAttendance({ checkInVerification: null }),
    ];
    const result = verificationCounts(atts);
    expect(result.BIOMETRIC).toBe(2);
    expect(result.DEVICE_CREDENTIAL).toBe(1);
    expect(result.NONE).toBe(1);
    expect(result.sin_dato).toBe(1);
  });

  it('returns all zeros for empty input', () => {
    const result = verificationCounts([]);
    expect(result).toEqual({ BIOMETRIC: 0, DEVICE_CREDENTIAL: 0, NONE: 0, sin_dato: 0 });
  });
});

// ── zoneCounts ────────────────────────────────────────────────────────────────

describe('zoneCounts', () => {
  it('counts by zoneId and sorts descending', () => {
    const atts = [
      makeAttendance({ zoneId: 'z1' }),
      makeAttendance({ zoneId: 'z1' }),
      makeAttendance({ zoneId: 'z2' }),
      makeAttendance({ zoneId: 'z3' }),
      makeAttendance({ zoneId: 'z3' }),
      makeAttendance({ zoneId: 'z3' }),
    ];
    const result = zoneCounts(atts);
    expect(result[0]).toEqual({ zoneId: 'z3', count: 3 });
    expect(result[1]).toEqual({ zoneId: 'z1', count: 2 });
    expect(result[2]).toEqual({ zoneId: 'z2', count: 1 });
  });

  it('caps at topN', () => {
    const atts = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({ id: `a${i}`, zoneId: `z${i}` }),
    );
    const result = zoneCounts(atts, 5);
    expect(result).toHaveLength(5);
  });

  it('falls back zoneId null to sin-zona', () => {
    const att = makeAttendance({ zoneId: undefined as unknown as string });
    const result = zoneCounts([att]);
    expect(result[0].zoneId).toBe('sin-zona');
  });
});

// ── novedadAggregates ─────────────────────────────────────────────────────────

describe('novedadAggregates', () => {
  const range = { desde: '2026-06-05', hasta: '2026-06-10' };

  it('counts statuses and sums approved hours', () => {
    const novs = [
      makeNovedad({ status: 'PENDING', createdAt: '2026-06-06T00:00:00Z' }),
      makeNovedad({ status: 'APPROVED', horasExtra: '2.50', createdAt: '2026-06-07T00:00:00Z' }),
      makeNovedad({ status: 'APPROVED', horasExtra: '1.00', createdAt: '2026-06-08T00:00:00Z' }),
      makeNovedad({ status: 'REJECTED', createdAt: '2026-06-09T00:00:00Z' }),
    ];
    const result = novedadAggregates(novs, range);
    expect(result.PENDING).toBe(1);
    expect(result.APPROVED).toBe(2);
    expect(result.REJECTED).toBe(1);
    expect(result.approvedHours).toBeCloseTo(3.5);
  });

  it('excludes novedades outside the date range', () => {
    const outside = makeNovedad({ status: 'APPROVED', horasExtra: '5.00', createdAt: '2026-06-04T00:00:00Z' });
    const result = novedadAggregates([outside], range);
    expect(result.APPROVED).toBe(0);
    expect(result.approvedHours).toBe(0);
  });

  it('handles empty list', () => {
    const result = novedadAggregates([], range);
    expect(result).toEqual({ PENDING: 0, APPROVED: 0, REJECTED: 0, approvedHours: 0 });
  });
});

// ── cargoCounts ───────────────────────────────────────────────────────────────

describe('cargoCounts', () => {
  const TODAY = '2026-06-10';

  it('groups operarios by cargo sorted by total descending', () => {
    const ops = [
      makeOperario({ id: 'o1', cargo: 'Barrido' }),
      makeOperario({ id: 'o2', cargo: 'Barrido' }),
      makeOperario({ id: 'o3', cargo: 'Recolección' }),
    ];
    const atts = [makeAttendance({ id: 'a1', operarioId: 'o1', date: TODAY })];
    const result = cargoCounts(ops, atts, TODAY);
    expect(result[0]).toEqual({ cargo: 'Barrido', total: 2, ingresaron: 1, faltaron: 1 });
    expect(result[1]).toEqual({ cargo: 'Recolección', total: 1, ingresaron: 0, faltaron: 1 });
  });

  it('counts ingresaron only for today attendances', () => {
    const ops = [makeOperario({ id: 'o1', cargo: 'Barrido' })];
    const atts = [makeAttendance({ operarioId: 'o1', date: '2026-06-09' })]; // yesterday
    const result = cargoCounts(ops, atts, TODAY);
    expect(result[0]).toEqual({ cargo: 'Barrido', total: 1, ingresaron: 0, faltaron: 1 });
  });

  it('maps empty string cargo to "Sin cargo"', () => {
    const ops = [makeOperario({ cargo: '' }), makeOperario({ id: 'o2', cargo: '   ' })];
    const result = cargoCounts(ops, [], TODAY);
    expect(result[0].cargo).toBe('Sin cargo');
    expect(result[0].total).toBe(2);
    expect(result[0].ingresaron).toBe(0);
  });

  it('returns empty for empty list', () => {
    expect(cargoCounts([], [], TODAY)).toHaveLength(0);
  });
});

// ── openAttendances ───────────────────────────────────────────────────────────

describe('openAttendances', () => {
  it('returns only completedAt == null, up to limit', () => {
    const atts = [
      makeAttendance({ id: 'a1', completedAt: null, checkInCapturedAt: '2026-06-10T06:00:00Z' }),
      makeAttendance({ id: 'a2', completedAt: '2026-06-10T17:00:00Z' }),
      makeAttendance({ id: 'a3', completedAt: null, checkInCapturedAt: '2026-06-10T07:00:00Z' }),
    ];
    const result = openAttendances(atts, 8);
    expect(result.map((a) => a.id)).toEqual(['a1', 'a3']);
  });

  it('sorts by checkInCapturedAt ascending', () => {
    const atts = [
      makeAttendance({ id: 'late', completedAt: null, checkInCapturedAt: '2026-06-10T10:00:00Z' }),
      makeAttendance({ id: 'early', completedAt: null, checkInCapturedAt: '2026-06-10T06:00:00Z' }),
    ];
    const result = openAttendances(atts, 8);
    expect(result[0].id).toBe('early');
  });

  it('caps at limit', () => {
    const atts = Array.from({ length: 12 }, (_, i) =>
      makeAttendance({ id: `a${i}`, completedAt: null }),
    );
    expect(openAttendances(atts, 8)).toHaveLength(8);
  });
});

// ── absentToday ───────────────────────────────────────────────────────────────

describe('absentToday', () => {
  const today = '2026-06-10';

  it('counts active operarios without attendance today', () => {
    const ops = [
      makeOperario({ id: 'op-1' }),
      makeOperario({ id: 'op-2' }),
      makeOperario({ id: 'op-3' }),
    ];
    const atts = [makeAttendance({ operarioId: 'op-1', date: today })];
    expect(absentToday(ops, atts, today)).toBe(2);
  });

  it('ignores inactive operarios entirely', () => {
    const ops = [
      makeOperario({ id: 'op-1', active: true }),
      makeOperario({ id: 'op-2', active: false }),
      makeOperario({ id: 'op-3', active: false }),
    ];
    expect(absentToday(ops, [], today)).toBe(1);
  });

  it('does not count attendance on another date as presence', () => {
    const ops = [makeOperario({ id: 'op-1' })];
    const atts = [makeAttendance({ operarioId: 'op-1', date: '2026-06-09' })];
    expect(absentToday(ops, atts, today)).toBe(1);
  });

  it('counts an operario with multiple attendance rows today only once', () => {
    const ops = [makeOperario({ id: 'op-1' }), makeOperario({ id: 'op-2' })];
    const atts = [
      makeAttendance({ id: 'a1', operarioId: 'op-1', date: today }),
      makeAttendance({ id: 'a2', operarioId: 'op-1', date: today }),
    ];
    expect(absentToday(ops, atts, today)).toBe(1);
  });

  it('returns 0 when everyone checked in or there are no operarios', () => {
    const ops = [makeOperario({ id: 'op-1' })];
    const atts = [makeAttendance({ operarioId: 'op-1', date: today })];
    expect(absentToday(ops, atts, today)).toBe(0);
    expect(absentToday([], [], today)).toBe(0);
  });
});

// ── averageShiftHours ─────────────────────────────────────────────────────────

describe('averageShiftHours', () => {
  function completedShift(id: string, checkIn: string, checkOut: string) {
    return makeAttendance({
      id,
      checkInCapturedAt: checkIn,
      checkOutCapturedAt: checkOut,
      completedAt: checkOut,
    });
  }

  it('averages completed shift durations in hours', () => {
    const atts = [
      completedShift('a1', '2026-06-10T08:00:00Z', '2026-06-10T16:00:00Z'), // 8h
      completedShift('a2', '2026-06-09T08:00:00Z', '2026-06-09T18:00:00Z'), // 10h
    ];
    expect(averageShiftHours(atts)).toBeCloseTo(9);
  });

  it('ignores open (not completed) attendances', () => {
    const atts = [
      completedShift('a1', '2026-06-10T08:00:00Z', '2026-06-10T16:00:00Z'),
      makeAttendance({ id: 'a2', completedAt: null, checkOutCapturedAt: null }),
    ];
    expect(averageShiftHours(atts)).toBeCloseTo(8);
  });

  it('excludes negative durations (checkOut before checkIn)', () => {
    const atts = [
      completedShift('a1', '2026-06-10T16:00:00Z', '2026-06-10T08:00:00Z'),
      completedShift('a2', '2026-06-10T08:00:00Z', '2026-06-10T14:00:00Z'), // 6h
    ];
    expect(averageShiftHours(atts)).toBeCloseTo(6);
  });

  it('excludes absurd durations over 24h', () => {
    const atts = [
      completedShift('a1', '2026-06-08T08:00:00Z', '2026-06-10T08:00:00Z'), // 48h
      completedShift('a2', '2026-06-10T08:00:00Z', '2026-06-10T12:00:00Z'), // 4h
    ];
    expect(averageShiftHours(atts)).toBeCloseTo(4);
  });

  it('returns null when no completed shift qualifies', () => {
    expect(averageShiftHours([])).toBeNull();
    expect(averageShiftHours([makeAttendance({ completedAt: null })])).toBeNull();
    expect(
      averageShiftHours([
        completedShift('a1', '2026-06-10T16:00:00Z', '2026-06-10T08:00:00Z'),
      ]),
    ).toBeNull();
  });
});

// ── activeJornadaPolicy ───────────────────────────────────────────────────────

describe('activeJornadaPolicy', () => {
  const now = new Date(2026, 5, 10); // June 10 2026 local

  function makePolicy(overrides: Partial<JornadaPolicyDto> = {}): JornadaPolicyDto {
    return {
      id: 'pol-1',
      operarioId: null,
      zoneId: null,
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      almuerzoInicio: '09:45',
      almuerzoFin: '10:15',
      desayunoInicio: null,
      desayunoFin: null,
      toleranciaMin: 5,
      horasDiarias: '8.00',
      horasSemanales: '44.00',
      vigenteDesde: '2026-01-01T05:00:00Z',
      createdAt: '2025-12-15T00:00:00Z',
      ...overrides,
    };
  }

  it('picks the policy with the latest vigenteDesde <= today', () => {
    const policies = [
      makePolicy({ id: 'old', vigenteDesde: '2025-01-01T05:00:00Z' }),
      makePolicy({ id: 'current', vigenteDesde: '2026-06-01T05:00:00Z' }),
    ];
    expect(activeJornadaPolicy(policies, now)?.id).toBe('current');
  });

  it('ignores policies effective in the future', () => {
    const policies = [
      makePolicy({ id: 'current', vigenteDesde: '2026-01-01T05:00:00Z' }),
      makePolicy({ id: 'future', vigenteDesde: '2026-07-01T05:00:00Z' }),
    ];
    expect(activeJornadaPolicy(policies, now)?.id).toBe('current');
  });

  it('returns null when there are no applicable policies', () => {
    expect(activeJornadaPolicy([], now)).toBeNull();
    expect(
      activeJornadaPolicy([makePolicy({ vigenteDesde: '2027-01-01T05:00:00Z' })], now),
    ).toBeNull();
  });

  it('breaks vigenteDesde date ties by latest createdAt', () => {
    const policies = [
      makePolicy({ id: 'first', vigenteDesde: '2026-06-01T05:00:00Z', createdAt: '2026-05-01T00:00:00Z' }),
      makePolicy({ id: 'second', vigenteDesde: '2026-06-01T05:00:00Z', createdAt: '2026-05-02T00:00:00Z' }),
    ];
    expect(activeJornadaPolicy(policies, now)?.id).toBe('second');
  });
});
