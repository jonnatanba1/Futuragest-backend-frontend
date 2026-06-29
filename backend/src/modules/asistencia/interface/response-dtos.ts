/**
 * Asistencia module — OpenAPI response DTO classes.
 *
 * Mirrors AttendanceDto and PhotoUploadResponseDto from contracts.
 * These classes are ONLY used for Swagger schema generation.
 * Runtime behavior is unchanged — controllers return plain objects/interfaces.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── GET /asistencia, GET /asistencia/:id ─────────────────────────────────────
// POST /asistencia/check-in, POST /asistencia/:id/check-out ────────────────────

export class AttendanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  supervisorId!: string;

  @ApiProperty({ format: 'uuid' })
  operarioId!: string;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ description: 'YYYY-MM-DD, client-computed Colombia local date' })
  date!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  checkInCapturedAt!: string;

  @ApiProperty({ description: 'ISO 8601 server clock timestamp' })
  checkInReceivedAt!: string;

  @ApiProperty()
  checkInLat!: number;

  @ApiProperty()
  checkInLng!: number;

  @ApiProperty({ nullable: true })
  checkInAccuracy!: number | null;

  @ApiProperty({ description: 'ISO 8601 timestamp', nullable: true })
  checkOutCapturedAt!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp', nullable: true })
  checkOutReceivedAt!: string | null;

  @ApiProperty({ nullable: true })
  checkOutLat!: number | null;

  @ApiProperty({ nullable: true })
  checkOutLng!: number | null;

  @ApiProperty({ nullable: true })
  checkOutAccuracy!: number | null;

  @ApiProperty({ nullable: true })
  checkInPhotoKey!: string | null;

  @ApiProperty({ nullable: true })
  checkOutPhotoKey!: string | null;

  @ApiPropertyOptional({
    enum: ['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE'],
    nullable: true,
    description: 'Audit label: verification method used at check-in. Null = legacy / old app version.',
  })
  checkInVerification!: 'BIOMETRIC' | 'DEVICE_CREDENTIAL' | 'NONE' | null;

  @ApiPropertyOptional({
    enum: ['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE'],
    nullable: true,
    description: 'Audit label: verification method used at check-out. Null = legacy / old app version.',
  })
  checkOutVerification!: 'BIOMETRIC' | 'DEVICE_CREDENTIAL' | 'NONE' | null;

  @ApiProperty({ description: 'Idempotency token' })
  clientRef!: string;

  @ApiProperty({ nullable: true })
  checkOutClientRef!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp when both phases done', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp — delta cursor for ?since= queries' })
  updatedAt!: string;
}

// ─── POST /asistencia/:id/photo ────────────────────────────────────────────────

export class PhotoUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  attendanceId!: string;

  @ApiProperty()
  photoKey!: string;
}

// ─── GET /asistencia/:id/photo ─────────────────────────────────────────────────

export class PhotoUrlDto {
  @ApiProperty({ description: 'Presigned GET URL' })
  url!: string;
}
