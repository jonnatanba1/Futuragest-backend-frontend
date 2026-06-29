/**
 * Novedades module — OpenAPI response DTO classes.
 *
 * Mirrors NovedadDto from contracts.
 * These classes are ONLY used for Swagger schema generation.
 * Runtime behavior is unchanged — controllers return plain objects/interfaces.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── GET /novedades, GET /novedades/:id ───────────────────────────────────────
// POST /asistencia/:attendanceId/novedades ─────────────────────────────────────
// PATCH /novedades/:id/approve, PATCH /novedades/:id/reject ───────────────────

export class NovedadResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  attendanceId!: string;

  @ApiProperty({ format: 'uuid' })
  supervisorId!: string;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({
    description:
      'Overtime hours. Prisma Decimal serialized as string — parse as decimal, NOT double.',
    example: '2.50',
  })
  horasExtra!: string;

  @ApiProperty({ nullable: true })
  motivo!: string | null;

  @ApiProperty({ description: 'PENDING | APPROVED | REJECTED' })
  status!: string;

  @ApiProperty({
    description: 'Idempotency token for offline sync. Null when not provided.',
    nullable: true,
  })
  clientRef!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  approvedByUserId!: string | null;

  @ApiProperty({
    description: 'ISO 8601 timestamp when approved/rejected. Null while PENDING.',
    nullable: true,
  })
  decidedAt!: string | null;

  @ApiPropertyOptional({
    enum: ['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE'],
    nullable: true,
    description:
      'Audit label: verification method used by the líder operativo when deciding. ' +
      'Null = web admin decision (no biometrics) or legacy row.',
  })
  decisionVerification!: 'BIOMETRIC' | 'DEVICE_CREDENTIAL' | 'NONE' | null;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp — delta cursor for ?since= queries' })
  updatedAt!: string;
}
