/**
 * OrgController — interface layer for org management endpoints.
 *
 * Routes:
 *   GET  /org/zones                  → list zones (scope-filtered by role)
 *   GET  /org/municipios             → list municipios (scope-filtered by role)
 *   POST /org/coordinadores/assign   → assign a COORDINADOR to a zone
 *   POST /org/users                  → provision a management-role user
 *
 * Authorization model (TWO layers):
 *   ORG_READ_ROLES : SYSTEM_ADMIN, GERENCIA, TALENTO_HUMANO, LIDER_OPERATIVO, COORDINADOR
 *     → All four GLOBAL_ROLES plus COORDINADOR (scoped to their own zone via ScopedZoneRepository).
 *     → SUPERVISOR intentionally excluded: no org-level read permission.
 *   ORG_WRITE_ROLES: SYSTEM_ADMIN, TALENTO_HUMANO
 *     → Coarse gate for both write endpoints (@Roles decorator).
 *     → For provisioning, a second application-layer check (inside the use-case) enforces
 *       the privilege-escalation guard (TALENTO_HUMANO cannot provision GERENCIA).
 *
 * Domain error → HTTP mapping (interface responsibility):
 *   ZoneNotFoundError            → 404 NotFoundException
 *   UserNotFoundError            → 404 NotFoundException
 *   InvalidCoordinadorRoleError  → 400 BadRequestException
 *   UnsupportedProvisionRoleError→ 400 BadRequestException
 *   EmailInUseError              → 409 ConflictException
 *   ForbiddenException           → 403 (already a NestJS exception — re-thrown as-is)
 *
 * IamController (supervisor/operario routes) is NOT modified — its IAM_READ_ROLES
 * guard (§3.4) remains unchanged (LIDER_OPERATIVO excluded from those routes).
 */

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import {
  ZoneResponseDtoClass,
  MunicipioResponseDtoClass,
  CreatedIdDto,
  UserResponseDto,
} from './response-dtos';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import type { Role } from '@prisma/client';
import { Roles } from './roles.decorator';
import type { AssignCoordinadorToZoneUseCase } from '../application/assign-coordinador-to-zone.use-case';
import type { ProvisionManagementUserUseCase } from '../application/provision-management-user.use-case';
import type { UpdateUserUseCase } from '../application/update-user.use-case';
import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';
import {
  ZoneNotFoundError,
  ZoneNameInUseError,
  ZoneHasDependentsError,
  UserNotFoundError,
  InvalidCoordinadorRoleError,
  UnsupportedProvisionRoleError,
  EmailInUseError,
  MunicipioNotFoundError,
  MunicipioNameInUseError,
  MunicipioHasDependentsError,
} from '../domain/org.errors';
import {
  AreaNotFoundError,
  AreaNameInUseError,
  AreaHasDependentsError,
} from '../domain/area.errors';

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const ORG_REPO = Symbol('OrgRepositoryPort');
export const ASSIGN_COORDINADOR_USE_CASE = Symbol('AssignCoordinadorToZoneUseCase');
export const PROVISION_MANAGEMENT_USER_USE_CASE = Symbol('ProvisionManagementUserUseCase');
export const UPDATE_USER_USE_CASE = Symbol('UpdateUserUseCase');

// ─── Role constants ───────────────────────────────────────────────────────────

/**
 * Roles permitted to access org READ endpoints.
 * Includes all GLOBAL_ROLES + COORDINADOR (scoped to their own zone).
 * SUPERVISOR intentionally excluded: no zone-level read permission.
 */
export const ORG_READ_ROLES = [
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'LIDER_OPERATIVO',
  'COORDINADOR',
] as const;

/**
 * Roles permitted to access org WRITE endpoints (coarse gate only).
 * A second privilege-escalation check lives inside ProvisionManagementUserUseCase.
 */
export const ORG_WRITE_ROLES = ['SYSTEM_ADMIN', 'TALENTO_HUMANO'] as const;

/**
 * Roles that may be the TARGET of a provisioning request.
 * Mirrors the use-case whitelist; enforced here so an unsupported role is
 * rejected by ValidationPipe with a 400 before reaching the use-case.
 * GERENCIA stays valid here — the privilege-escalation guard (use-case) is what
 * blocks a TALENTO_HUMANO actor from provisioning it (403), not input validation.
 */
export const PROVISIONABLE_ROLES = ['GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO'] as const;

// ─── Request DTOs (NestJS-side — minimal, framework-aware) ───────────────────
// @IsString() decorators are required for ValidationPipe whitelist mode:
// without them, all fields are stripped and arrive as undefined.

export class AssignCoordinadorBody {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  zoneId!: string;
}

export class ProvisionUserBody {
  @ApiProperty({ format: 'email' })
  @IsString()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiProperty({ enum: PROVISIONABLE_ROLES })
  @IsIn(PROVISIONABLE_ROLES)
  role!: string;

  @ApiPropertyOptional({ description: 'Optional human-readable display name' })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class CreateZoneBody {
  @ApiProperty({ description: 'Unique zone name' })
  @IsString()
  name!: string;
}

export class UpdateZoneBody {
  @ApiProperty({ description: 'New zone name' })
  @IsString()
  name!: string;
}

export class CreateMunicipioBody {
  @ApiProperty({ description: 'Municipio name (unique within zone)' })
  @IsString()
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'Zone this municipio belongs to' })
  @IsString()
  zoneId!: string;
}

export class UpdateMunicipioBody {
  @ApiPropertyOptional({ description: 'New municipio name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'New zone for this municipio' })
  @IsOptional()
  @IsString()
  zoneId?: string;
}

// ─── Área DTOs ────────────────────────────────────────────────────────────────

export class CreateAreaBody {
  @ApiProperty({ description: 'Area name (unique within zone)' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'HH:MM', example: '06:00' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  horaInicio!: string;

  @ApiProperty({ description: 'HH:MM', example: '14:00' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  horaFin!: string;

  @ApiProperty({ format: 'uuid' })
  @IsNotEmpty()
  @IsUUID()
  zoneId!: string;
}

export class UpdateAreaBody {
  @ApiPropertyOptional({ description: 'New area name (unique within zone)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'HH:MM', example: '06:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  horaInicio?: string;

  @ApiPropertyOptional({ description: 'HH:MM', example: '14:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  horaFin?: string;
}

export class UpdateUserBody {
  @ApiPropertyOptional({ description: 'New human-readable display name' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: PROVISIONABLE_ROLES, description: 'New role (rank-checked)' })
  @IsOptional()
  @IsIn(PROVISIONABLE_ROLES)
  role?: string;
}

export class AreaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'HH:MM' })
  horaInicio!: string;

  @ApiProperty({ description: 'HH:MM' })
  horaFin!: string;

  @ApiProperty({ format: 'uuid' })
  zoneId!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  updatedAt!: string;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('org')
export class OrgController {
  constructor(
    @Inject(ORG_REPO) private readonly orgRepo: OrgRepositoryPort,
    @Inject(ASSIGN_COORDINADOR_USE_CASE)
    private readonly assignUseCase: Pick<AssignCoordinadorToZoneUseCase, 'execute'>,
    @Inject(PROVISION_MANAGEMENT_USER_USE_CASE)
    private readonly provisionUseCase: Pick<ProvisionManagementUserUseCase, 'execute'>,
    @Inject(UPDATE_USER_USE_CASE)
    private readonly updateUserUseCase: Pick<UpdateUserUseCase, 'execute'>,
  ) {}

  // ─── Read endpoints ────────────────────────────────────────────────────────

  @Roles(...ORG_READ_ROLES)
  @Get('zones')
  @ApiOkResponse({ type: ZoneResponseDtoClass, isArray: true })
  async listZones() {
    return this.orgRepo.findZones();
  }

  @Roles(...ORG_READ_ROLES)
  @Get('municipios')
  @ApiOkResponse({ type: MunicipioResponseDtoClass, isArray: true })
  async listMunicipios() {
    return this.orgRepo.findMunicipios();
  }

  @Roles(...ORG_WRITE_ROLES)
  @Get('users')
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  async listUsers() {
    return this.orgRepo.findUsers();
  }

  // ─── Write endpoints ───────────────────────────────────────────────────────

  @Roles(...ORG_WRITE_ROLES)
  @Post('coordinadores/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Coordinator assigned successfully (no body)' })
  async assignCoordinador(@Body() body: AssignCoordinadorBody): Promise<void> {
    try {
      await this.assignUseCase.execute({ userId: body.userId, zoneId: body.zoneId });
    } catch (err) {
      if (err instanceof ZoneNotFoundError || err instanceof UserNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof InvalidCoordinadorRoleError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Roles(...ORG_WRITE_ROLES)
  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreatedIdDto })
  async provisionUser(@Body() body: ProvisionUserBody): Promise<{ id: string }> {
    try {
      return await this.provisionUseCase.execute({
        email: body.email,
        password: body.password,
        role: body.role as Role,
        displayName: body.displayName,
      });
    } catch (err) {
      if (err instanceof UnsupportedProvisionRoleError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof EmailInUseError) {
        throw new ConflictException(err.message);
      }
      // ForbiddenException from privilege-escalation guard — re-throw as-is
      throw err;
    }
  }

  // ─── Update user ───────────────────────────────────────────────────────────

  /**
   * PATCH /org/users/:id — update a user's displayName and/or role.
   * Error mapping:
   *   UserNotFoundError               → 404 NotFoundException
   *   UnsupportedProvisionRoleError   → 400 BadRequestException
   *   ForbiddenException              → 403 (re-thrown)
   */
  @Roles(...ORG_WRITE_ROLES)
  @Patch('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UserResponseDto })
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserBody,
  ): Promise<UserResponseDto> {
    try {
      const result = await this.updateUserUseCase.execute({
        id,
        displayName: body.displayName,
        role: body.role as Role,
      });

      return {
        id: result.id,
        email: result.email,
        role: result.role,
        mustChangePassword: result.mustChangePassword,
        coordinatedZoneId: result.coordinatedZoneId,
        displayName: result.displayName,
        createdAt: result.createdAt,
      };
    } catch (err) {
      if (err instanceof UnsupportedProvisionRoleError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof UserNotFoundError) {
        throw new NotFoundException(err.message);
      }
      // ForbiddenException from privilege-escalation guard — re-throw as-is
      throw err;
    }
  }

  // ─── Zone CRUD ─────────────────────────────────────────────────────────────

  /**
   * POST /org/zones — create a zone.
   * Error mapping:
   *   ZoneNameInUseError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Post('zones')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreatedIdDto })
  async createZone(@Body() body: CreateZoneBody): Promise<{ id: string }> {
    try {
      return await this.orgRepo.createZone({ name: body.name });
    } catch (err) {
      if (err instanceof ZoneNameInUseError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * PATCH /org/zones/:id — update a zone's name.
   * Error mapping:
   *   ZoneNotFoundError  → 404 NotFoundException
   *   ZoneNameInUseError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Patch('zones/:id')
  @ApiOkResponse({ type: ZoneResponseDtoClass })
  async updateZone(
    @Param('id') id: string,
    @Body() body: UpdateZoneBody,
  ): Promise<ZoneResponseDtoClass> {
    try {
      return await this.orgRepo.updateZone(id, { name: body.name }) as unknown as ZoneResponseDtoClass;
    } catch (err) {
      if (err instanceof ZoneNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ZoneNameInUseError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /org/zones/:id — delete a zone.
   * Error mapping:
   *   ZoneNotFoundError      → 404 NotFoundException
   *   ZoneHasDependentsError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Delete('zones/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Zone deleted' })
  async deleteZone(@Param('id') id: string): Promise<void> {
    try {
      await this.orgRepo.deleteZone(id);
    } catch (err) {
      if (err instanceof ZoneNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ZoneHasDependentsError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  // ─── Municipio CRUD ────────────────────────────────────────────────────────

  /**
   * POST /org/municipios — create a municipio.
   * Error mapping:
   *   ZoneNotFoundError       → 400 BadRequestException (zone must exist)
   *   MunicipioNameInUseError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Post('municipios')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreatedIdDto })
  async createMunicipio(@Body() body: CreateMunicipioBody): Promise<{ id: string }> {
    try {
      return await this.orgRepo.createMunicipio({ name: body.name, zoneId: body.zoneId });
    } catch (err) {
      if (err instanceof ZoneNotFoundError) {
        // Zone must exist — this is a bad input (invalid zoneId), map to 400
        throw new BadRequestException(err.message);
      }
      if (err instanceof MunicipioNameInUseError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * PATCH /org/municipios/:id — update a municipio.
   * Error mapping:
   *   MunicipioNotFoundError  → 404 NotFoundException
   *   ZoneNotFoundError       → 400 BadRequestException (new zoneId not found)
   *   MunicipioNameInUseError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Patch('municipios/:id')
  @ApiOkResponse({ type: MunicipioResponseDtoClass })
  async updateMunicipio(
    @Param('id') id: string,
    @Body() body: UpdateMunicipioBody,
  ): Promise<MunicipioResponseDtoClass> {
    try {
      return await this.orgRepo.updateMunicipio(id, {
        name: body.name,
        zoneId: body.zoneId,
      }) as unknown as MunicipioResponseDtoClass;
    } catch (err) {
      if (err instanceof MunicipioNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof ZoneNotFoundError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof MunicipioNameInUseError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /org/municipios/:id — delete a municipio.
   * Error mapping:
   *   MunicipioNotFoundError      → 404 NotFoundException
   *   MunicipioHasDependentsError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Delete('municipios/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Municipio deleted' })
  async deleteMunicipio(@Param('id') id: string): Promise<void> {
    try {
      await this.orgRepo.deleteMunicipio(id);
    } catch (err) {
      if (err instanceof MunicipioNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof MunicipioHasDependentsError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  // ─── Área CRUD ──────────────────────────────────────────────────────────────

  /**
   * GET /org/areas — list áreas (scope-filtered by role).
   */
  @Roles(...ORG_READ_ROLES)
  @Get('areas')
  @ApiOkResponse({ type: AreaResponseDto, isArray: true })
  async listAreas() {
    return this.orgRepo.findAreas();
  }

  /**
   * POST /org/areas — create an área.
   * Error mapping:
   *   ZoneNotFoundError  → 400 BadRequestException (zone must exist)
   *   AreaNameInUseError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Post('areas')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreatedIdDto })
  async createArea(@Body() body: CreateAreaBody): Promise<{ id: string }> {
    try {
      return await this.orgRepo.createArea({
        name: body.name,
        horaInicio: body.horaInicio,
        horaFin: body.horaFin,
        zoneId: body.zoneId,
      });
    } catch (err) {
      if (err instanceof ZoneNotFoundError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof AreaNameInUseError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * PATCH /org/areas/:id — update an área.
   * Error mapping:
   *   AreaNotFoundError  → 404 NotFoundException
   *   AreaNameInUseError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Patch('areas/:id')
  @ApiOkResponse({ type: AreaResponseDto })
  async updateArea(
    @Param('id') id: string,
    @Body() body: UpdateAreaBody,
  ): Promise<AreaResponseDto> {
    try {
      return await this.orgRepo.updateArea(id, {
        name: body.name,
        horaInicio: body.horaInicio,
        horaFin: body.horaFin,
      }) as unknown as AreaResponseDto;
    } catch (err) {
      if (err instanceof AreaNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof AreaNameInUseError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /org/areas/:id — delete an área.
   * Error mapping:
   *   AreaNotFoundError      → 404 NotFoundException
   *   AreaHasDependentsError → 409 ConflictException
   */
  @Roles(...ORG_WRITE_ROLES)
  @Delete('areas/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Area deleted' })
  async deleteArea(@Param('id') id: string): Promise<void> {
    try {
      await this.orgRepo.deleteArea(id);
    } catch (err) {
      if (err instanceof AreaNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof AreaHasDependentsError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
