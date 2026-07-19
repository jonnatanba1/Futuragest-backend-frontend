/**
 * Compensacion module — OpenAPI response DTO classes.
 *
 * Used for Swagger schema generation. Decimals are serialized as strings
 * (Prisma Decimal.toString()) — API consumers must parse as decimal, not float.
 */

import { ApiProperty } from '@nestjs/swagger';
import type { CompensationDisposition } from '../domain/ports/compensation-period-repository.port';

// ─── GET /jornada-policy ──────────────────────────────────────────────────────

export class JornadaPolicyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  operarioId!: string | null;

  @ApiProperty({ nullable: true })
  zoneId!: string | null;

  @ApiProperty({ example: '07:00' })
  horaInicio!: string;

  @ApiProperty({ example: '17:00' })
  horaFin!: string;

  @ApiProperty({ isArray: true, type: Number, example: [1, 2, 3, 4, 5] })
  diasLaborales!: number[];

  @ApiProperty({ nullable: true })
  almuerzoInicio!: string | null;

  @ApiProperty({ nullable: true })
  almuerzoFin!: string | null;

  @ApiProperty({ nullable: true })
  desayunoInicio!: string | null;

  @ApiProperty({ nullable: true })
  desayunoFin!: string | null;

  @ApiProperty({ example: 5 })
  toleranciaMin!: number;

  @ApiProperty({ description: 'Daily work hours. Prisma Decimal serialized as string.', example: '8.00' })
  horasDiarias!: string;

  @ApiProperty({ description: 'Weekly work hours. Prisma Decimal serialized as string.', example: '40.00' })
  horasSemanales!: string;

  @ApiProperty({ description: 'ISO 8601 — effective date (Colombia local midnight stored as UTC)' })
  vigenteDesde!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;
}

// ─── Per-day breakdown entry ──────────────────────────────────────────────────

export class DayBreakdownDto {
  @ApiProperty({ description: 'YYYY-MM-DD Colombia local date' })
  date!: string;

  @ApiProperty({ description: 'Raw hours worked (no lunch deduction). Decimal string.', example: '8.50' })
  horasReales!: string;

  @ApiProperty({ description: 'Net hours worked (lunch/breakfast deducted). Present when attendance has been classified.', required: false, example: '7.50' })
  horasTrabajadas?: string;

  @ApiProperty({ description: 'JornadaPolicy hours for this day. Decimal string.', example: '8.00' })
  jornadaHoras!: string;

  @ApiProperty({ description: 'hours worked (net when available, else raw) - jornadaHoras. Decimal string.', example: '0.50' })
  delta!: string;
}

// ─── POST /compensacion/:operarioId/close ─────────────────────────────────────

export class CompensationPeriodResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  operarioId!: string;

  @ApiProperty({ description: 'Canonical fortnight identifier e.g. "2026-05-Q1"' })
  periodKey!: string;

  @ApiProperty({ description: 'YYYY-MM-DD Colombia local (inclusive)' })
  desde!: string;

  @ApiProperty({ description: 'YYYY-MM-DD Colombia local (inclusive)' })
  hasta!: string;

  @ApiProperty({ description: 'Σ positive deltas (hours). Decimal string.', example: '0.75' })
  creditosHoras!: string;

  @ApiProperty({ description: 'Σ |negative deltas| (hours). Decimal string.', example: '1.00' })
  debitosHoras!: string;

  @ApiProperty({ description: 'carryIn from previous CARRY_OVER period (≤ 0). Decimal string.', example: '0.00' })
  carryIn!: string;

  @ApiProperty({ description: 'carryIn + creditos - debitos. Decimal string.', example: '-0.50' })
  saldoHoras!: string;

  @ApiProperty({
    description: 'Disposition decision at close. Null when saldo >= 0 (no action needed).',
    enum: ['CARRY_OVER', 'PAYROLL_DEDUCTION'],
    nullable: true,
    example: 'CARRY_OVER',
  })
  disposition!: CompensationDisposition | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  approvedByUserId!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp — when the close decision was made', nullable: true })
  decidedAt!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp — immutability lock (server time at close)' })
  closedAt!: string;

  @ApiProperty({ description: 'Client-provided idempotency token', nullable: true })
  clientRef!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp — when payout was confirmed by HR. Null until confirmed.', nullable: true })
  paidAt!: string | null;

  @ApiProperty({ description: 'Server-generated UUID for payout idempotency. Null until confirmed.', nullable: true })
  payoutRef!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp — set when attendance data changes inside this closed period. Null = snapshot is current.', nullable: true })
  divergedAt!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;
}

// ─── Category breakdown (REQ-009) ──────────────────────────────────────────

export class CategoryBreakdownDto {
  @ApiProperty({ description: 'Ordinary diurnal hours. Decimal string.', example: '40.00' })
  horasOrdinariasDiurnas!: string;

  @ApiProperty({ description: 'Ordinary nocturnal hours. Decimal string.', example: '5.00' })
  horasOrdinariasNocturnas!: string;

  @ApiProperty({ description: 'Extra diurnal hours. Decimal string.', example: '2.50' })
  horasExtraDiurnas!: string;

  @ApiProperty({ description: 'Extra nocturnal hours. Decimal string.', example: '0.00' })
  horasExtraNocturnas!: string;

  @ApiProperty({ description: 'Sunday + holiday hours. Decimal string.', example: '8.00' })
  horasDominicalesFestivas!: string;
}

// ─── GET /compensacion/:operarioId ────────────────────────────────────────────

export class PeriodBalanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  operarioId!: string;

  @ApiProperty({ description: 'YYYY-MM-DD range start (inclusive)' })
  desde!: string;

  @ApiProperty({ description: 'YYYY-MM-DD range end (inclusive)' })
  hasta!: string;

  @ApiProperty({ description: 'Σ positive deltas (hours). Decimal string.', example: '0.75' })
  creditosHoras!: string;

  @ApiProperty({ description: 'Σ |negative deltas| (hours). Decimal string.', example: '1.00' })
  debitosHoras!: string;

  @ApiProperty({ description: 'carryIn from previous CARRY_OVER period (≤ 0). Decimal string.', example: '0.00' })
  carryIn!: string;

  @ApiProperty({ description: 'carryIn + creditos - debitos. Decimal string.', example: '-0.25' })
  saldoHoras!: string;

  @ApiProperty({ type: () => DayBreakdownDto, isArray: true })
  breakdown!: DayBreakdownDto[];

  @ApiProperty({ required: false, type: Boolean })
  isClosed?: boolean;

  @ApiProperty({ required: false, enum: ['CARRY_OVER', 'PAYROLL_DEDUCTION'], nullable: true })
  disposition?: 'CARRY_OVER' | 'PAYROLL_DEDUCTION' | null;

  @ApiProperty({ required: false, nullable: true })
  paidAt?: string | null;

  @ApiProperty({ required: false, nullable: true })
  payoutRef?: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp — set when attendance data changes inside this closed period.', required: false, nullable: true })
  divergedAt?: string | null;

  @ApiProperty({ description: 'Aggregated category breakdown from AttendanceBreakdown data. Only when enhanced=true.', required: false })
  categoryBreakdown?: CategoryBreakdownDto;
}

// ─── GET /compensacion/:operarioId/payout ─────────────────────────────────────

export class PeriodPayoutResponseDto {
  @ApiProperty({ format: 'uuid' })
  operarioId!: string;

  @ApiProperty({ description: 'Canonical fortnight identifier e.g. "2026-05-Q1"' })
  periodKey!: string;

  @ApiProperty({ description: 'Frozen saldo of the closed period (can be ≤ 0). Decimal string.', example: '8.00' })
  saldoHoras!: string;

  @ApiProperty({ description: 'Payable base hours (positive saldo only; 0 if saldo ≤ 0). Decimal string.', example: '8.00' })
  horasBase!: string;

  @ApiProperty({ description: 'Recargo factor applied (1.25 daytime). Decimal string.', example: '1.25' })
  factorRecargo!: string;

  @ApiProperty({ description: 'horasBase × factorRecargo — payable hours to liquidate. Decimal string.', example: '10.00' })
  horasPagables!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp — when payout was confirmed by HR. Null until confirmed.', nullable: true })
  paidAt!: string | null;

  @ApiProperty({ description: 'Server-generated UUID for payout idempotency. Null until confirmed.', nullable: true })
  payoutRef!: string | null;
}
