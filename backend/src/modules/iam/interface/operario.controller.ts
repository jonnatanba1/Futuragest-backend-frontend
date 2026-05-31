/**
 * T-19 + PR-2 — OperarioController.
 *
 * Write endpoints for operario management.
 * @Controller('iam') — routes under /iam prefix.
 *
 * Routes:
 *   POST  /iam/operarios              → create operario (201)
 *   POST  /iam/operarios/import       → CSV bulk import (200 ImportResultDto)
 *   PATCH /iam/operarios/:id/deactivate → soft-deactivate (200)
 *   PATCH /iam/operarios/:id/reactivate → reactivate (200)
 *
 * Auth: @Roles(SYSTEM_ADMIN, TALENTO_HUMANO) — same as ORG_WRITE_ROLES.
 * Error → HTTP map (spec-locked):
 *   DuplicateDocumentoError          → 409
 *   OperarioSupervisorNotFoundError  → 400
 *   AlreadyInactiveError             → 409
 *   AlreadyActiveError               → 409
 *   OperarioNotFoundError            → 404
 *   UnsupportedImportFormatError     → 400
 *
 * Covers: OP-01..09, OP-10..17, OP-24, OP-27..32, REQ-04, REQ-05, REQ-06, REQ-07, REQ-11.
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
import { IsString, IsNotEmpty } from 'class-validator';
import { Roles } from './roles.decorator';
import type { CreateOperarioUseCase } from '../application/create-operario.use-case';
import type { DeactivateOperarioUseCase } from '../application/deactivate-operario.use-case';
import type { ReactivateOperarioUseCase } from '../application/reactivate-operario.use-case';
import type { BulkImportOperariosUseCase } from '../application/bulk-import-operarios.use-case';
import {
  DuplicateDocumentoError,
  OperarioSupervisorNotFoundError,
  AlreadyInactiveError,
  AlreadyActiveError,
  OperarioNotFoundError,
} from '../domain/operario.errors';
import { parseOperarioImport, UnsupportedImportFormatError } from '../infrastructure/operario-import.parser';
import type { OperarioDto, ImportResultDto } from '@futuragest/contracts';

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const CREATE_OPERARIO_USE_CASE = Symbol('CreateOperarioUseCase');
export const DEACTIVATE_OPERARIO_USE_CASE = Symbol('DeactivateOperarioUseCase');
export const REACTIVATE_OPERARIO_USE_CASE = Symbol('ReactivateOperarioUseCase');
export const BULK_IMPORT_OPERARIOS_USE_CASE = Symbol('BulkImportOperariosUseCase');

// ─── Role constants ───────────────────────────────────────────────────────────

/** Roles permitted to write operario data (coarse gate). */
export const OPERARIO_WRITE_ROLES = ['SYSTEM_ADMIN', 'TALENTO_HUMANO'] as const;

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class CreateOperarioBody {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  documento!: string;

  @IsString()
  @IsNotEmpty()
  supervisorId!: string;
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
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  @Roles(...OPERARIO_WRITE_ROLES)
  @Post('operarios')
  @HttpCode(HttpStatus.CREATED)
  async createOperario(@Body() body: CreateOperarioBody): Promise<{ id: string }> {
    try {
      return await this.createUseCase.execute({
        fullName: body.fullName,
        documento: body.documento,
        supervisorId: body.supervisorId,
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
  async importOperarios(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportResultDto> {
    // No file or empty buffer → 400
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file provided or file is empty');
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
        `Could not parse file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Empty file (header only, no data rows) → 400
    if (rows.length === 0) {
      throw new BadRequestException('File contains no data rows');
    }

    return this.bulkImportUseCase.execute({ rows });
  }

  // ─── Deactivate ───────────────────────────────────────────────────────────

  @Roles(...OPERARIO_WRITE_ROLES)
  @Patch('operarios/:id/deactivate')
  @HttpCode(HttpStatus.OK)
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
  async reactivateOperario(@Param('id') id: string): Promise<OperarioDto> {
    try {
      return await this.reactivateUseCase.execute(id);
    } catch (err) {
      this.mapDomainError(err);
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
}
