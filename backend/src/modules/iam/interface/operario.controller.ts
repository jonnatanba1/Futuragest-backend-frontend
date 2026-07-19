/**
 * T-19 + PR-2 — OperarioController.
 *
 * Write endpoints for operario management AND supervisor creation.
 * @Controller('iam') — routes under /iam prefix.
 *
 * Routes:
 *   POST  /iam/operarios              → create operario (201)
 *   POST  /iam/operarios/import       → CSV bulk import (200 ImportResultDto)
 *   PATCH /iam/operarios/:id/deactivate → soft-deactivate (200)
 *   PATCH /iam/operarios/:id/reactivate → reactivate (200)
 *   POST  /iam/supervisors            → create supervisor (201) — compound User + Supervisor
 *
 * Auth: @Roles(SYSTEM_ADMIN, TALENTO_HUMANO) — same as ORG_WRITE_ROLES.
 * Error → HTTP map (spec-locked):
 *   DuplicateDocumentoError          → 409
 *   OperarioSupervisorNotFoundError  → 400
 *   AlreadyInactiveError             → 409
 *   AlreadyActiveError               → 409
 *   OperarioNotFoundError            → 404
 *   UnsupportedImportFormatError     → 400
 *   EmailInUseError                  → 409
 *   ZoneNotFoundError                → 400
 *   MunicipioNotFoundError           → 400
 *   MunicipioNotInZoneError          → 400
 *
 * Covers: OP-01..09, OP-10..17, OP-24, OP-27..32, REQ-04, REQ-05, REQ-06, REQ-07, REQ-11,
 *         SUP-01..06.
 */

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedFile as MulterFile } from '../../../types/uploaded-file';
import { ApiProperty, ApiPropertyOptional, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { CreatedIdDto, ImportResultResponseDto, OperarioResponseDto, SupervisorResponseDto } from './response-dtos';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Roles } from './roles.decorator';
import type { CreateOperarioUseCase } from '../application/create-operario.use-case';
import type { DeactivateOperarioUseCase } from '../application/deactivate-operario.use-case';
import type { ReactivateOperarioUseCase } from '../application/reactivate-operario.use-case';
import type { BulkImportOperariosUseCase } from '../application/bulk-import-operarios.use-case';
import type { CreateSupervisorUseCase } from '../application/create-supervisor.use-case';
import type { UpdateSupervisorUseCase } from '../application/update-supervisor.use-case';
import type { ReassignOperarioUseCase } from '../application/reassign-operario.use-case';
import {
  DuplicateDocumentoError,
  OperarioSupervisorNotFoundError,
  AlreadyInactiveError,
  AlreadyActiveError,
  OperarioNotFoundError,
} from '../domain/operario.errors';
import {
  EmailInUseError,
  ZoneNotFoundError,
  MunicipioNotFoundError,
  MunicipioNotInZoneError,
  SupervisorNotFoundError,
} from '../domain/org.errors';
import { parseOperarioImport, UnsupportedImportFormatError } from '../infrastructure/operario-import.parser';
import type { OperarioDto, ImportResultDto, SupervisorDto } from '@futuragest/contracts';

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const CREATE_OPERARIO_USE_CASE = Symbol('CreateOperarioUseCase');
export const DEACTIVATE_OPERARIO_USE_CASE = Symbol('DeactivateOperarioUseCase');
export const REACTIVATE_OPERARIO_USE_CASE = Symbol('ReactivateOperarioUseCase');
export const BULK_IMPORT_OPERARIOS_USE_CASE = Symbol('BulkImportOperariosUseCase');
export const CREATE_SUPERVISOR_USE_CASE = Symbol('CreateSupervisorUseCase');
export const UPDATE_SUPERVISOR_USE_CASE = Symbol('UpdateSupervisorUseCase');
export const REASSIGN_OPERARIO_USE_CASE = Symbol('ReassignOperarioUseCase');

// ─── Role constants ───────────────────────────────────────────────────────────

/** Roles permitted to write operario data (coarse gate). */
export const OPERARIO_WRITE_ROLES = ['SYSTEM_ADMIN', 'TALENTO_HUMANO'] as const;

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class CreateOperarioBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ description: 'Unique national document number' })
  @IsString()
  @IsNotEmpty()
  documento!: string;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  supervisorId!: string;

  @ApiProperty({ description: 'Free-text job position (e.g. "Barrido", "Recolección")', default: '' })
  @IsOptional()
  @IsString()
  cargo?: string;

  @ApiProperty({ format: 'uuid', description: 'Optional área assignment', required: false })
  @IsOptional()
  @IsUUID()
  areaId?: string;
}

export class ReassignOperarioBody {
  @ApiProperty({ format: 'uuid', description: 'New supervisor id' })
  @IsString()
  @IsNotEmpty()
  supervisorId!: string;
}

/** Valid supervisor area values (mirrors Prisma SupervisorArea enum). */
const SUPERVISOR_AREA_VALUES = ['BARRIDO', 'RECOLECCION', 'SUPERNUMERARIO'] as const;
type SupervisorAreaValue = typeof SUPERVISOR_AREA_VALUES[number];

export class CreateSupervisorBody {
  @ApiProperty({ format: 'email', description: 'Email for the new supervisor user account' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, description: 'Temporary password (mustChangePassword=true)' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    enum: SUPERVISOR_AREA_VALUES,
    description: 'Operational area: BARRIDO | RECOLECCION | SUPERNUMERARIO',
  })
  @IsIn(SUPERVISOR_AREA_VALUES)
  area!: SupervisorAreaValue;

  @ApiProperty({ format: 'uuid', description: 'Zone the supervisor is assigned to' })
  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @ApiProperty({ format: 'uuid', description: 'Municipio within the zone' })
  @IsString()
  @IsNotEmpty()
  municipioId!: string;

  @ApiProperty({ description: 'Optional human-readable display name', required: false })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class UpdateSupervisorBody {
  @ApiPropertyOptional({ format: 'uuid', description: 'New municipio assignment' })
  @IsOptional()
  @IsUUID()
  municipioId?: string;

  @ApiPropertyOptional({
    enum: SUPERVISOR_AREA_VALUES,
    description: 'New operational area: BARRIDO | RECOLECCION | SUPERNUMERARIO',
  })
  @IsOptional()
  @IsIn(SUPERVISOR_AREA_VALUES)
  area?: SupervisorAreaValue;

  @ApiPropertyOptional({ description: 'New human-readable display name' })
  @IsOptional()
  @IsString()
  displayName?: string;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('iam')
export class OperarioController {
  constructor(
    @Inject(CREATE_OPERARIO_USE_CASE)
    private readonly createUseCase: Pick<CreateOperarioUseCase, 'execute'>,
    @Inject(DEACTIVATE_OPERARIO_USE_CASE)
    private readonly deactivateUseCase: Pick<DeactivateOperarioUseCase, 'execute'>,
    @Inject(REACTIVATE_OPERARIO_USE_CASE)
    private readonly reactivateUseCase: Pick<ReactivateOperarioUseCase, 'execute'>,
    @Inject(BULK_IMPORT_OPERARIOS_USE_CASE)
    private readonly bulkImportUseCase: Pick<BulkImportOperariosUseCase, 'execute'>,
    @Inject(CREATE_SUPERVISOR_USE_CASE)
    private readonly createSupervisorUseCase: Pick<CreateSupervisorUseCase, 'execute'>,
    @Inject(UPDATE_SUPERVISOR_USE_CASE)
    private readonly updateSupervisorUseCase: Pick<UpdateSupervisorUseCase, 'execute'>,
    @Inject(REASSIGN_OPERARIO_USE_CASE)
    private readonly reassignUseCase: Pick<ReassignOperarioUseCase, 'execute'>,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  @Roles(...OPERARIO_WRITE_ROLES)
  @Post('operarios')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreatedIdDto })
  async createOperario(@Body() body: CreateOperarioBody): Promise<{ id: string }> {
    try {
      return await this.createUseCase.execute({
        fullName: body.fullName,
        documento: body.documento,
        supervisorId: body.supervisorId,
        cargo: body.cargo ?? '',
        areaId: body.areaId,
      });
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  // ─── Bulk import ─────────────────────────────────────────────────────────

  /**
   * POST /iam/operarios/import
   * Accepts multipart/form-data with a CSV file (field: "file").
   * Returns 200 ImportResultDto (partial-success: valid rows committed even when others fail).
   * Error mapping: empty file → 400; malformed CSV → 400; unsupported format → 400.
   * Covers: OP-10..17, REQ-05.
   */
  @Roles(...OPERARIO_WRITE_ROLES)
  @Post('operarios/import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOkResponse({ type: ImportResultResponseDto })
  async importOperarios(
    @UploadedFile() file: MulterFile,
  ): Promise<ImportResultDto> {
    // No file or empty buffer → 400
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No se proporcionó archivo o está vacío');
    }

    // Parse (format detection + CSV parse)
    let rows: Awaited<ReturnType<typeof parseOperarioImport>>;
    try {
      rows = await parseOperarioImport(file.buffer, file.originalname);
    } catch (err) {
      if (err instanceof UnsupportedImportFormatError) {
        throw new BadRequestException(err.message);
      }
      // Malformed CSV parse error → 400
      throw new BadRequestException(
        `No se pudo procesar el archivo: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Empty file (header only, no data rows) → 400
    if (rows.length === 0) {
      throw new BadRequestException('El archivo no contiene filas de datos');
    }

    return this.bulkImportUseCase.execute({ rows });
  }

  // ─── Deactivate ───────────────────────────────────────────────────────────

  @Roles(...OPERARIO_WRITE_ROLES)
  @Patch('operarios/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OperarioResponseDto })
  async deactivateOperario(@Param('id') id: string): Promise<OperarioDto> {
    try {
      return await this.deactivateUseCase.execute(id);
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  // ─── Reactivate ───────────────────────────────────────────────────────────

  @Roles(...OPERARIO_WRITE_ROLES)
  @Patch('operarios/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OperarioResponseDto })
  async reactivateOperario(@Param('id') id: string): Promise<OperarioDto> {
    try {
      return await this.reactivateUseCase.execute(id);
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  // ─── Reassign ─────────────────────────────────────────────────────────────

  @Roles(...OPERARIO_WRITE_ROLES)
  @Patch('operarios/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OperarioResponseDto })
  async reassignOperario(
    @Param('id') id: string,
    @Body() body: ReassignOperarioBody,
  ): Promise<OperarioDto> {
    try {
      return await this.reassignUseCase.execute({
        operarioId: id,
        supervisorId: body.supervisorId,
      });
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  // ─── Create Supervisor ────────────────────────────────────────────────────

  /**
   * POST /iam/supervisors
   *
   * Creates a User (role SUPERVISOR) and a Supervisor row in a single transaction.
   * Returns 201 { id } where id is the Supervisor.id (NOT the User.id).
   *
   * Error mapping:
   *   EmailInUseError         → 409 Conflict
   *   ZoneNotFoundError       → 400 Bad Request
   *   MunicipioNotFoundError  → 400 Bad Request
   *   MunicipioNotInZoneError → 400 Bad Request
   *   Invalid area value      → 400 (rejected by ValidationPipe before reaching handler)
   */
  @Roles(...OPERARIO_WRITE_ROLES)
  @Post('supervisors')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    type: CreatedIdDto,
    description: 'Returns the created Supervisor.id (not the User.id).',
  })
  async createSupervisor(@Body() body: CreateSupervisorBody): Promise<{ id: string }> {
    try {
      return await this.createSupervisorUseCase.execute({
        email: body.email,
        password: body.password,
        area: body.area,
        zoneId: body.zoneId,
        municipioId: body.municipioId,
        displayName: body.displayName,
      });
    } catch (err) {
      this.mapSupervisorError(err);
    }
  }

  // ─── Update Supervisor ────────────────────────────────────────────────────

  /**
   * PATCH /iam/supervisors/:id
   *
   * Updates a supervisor's municipal assignment, area, and/or display name.
   * displayName is stored on the related User row; municipio and area on Supervisor.
   * Returns the updated SupervisorDto.
   *
   * Error mapping:
   *   SupervisorNotFoundError  → 404
   *   MunicipioNotFoundError   → 400
   *   MunicipioNotInZoneError  → 400
   */
  @Roles(...OPERARIO_WRITE_ROLES)
  @Patch('supervisors/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: SupervisorResponseDto,
    description: 'Returns the updated supervisor with displayName.',
  })
  async updateSupervisor(
    @Param('id') id: string,
    @Body() body: UpdateSupervisorBody,
  ): Promise<SupervisorDto> {
    try {
      const result = await this.updateSupervisorUseCase.execute({
        id,
        municipioId: body.municipioId,
        area: body.area,
        displayName: body.displayName,
      });

      return {
        id: result.id,
        userId: result.userId,
        municipioId: result.municipioId,
        zoneId: result.zoneId,
        area: result.area,
        email: result.user.email,
        displayName: result.user.displayName ?? undefined,
        createdAt: result.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof SupervisorNotFoundError) {
        throw new NotFoundException(err.message);
      }
      this.mapSupervisorError(err);
    }
  }

  // ─── Error mapping ────────────────────────────────────────────────────────

  private mapDomainError(err: unknown): never {
    if (err instanceof DuplicateDocumentoError) {
      throw new ConflictException(err.message);
    }
    if (err instanceof OperarioSupervisorNotFoundError) {
      throw new BadRequestException(err.message);
    }
    if (err instanceof AlreadyInactiveError) {
      throw new ConflictException(err.message);
    }
    if (err instanceof AlreadyActiveError) {
      throw new ConflictException(err.message);
    }
    if (err instanceof OperarioNotFoundError) {
      throw new NotFoundException(err.message);
    }
    if (err instanceof UnsupportedImportFormatError) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }

  private mapSupervisorError(err: unknown): never {
    if (err instanceof EmailInUseError) {
      throw new ConflictException(err.message);
    }
    if (err instanceof ZoneNotFoundError) {
      throw new BadRequestException(err.message);
    }
    if (err instanceof MunicipioNotFoundError) {
      throw new BadRequestException(err.message);
    }
    if (err instanceof MunicipioNotInZoneError) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}
