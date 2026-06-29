/**
 * Auth module — OpenAPI response DTO classes.
 *
 * These classes are ONLY used for Swagger schema generation (@ApiOkResponse etc.).
 * Runtime behavior is unchanged — controllers keep returning plain objects/interfaces.
 */

import { ApiProperty } from '@nestjs/swagger';

// ─── Shared nested DTOs ────────────────────────────────────────────────────────

export class ZoneRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MunicipioRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MeSupervisorBlockDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  area!: string;

  @ApiProperty({ type: () => ZoneRefDto })
  zone!: ZoneRefDto;

  @ApiProperty({ type: () => MunicipioRefDto })
  municipio!: MunicipioRefDto;
}

// ─── GET /auth/me ──────────────────────────────────────────────────────────────

/**
 * Flat OpenAPI representation of the MeResponse discriminated union.
 * Fields that are role-conditional are modelled as nullable (present in some roles,
 * null in others) — the real runtime type is the MeResponse union from contracts.
 */
export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty({
    description:
      'Role name. COORDINADOR and SUPERVISOR have role-specific scoped fields.',
  })
  role!: string;

  @ApiProperty({ type: () => ZoneRefDto, nullable: true })
  coordinatedZone!: ZoneRefDto | null;

  @ApiProperty({ type: () => MeSupervisorBlockDto, nullable: true })
  supervisor!: MeSupervisorBlockDto | null;
}

// ─── POST /auth/login ──────────────────────────────────────────────────────────

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  passwordChangeRequired!: boolean;
}

// ─── POST /auth/refresh ────────────────────────────────────────────────────────

export class RefreshResponseDto {
  @ApiProperty()
  accessToken!: string;
}

// ─── POST /auth/change-password, DELETE /auth/sessions/:deviceId ──────────────

export class MessageResponseDto {
  @ApiProperty()
  message!: string;
}
