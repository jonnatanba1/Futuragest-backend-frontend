/**
 * Compensación de Horas — shared contract types.
 *
 * Hand-written mirrors of the backend response/request DTOs.
 * All Prisma Decimal fields are serialized as strings by the backend
 * (Decimal.toString()) — consumers must NOT parse them as JS floats.
 */

// ─── Disposition union ────────────────────────────────────────────────────────

export type CompensationDisposition = 'CARRY_OVER' | 'PAYROLL_DEDUCTION';

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Mirrors full JornadaPolicyResponseDto from the backend (PR 5 enriched). */
export interface JornadaPolicyDto {
  id: string;
  /** Per-operario override. null = zone-level or global. */
  operarioId: string | null;
  /** Per-zone override. null + operarioId null = global. */
  zoneId: string | null;
  /** HH:mm — shift start (Colombia local). */
  horaInicio: string;
  /** HH:mm — shift end (Colombia local). */
  horaFin: string;
  /** ISO weekday array: [1,2,3,4,5] = Mon-Fri. */
  diasLaborales: number[];
  /** HH:mm — lunch start. null = auto-calculated. */
  almuerzoInicio: string | null;
  /** HH:mm — lunch end. null = auto. */
  almuerzoFin: string | null;
  /** Late arrival tolerance in minutes. Default 5. */
  toleranciaMin: number;
  /** Daily work hours. Prisma Decimal serialized as string. e.g. "8.00" */
  horasDiarias: string;
  /** Weekly work hours. Prisma Decimal serialized as string. e.g. "44.00" */
  horasSemanales: string;
  /** ISO 8601 effective date (Colombia local midnight stored as UTC). */
  vigenteDesde: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Per-day attendance breakdown entry. Mirrors DayBreakdownDto. */
export interface DayBreakdownDto {
  /** YYYY-MM-DD Colombia local date. */
  date: string;
  /** Raw hours worked (no lunch deduction). Decimal string. e.g. "8.50" */
  horasReales: string;
  /** JornadaPolicy hours for this day. Decimal string. e.g. "8.00" */
  jornadaHoras: string;
  /** horasReales − jornadaHoras. Decimal string (can be negative). e.g. "0.50" */
  delta: string;
}

/**
 * Live period balance. Mirrors PeriodBalanceResponseDto.
 * carryIn is the carry-over amount from the previous CARRY_OVER fortnight;
 * saldoHoras = carryIn + creditosHoras − debitosHoras.
 */
export interface PeriodBalanceDto {
  operarioId: string;
  /** YYYY-MM-DD range start (inclusive). */
  desde: string;
  /** YYYY-MM-DD range end (inclusive). */
  hasta: string;
  /** Σ positive deltas (hours). Decimal string. */
  creditosHoras: string;
  /** Σ |negative deltas| (hours). Decimal string. */
  debitosHoras: string;
  /** carryIn from previous CARRY_OVER period (≤ 0). Decimal string. */
  carryIn: string;
  /** carryIn + creditosHoras − debitosHoras. Decimal string. */
  saldoHoras: string;
  breakdown: DayBreakdownDto[];
}

/**
 * Closed compensation period snapshot. Mirrors CompensationPeriodResponseDto.
 * Returned by POST /compensacion/:operarioId/close.
 */
export interface CompensationPeriodDto {
  id: string;
  operarioId: string;
  /** Canonical fortnight identifier. e.g. "2026-05-Q1" */
  periodKey: string;
  desde: string;
  hasta: string;
  creditosHoras: string;
  debitosHoras: string;
  /** carryIn from previous CARRY_OVER period (≤ 0). Decimal string. */
  carryIn: string;
  saldoHoras: string;
  /** Disposition decision at close. null when saldo >= 0 (no action needed). */
  disposition: CompensationDisposition | null;
  approvedByUserId: string | null;
  /** ISO 8601 timestamp — when the close decision was made. */
  decidedAt: string | null;
  /** ISO 8601 timestamp — immutability lock (server time at close). */
  closedAt: string;
  /** Client-provided idempotency token. */
  clientRef: string | null;
  /** ISO 8601 timestamp — when payout was confirmed by HR. Null until confirmed. */
  paidAt: string | null;
  /** Server-generated UUID for payout idempotency. Null until confirmed. */
  payoutRef: string | null;
  /** ISO 8601 timestamp — set when attendance data changes inside this closed period. Null = snapshot is current. */
  divergedAt: string | null;
  createdAt: string;
}

/** Payout calculation for a closed period. Mirrors PeriodPayoutResponseDto. */
export interface PeriodPayoutDto {
  operarioId: string;
  /** Canonical fortnight identifier. e.g. "2026-05-Q1" */
  periodKey: string;
  /** Frozen saldo of the closed period (can be ≤ 0). Decimal string. */
  saldoHoras: string;
  /** Payable base hours (positive saldo only; 0 if saldo ≤ 0). Decimal string. */
  horasBase: string;
  /** Recargo factor applied (1.25 daytime). Decimal string. */
  factorRecargo: string;
  /** horasBase × factorRecargo — payable hours to liquidate. Decimal string. */
  horasPagables: string;
  /** ISO 8601 timestamp — when payout was confirmed by HR. Null until confirmed. */
  paidAt: string | null;
  /** Server-generated UUID for payout idempotency. Null until confirmed. */
  payoutRef: string | null;
}

// ─── Request types ────────────────────────────────────────────────────────────

/** Body for POST /jornada-policy (full CRUD — PR 5). */
export interface CreateJornadaPolicyRequest {
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
  vigenteDesde: string;
}

/** Body for PATCH /jornada-policy/:id (edit existing — PR 5). */
export interface UpdateJornadaPolicyRequest {
  horaInicio?: string;
  horaFin?: string;
  diasLaborales?: number[];
  almuerzoInicio?: string | null;
  almuerzoFin?: string | null;
  toleranciaMin?: number;
  horasDiarias?: number;
  horasSemanales?: number;
  vigenteDesde?: string;
}

// ─── Holiday types ────────────────────────────────────────────────────────────

export type HolidayType = 'FIXED' | 'EMILIANI' | 'EASTER_BASED' | 'MANUAL';

export interface HolidayDto {
  id: string;
  date: string;       // "YYYY-MM-DD"
  name: string;
  type: HolidayType;
  year: number;
  isManual: boolean;
  createdAt: string;
}

// ─── SurchargeRate types ──────────────────────────────────────────────────────

export type SurchargeCategory =
  | 'RECARGO_NOCTURNO'
  | 'HORA_EXTRA_DIURNA'
  | 'HORA_EXTRA_NOCTURNA'
  | 'RECARGO_DOMINICAL_FESTIVO';

export interface SurchargeRateDto {
  id: string;
  category: SurchargeCategory;
  /** Percentage as string (Prisma Decimal). e.g. "90.00" */
  percentage: string;
  /** ISO 8601 effective date. */
  vigenteDesde: string;
  creadoPor: string | null;
  legalRef: string | null;
  createdAt: string;
}

export interface CreateSurchargeRateRequest {
  category: SurchargeCategory;
  percentage: number;
  vigenteDesde: string;
  legalRef?: string | null;
}

// ─── CompensatoryRest types ───────────────────────────────────────────────────

export type CompensatoryType = 'OCCASIONAL' | 'HABITUAL';
export type CompensatoryStatus = 'PENDING' | 'SCHEDULED' | 'TAKEN';

export interface CompensatoryRestDto {
  id: string;
  operarioId: string;
  attendanceId: string;
  month: string;           // "YYYY-MM"
  type: CompensatoryType;
  status: CompensatoryStatus;
  scheduledDate: string | null;
  takenDate: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ScheduleCompensatoryRequest {
  scheduledDate: string;   // "YYYY-MM-DD"
  notes?: string | null;
}

// ─── Enhanced balance types ───────────────────────────────────────────────────

/** Category breakdown from enhanced balance (REQ-009). */
export interface CategoryBreakdownDto {
  horasOrdinariasDiurnas: string;
  horasOrdinariasNocturnas: string;
  horasExtraDiurnas: string;
  horasExtraNocturnas: string;
  horasDominicalesFestivas: string;
  totalHoras: string;
}

/** Monetary surcharge value item. */
export interface SurchargeDetailDto {
  label: string;
  horas: string;
  percentage: string;
  valor: string;
}

export interface ValorRecargosDto {
  items: SurchargeDetailDto[];
  total: string;
}

/** Enhanced period balance with category breakdown + surcharge values. */
export interface EnhancedPeriodBalanceDto extends PeriodBalanceDto {
  categoryBreakdown?: CategoryBreakdownDto | null;
  valorRecargos?: ValorRecargosDto | null;
  tasaDominicalAplicada?: string | null;
}

/** Body for POST /compensacion/:operarioId/close. */
export interface ClosePeriodRequest {
  desde: string;
  hasta: string;
  /** Required when saldoHoras < 0. */
  disposition?: CompensationDisposition | null;
  /** Client-provided idempotency token. */
  clientRef?: string | null;
}

/** Body for POST /compensacion/:operarioId/payout/confirm. */
export interface ConfirmPayoutRequest {
  /** Canonical fortnight identifier. e.g. "2026-05-Q1" */
  periodKey: string;
}
