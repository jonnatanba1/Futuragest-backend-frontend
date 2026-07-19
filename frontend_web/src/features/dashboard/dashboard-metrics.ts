/**
 * Pure helper functions for DashboardPage metrics.
 * No Date.now() inside — all functions receive `now` as a parameter for testability.
 */

import type {
  AttendanceDto,
  JornadaPolicyDto,
  NovedadDto,
  OperarioDto,
} from '@futuragest/contracts';

export type Period = 'today' | '7d' | '30d';

export interface DateRange {
  desde: string; // YYYY-MM-DD inclusive
  hasta: string; // YYYY-MM-DD inclusive
}

// ── Date utilities ────────────────────────────────────────────────────────────

/** Format a Date as a local YYYY-MM-DD string (no UTC conversion). */
function toLocalISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Subtract `days` calendar days from `d` (local). */
function subtractDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() - days);
  return result;
}

/**
 * Compute the inclusive [desde, hasta] date range for the given period.
 * All arithmetic is done in local time so the dates match attendance.date strings.
 */
export function rangeForPeriod(period: Period, now: Date): DateRange {
  const hasta = toLocalISO(now);
  switch (period) {
    case 'today':
      return { desde: hasta, hasta };
    case '7d':
      return { desde: toLocalISO(subtractDays(now, 6)), hasta };
    case '30d':
      return { desde: toLocalISO(subtractDays(now, 29)), hasta };
  }
}

/** Number of calendar days in an inclusive [desde, hasta] range. */
function rangeLengthDays(range: DateRange): number {
  const desde = new Date(`${range.desde}T12:00:00`);
  const hasta = new Date(`${range.hasta}T12:00:00`);
  return Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;
}

/**
 * The immediately preceding period of equal length.
 * E.g. [2026-06-04, 2026-06-10] → [2026-05-28, 2026-06-03].
 * A single-day range ("Hoy") yields yesterday.
 */
export function previousRange(range: DateRange): DateRange {
  const length = rangeLengthDays(range);
  const prevHasta = subtractDays(new Date(`${range.desde}T12:00:00`), 1);
  const prevDesde = subtractDays(prevHasta, length - 1);
  return { desde: toLocalISO(prevDesde), hasta: toLocalISO(prevHasta) };
}

/**
 * Relative percentage delta between current and previous values, rounded.
 * Returns null when previous is 0 — there is no baseline to compare against
 * (avoids Infinity / NaN).
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Attendance filters ────────────────────────────────────────────────────────

/** Keep attendances whose date falls within [range.desde, range.hasta]. */
export function filterByRange(
  attendances: AttendanceDto[],
  range: DateRange,
): AttendanceDto[] {
  return attendances.filter((a) => a.date >= range.desde && a.date <= range.hasta);
}

/** True when `now` formatted as YYYY-MM-DD equals the attendance date. */
export function isToday(a: AttendanceDto, now: Date): boolean {
  return a.date === toLocalISO(now);
}

// ── Group by day ──────────────────────────────────────────────────────────────

export interface DayBucket {
  day: string; // YYYY-MM-DD
  label: string; // DD/MM
  completed: number;
  open: number;
}

/** Aggregate attendances by calendar day, sorted ascending. */
export function groupByDay(attendances: AttendanceDto[], range: DateRange): DayBucket[] {
  const map = new Map<string, DayBucket>();

  // Pre-fill every day in the range so gaps show as 0.
  let cursor = range.desde;
  while (cursor <= range.hasta) {
    const [, month, day] = cursor.split('-');
    map.set(cursor, { day: cursor, label: `${day}/${month}`, completed: 0, open: 0 });
    // advance by 1 day
    const d = new Date(`${cursor}T12:00:00`);
    d.setDate(d.getDate() + 1);
    cursor = toLocalISO(d);
  }

  for (const a of attendances) {
    const bucket = map.get(a.date);
    if (!bucket) continue;
    if (a.completedAt != null) {
      bucket.completed++;
    } else {
      bucket.open++;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

// ── Verification counts ────────────────────────────────────────────────────────

export interface VerificationBreakdown {
  BIOMETRIC: number;
  DEVICE_CREDENTIAL: number;
  NONE: number;
  sin_dato: number;
}

/** Count check-in verification methods across the provided attendances. */
export function verificationCounts(attendances: AttendanceDto[]): VerificationBreakdown {
  const result: VerificationBreakdown = { BIOMETRIC: 0, DEVICE_CREDENTIAL: 0, NONE: 0, sin_dato: 0 };
  for (const a of attendances) {
    const m = a.checkInVerification;
    if (m === 'BIOMETRIC') result.BIOMETRIC++;
    else if (m === 'DEVICE_CREDENTIAL') result.DEVICE_CREDENTIAL++;
    else if (m === 'NONE') result.NONE++;
    else result.sin_dato++;
  }
  return result;
}

// ── Zone counts ───────────────────────────────────────────────────────────────

export interface ZoneBucket {
  zoneId: string;
  count: number;
}

/** Count attendances per zone, sorted descending, capped at topN. */
export function zoneCounts(attendances: AttendanceDto[], topN = 8): ZoneBucket[] {
  const map = new Map<string, number>();
  for (const a of attendances) {
    const key = a.zoneId ?? 'sin-zona';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([zoneId, count]) => ({ zoneId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

// ── Novedad aggregates ────────────────────────────────────────────────────────

export interface NovedadSummary {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
  approvedHours: number; // sum of parseFloat(horasExtra) for APPROVED
}

/**
 * Aggregate novedad counts for those whose createdAt falls in the period.
 * createdAt is an ISO datetime string; we compare only the date portion.
 */
export function novedadAggregates(novedades: NovedadDto[], range: DateRange): NovedadSummary {
  const result: NovedadSummary = { PENDING: 0, APPROVED: 0, REJECTED: 0, approvedHours: 0 };
  for (const n of novedades) {
    // createdAt is ISO datetime — take first 10 chars for YYYY-MM-DD
    const dateStr = n.createdAt.slice(0, 10);
    if (dateStr < range.desde || dateStr > range.hasta) continue;
    if (n.status === 'PENDING') result.PENDING++;
    else if (n.status === 'APPROVED') {
      result.APPROVED++;
      result.approvedHours += parseFloat(n.horasExtra) || 0;
    } else if (n.status === 'REJECTED') result.REJECTED++;
  }
  return result;
}

// ── Cargo counts ──────────────────────────────────────────────────────────────

export interface CargoBucket {
  cargo: string; // display name ('' becomes 'Sin cargo')
  total: number;
  ingresaron: number;
  faltaron: number;
}

/** Count operarios by cargo with today's attendance breakdown, sorted by total descending. */
export function cargoCounts(
  operarios: OperarioDto[],
  attendances: AttendanceDto[],
  todayStr: string,
): CargoBucket[] {
  const presentIds = new Set(
    attendances.filter((a) => a.date === todayStr).map((a) => a.operarioId),
  );
  const map = new Map<string, { total: number; ingresaron: number }>();
  for (const o of operarios) {
    const key = o.cargo?.trim() || 'Sin cargo';
    const entry = map.get(key) ?? { total: 0, ingresaron: 0 };
    entry.total++;
    if (presentIds.has(o.id)) entry.ingresaron++;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([cargo, { total, ingresaron }]) => ({
      cargo,
      total,
      ingresaron,
      faltaron: total - ingresaron,
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Open attendances ──────────────────────────────────────────────────────────

/** Returns up to `limit` open (completedAt == null) attendances sorted by checkInCapturedAt asc. */
export function openAttendances(attendances: AttendanceDto[], limit = 8): AttendanceDto[] {
  return attendances
    .filter((a) => a.completedAt == null)
    .sort((a, b) => {
      const ta = a.checkInCapturedAt ?? '';
      const tb = b.checkInCapturedAt ?? '';
      return ta.localeCompare(tb);
    })
    .slice(0, limit);
}

// ── Absenteeism ───────────────────────────────────────────────────────────────

/**
 * Count of ACTIVE operarios with no attendance row dated `todayStr` (YYYY-MM-DD).
 * Inactive operarios are ignored entirely.
 */
export function absentToday(
  operarios: OperarioDto[],
  attendances: AttendanceDto[],
  todayStr: string,
): number {
  const presentIds = new Set(
    attendances.filter((a) => a.date === todayStr).map((a) => a.operarioId),
  );
  return operarios.filter((o) => o.active && !presentIds.has(o.id)).length;
}

// ── Shift duration ────────────────────────────────────────────────────────────

/**
 * Average shift duration in hours over COMPLETED attendances
 * (checkOutCapturedAt − checkInCapturedAt). Shifts with non-positive or
 * absurd (> 24 h) durations are excluded. Returns null when nothing qualifies.
 */
export function averageShiftHours(attendances: AttendanceDto[]): number | null {
  const durations: number[] = [];
  for (const a of attendances) {
    if (a.completedAt == null || !a.checkInCapturedAt || !a.checkOutCapturedAt) continue;
    const hours =
      (new Date(a.checkOutCapturedAt).getTime() - new Date(a.checkInCapturedAt).getTime()) /
      3_600_000;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
    durations.push(hours);
  }
  if (durations.length === 0) return null;
  return durations.reduce((sum, h) => sum + h, 0) / durations.length;
}

// ── Jornada policy ────────────────────────────────────────────────────────────

/**
 * Resolve the ACTIVE jornada policy: the one with the latest vigenteDesde <= today.
 * vigenteDesde is an ISO datetime — only its date portion is compared.
 * Ties on date are broken by createdAt (append-only timeline → latest wins).
 */
export function activeJornadaPolicy(
  policies: JornadaPolicyDto[],
  now: Date,
): JornadaPolicyDto | null {
  const today = toLocalISO(now);
  let active: JornadaPolicyDto | null = null;
  for (const p of policies) {
    const date = p.vigenteDesde.slice(0, 10);
    if (date > today) continue;
    if (active === null) {
      active = p;
      continue;
    }
    const activeDate = active.vigenteDesde.slice(0, 10);
    if (date > activeDate || (date === activeDate && p.createdAt > active.createdAt)) {
      active = p;
    }
  }
  return active;
}

// ── Late arrivals ─────────────────────────────────────────────────────────────

/**
 * Count attendances on `todayStr` whose check-in time exceeds the policy's
 * horaInicio + toleranciaMin. Returns 0 when there is no active policy or
 * no attendances for today.
 */
export function lateArrivalsCount(
  attendances: AttendanceDto[],
  policy: JornadaPolicyDto | null,
  todayStr: string,
): number {
  if (!policy || !policy.horaInicio) return 0;
  const [hh, mm] = policy.horaInicio.split(':').map(Number);
  const limitMinutes = hh * 60 + mm + (policy.toleranciaMin ?? 0);
  let count = 0;
  for (const a of attendances) {
    if (a.date !== todayStr || !a.checkInCapturedAt) continue;
    const dt = new Date(a.checkInCapturedAt);
    const checkInMinutes = dt.getHours() * 60 + dt.getMinutes();
    if (checkInMinutes > limitMinutes) count++;
  }
  return count;
}
