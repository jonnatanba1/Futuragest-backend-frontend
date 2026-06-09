/**
 * Compensacion module — OpenAPI response DTO classes.
 *
 * Used for Swagger schema generation. Decimals are serialized as strings
 * (Prisma Decimal.toString()) — API consumers must parse as decimal, not float.
 */

import { ApiProperty } from '@nestjs/swagger';

// ─── GET /jornada-policy ──────────────────────────────────────────────────────

export class JornadaPolicyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Daily work hours. Prisma Decimal serialized as string.', example: '8.00' })
  horasDiarias!: string;

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

  @ApiProperty({ description: 'JornadaPolicy hours for this day. Decimal string.', example: '8.00' })
  jornadaHoras!: string;

  @ApiProperty({ description: 'horasReales - jornadaHoras. Decimal string.', example: '0.50' })
  delta!: string;
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

  @ApiProperty({ description: 'carryIn + creditos - debitos. Decimal string.', example: '-0.25' })
  saldoHoras!: string;

  @ApiProperty({ type: () => DayBreakdownDto, isArray: true })
  breakdown!: DayBreakdownDto[];
}
