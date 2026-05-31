/**
 * NovedadController — interface layer for the novedades module.
 *
 * Routes (spec REQ-06):
 *   POST /asistencia/:attendanceId/novedades  @Roles(SUPERVISOR) → 201 NovedadDto
 *   GET  /novedades                           @Roles(read-roles)  → 200 NovedadDto[]
 *   GET  /novedades/:id                       @Roles(read-roles)  → 200 NovedadDto | 404
 *   PATCH /novedades/:id/approve              @Roles(LIDER_OPERATIVO,SYSTEM_ADMIN) → 200
 *   PATCH /novedades/:id/reject               @Roles(LIDER_OPERATIVO,SYSTEM_ADMIN) → 200
 *   DELETE /novedades/:id                     @Roles(SUPERVISOR) → 204
 *
 * Domain error → HTTP mapping:
 *   NovedadNotFoundError / AttendanceNotFoundError → 404 NotFoundException
 *   NovedadAlreadyExistsError                      → 409 ConflictException
 *   AttendanceNotCompletedError                    → 409 ConflictException
 *   ImmutableNovedadError                          → 409 ConflictException
 *   InvalidHorasExtraError                         → 400 BadRequestException
 *
 * horasExtra: Prisma Decimal serializes to JSON string — no extra conversion needed.
 * supervisorId/zoneId/approvedByUserId: server-derived only (never from body).
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
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsISO8601, IsNumberString, IsOptional, IsString } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Roles } from '../../iam/interface/roles.decorator';
import type { CreateNovedadUseCase } from '../application/create-novedad.use-case';
import type { ApproveNovedadUseCase } from '../application/approve-novedad.use-case';
import type { RejectNovedadUseCase } from '../application/reject-novedad.use-case';
import type { CancelNovedadUseCase } from '../application/cancel-novedad.use-case';
import type { GetNovedadUseCase } from '../application/get-novedad.use-case';
import type { ListNovedadesUseCase } from '../application/list-novedades.use-case';
import {
  NovedadNotFoundError,
  AttendanceNotFoundError,
  NovedadAlreadyExistsError,
  AttendanceNotCompletedError,
  ImmutableNovedadError,
  InvalidHorasExtraError,
} from '../domain/novedad.errors';

// ─── Injection tokens ──────────────────────────────────────────────────────────

export const CREATE_NOVEDAD_USE_CASE = Symbol('CreateNovedadUseCase');
export const APPROVE_NOVEDAD_USE_CASE = Symbol('ApproveNovedadUseCase');
export const REJECT_NOVEDAD_USE_CASE = Symbol('RejectNovedadUseCase');
export const CANCEL_NOVEDAD_USE_CASE = Symbol('CancelNovedadUseCase');
export const GET_NOVEDAD_USE_CASE = Symbol('GetNovedadUseCase');
export const LIST_NOVEDADES_USE_CASE = Symbol('ListNovedadesUseCase');

// ─── Role constants ────────────────────────────────────────────────────────────

const CREATE_ROLES = ['SUPERVISOR'] as const;
const APPROVE_REJECT_ROLES = ['LIDER_OPERATIVO', 'SYSTEM_ADMIN'] as const;
const CANCEL_ROLES = ['SUPERVISOR'] as const;
const READ_ROLES = [
  'SUPERVISOR',
  'COORDINADOR',
  'LIDER_OPERATIVO',
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
] as const;

// ─── Query DTOs ───────────────────────────────────────────────────────────────

class ListNovedadesQuery {
  /** ISO 8601 cursor — return only records with updatedAt >= since (delta mode). */
  @IsOptional()
  @IsISO8601({}, { message: 'since must be a valid ISO 8601 date string' })
  since?: string;
}

// ─── Request DTOs ──────────────────────────────────────────────────────────────

export class CreateNovedadBody {
  /**
   * Overtime hours — must be a positive number string <= 24.
   * Stored as Decimal(5,2) in DB; serialized as string in JSON responses.
   */
  @IsNumberString({}, { message: 'horasExtra must be a numeric string (e.g. "2.50")' })
  horasExtra!: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  /** Optional idempotency token for offline sync (e.g. UUID v4). */
  @IsOptional()
  @IsString()
  clientRef?: string;
}

// ─── Error → HTTP helper ───────────────────────────────────────────────────────

function mapDomainError(err: unknown): never {
  if (err instanceof NovedadNotFoundError || err instanceof AttendanceNotFoundError) {
    throw new NotFoundException(err.message);
  }
  if (
    err instanceof NovedadAlreadyExistsError ||
    err instanceof AttendanceNotCompletedError ||
    err instanceof ImmutableNovedadError
  ) {
    throw new ConflictException(err.message);
  }
  if (err instanceof InvalidHorasExtraError) {
    throw new BadRequestException(err.message);
  }
  throw err;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller()
export class NovedadController {
  constructor(
    @Inject(CREATE_NOVEDAD_USE_CASE)
    private readonly createUseCase: Pick<CreateNovedadUseCase, 'execute'>,
    @Inject(APPROVE_NOVEDAD_USE_CASE)
    private readonly approveUseCase: Pick<ApproveNovedadUseCase, 'execute'>,
    @Inject(REJECT_NOVEDAD_USE_CASE)
    private readonly rejectUseCase: Pick<RejectNovedadUseCase, 'execute'>,
    @Inject(CANCEL_NOVEDAD_USE_CASE)
    private readonly cancelUseCase: Pick<CancelNovedadUseCase, 'execute'>,
    @Inject(GET_NOVEDAD_USE_CASE)
    private readonly getUseCase: Pick<GetNovedadUseCase, 'execute'>,
    @Inject(LIST_NOVEDADES_USE_CASE)
    private readonly listUseCase: Pick<ListNovedadesUseCase, 'execute'>,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  @Roles(...CREATE_ROLES)
  @Post('asistencia/:attendanceId/novedades')
  async createNovedad(
    @Param('attendanceId') attendanceId: string,
    @Body() body: CreateNovedadBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.createUseCase.execute({
        attendanceId,
        horasExtra: body.horasExtra,
        motivo: body.motivo,
        clientRef: body.clientRef,
      });
      res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
      return result.record;
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── List ───────────────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get('novedades')
  async listNovedades(@Query() rawQuery: Record<string, string>) {
    // Validate query params
    const query = plainToInstance(ListNovedadesQuery, rawQuery);
    const errors = validateSync(query);
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages);
    }

    const since = query.since ? new Date(query.since) : undefined;
    return this.listUseCase.execute(since);
  }

  // ── Detail ─────────────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get('novedades/:id')
  async getNovedad(@Param('id') id: string) {
    try {
      return await this.getUseCase.execute(id);
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  @Roles(...APPROVE_REJECT_ROLES)
  @Patch('novedades/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveNovedad(@Param('id') id: string) {
    try {
      return await this.approveUseCase.execute(id);
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  @Roles(...APPROVE_REJECT_ROLES)
  @Patch('novedades/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectNovedad(@Param('id') id: string) {
    try {
      return await this.rejectUseCase.execute(id);
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Cancel/Delete ──────────────────────────────────────────────────────────

  @Roles(...CANCEL_ROLES)
  @Delete('novedades/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelNovedad(@Param('id') id: string) {
    try {
      await this.cancelUseCase.execute(id);
    } catch (err) {
      mapDomainError(err);
    }
  }
}
