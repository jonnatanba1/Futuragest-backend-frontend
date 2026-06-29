/**
 * IAM module — OpenAPI response DTO classes.
 *
 * Covers: SupervisorResponseDto, OperarioResponseDto, ImportResultResponseDto,
 * CreatedIdDto, ZoneResponseDtoClass, MunicipioResponseDtoClass.
 *
 * These classes are ONLY used for Swagger schema generation.
 * Runtime behavior is unchanged — controllers return plain objects/interfaces.
 */

import { ApiProperty } from '@nestjs/swagger';

// ─── GET /iam/supervisors, GET /iam/supervisors/:id ───────────────────────────

export class SupervisorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  municipioId!: string;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({
    description: 'SupervisorArea: BARRIDO | RECOLECCION | SUPERNUMERARIO',
  })
  area!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;
}

// ─── GET /iam/operarios, GET /iam/operarios/:id ───────────────────────────────

export class OperarioResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  documento!: string;

  @ApiProperty({ format: 'uuid' })
  supervisorId!: string;

  @ApiProperty({ description: 'Free-text job position (e.g. "Barrido", "Recolección")' })
  cargo!: string;

  @ApiProperty({ description: 'Derived: deactivatedAt === null' })
  active!: boolean;

  @ApiProperty({
    description: 'ISO 8601 timestamp or null when active',
    nullable: true,
  })
  deactivatedAt!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp — delta cursor for ?since= queries' })
  updatedAt!: string;
}

// ─── POST /iam/operarios/import ───────────────────────────────────────────────

export class ImportRowErrorDto {
  @ApiProperty()
  row!: number;

  @ApiProperty({ nullable: true })
  documento!: string | null;

  @ApiProperty()
  reason!: string;
}

export class ImportResultResponseDto {
  @ApiProperty()
  imported!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty({ type: () => ImportRowErrorDto, isArray: true })
  errors!: ImportRowErrorDto[];
}

// ─── POST /iam/operarios (create), POST /org/users (provision) ────────────────

export class CreatedIdDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

// ─── GET /org/zones ────────────────────────────────────────────────────────────

export class ZoneResponseDtoClass {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp — delta cursor for ?since= queries' })
  updatedAt!: string;
}

// ─── GET /org/municipios ───────────────────────────────────────────────────────

export class MunicipioResponseDtoClass {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp — delta cursor for ?since= queries' })
  updatedAt!: string;
}

// ─── GET /org/users (admin) ──────────────────────────────────────────────────

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ description: 'Role enum (SYSTEM_ADMIN, GERENCIA, …)' })
  role!: string;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Zone coordinated (COORDINADOR only)' })
  coordinatedZoneId!: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;
}
