/**
 * AttendanceController — interface layer for the asistencia module.
 *
 * Routes (in order — NestJS matches top-down, literal segments before :params):
 *   POST /asistencia/check-in                               → check-in (SUPERVISOR, 201/200)
 *   POST /asistencia/by-client-ref/:clientRef/check-out    → checkout by check-in clientRef (SUPERVISOR, 200)
 *   POST /asistencia/:id/check-out                         → checkout by server id (SUPERVISOR, 200)
 *   POST /asistencia/:id/signature                         → upload signature (SUPERVISOR, 200)
 *   GET  /asistencia/:id/signature                         → presigned GET URL (scoped, 200)
 *   GET  /asistencia                                       → scoped list (200)
 *   GET  /asistencia/:id                                   → scoped detail (200)
 *
 * Domain error → HTTP mapping (spec §3 + REQ-09..REQ-12):
 *   AttendanceAlreadyExistsError → 409 ConflictException (structured ConflictResponseDto)
 *   AttendanceNotFoundError      → 404 NotFoundException
 *   ImmutableAttendanceError     → 409 ConflictException (structured ConflictResponseDto)
 *   InactiveOperarioError        → 409 ConflictException (plain — not structured)
 *   SignatureRequiredError        → 422 UnprocessableEntityException
 *   InvalidGpsError              → 400 BadRequestException
 *   OperarioNotInScopeError      → 404 NotFoundException (fail-closed)
 *
 * File validation for signature upload is enforced in the use-case (mime + size).
 * The controller passes the raw file buffer to the use-case.
 */

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsDateString, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Roles } from '../../iam/interface/roles.decorator';
import type { CheckInAttendanceUseCase } from '../application/check-in-attendance.use-case';
import type { CheckOutAttendanceUseCase } from '../application/check-out-attendance.use-case';
import type { ListAttendanceUseCase } from '../application/list-attendance.use-case';
import type { GetAttendanceUseCase } from '../application/get-attendance.use-case';
import type { UploadSignatureUseCase } from '../application/upload-signature.use-case';
import type { GetSignatureUrlUseCase } from '../application/get-signature-url.use-case';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import {
  AttendanceAlreadyExistsError,
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  InactiveOperarioError,
  SignatureRequiredError,
  InvalidGpsError,
  OperarioNotInScopeError,
} from '../domain/attendance.errors';
import type { ConflictResponseDto } from '@futuragest/contracts';

// ─── Injection tokens ────────────────────────────────────────────────────────

export const CHECK_IN_USE_CASE = Symbol('CheckInAttendanceUseCase');
export const CHECK_OUT_USE_CASE = Symbol('CheckOutAttendanceUseCase');
export const LIST_ATTENDANCE_USE_CASE = Symbol('ListAttendanceUseCase');
export const GET_ATTENDANCE_USE_CASE = Symbol('GetAttendanceUseCase');
export const UPLOAD_SIGNATURE_USE_CASE = Symbol('UploadSignatureUseCase');
export const GET_SIGNATURE_URL_USE_CASE = Symbol('GetSignatureUrlUseCase');
export const ATTENDANCE_REPO = Symbol('AttendanceRepositoryPort');

// ─── Role constants ───────────────────────────────────────────────────────────

const WRITE_ROLES = ['SUPERVISOR'] as const;

const READ_ROLES = [
  'SUPERVISOR',
  'COORDINADOR',
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'LIDER_OPERATIVO',
] as const;

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class CheckInBody {
  @IsString()
  operarioId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date!: string;

  @IsDateString()
  checkInCapturedAt!: string;

  @IsNumber()
  checkInLat!: number;

  @IsNumber()
  checkInLng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  checkInAccuracy?: number;

  @IsString()
  clientRef!: string;
}

export class CheckOutBody {
  @IsDateString()
  checkOutCapturedAt!: string;

  @IsNumber()
  checkOutLat!: number;

  @IsNumber()
  checkOutLng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  checkOutAccuracy?: number;

  @IsOptional()
  @IsString()
  checkOutClientRef?: string;
}

// ─── Error → HTTP helper ──────────────────────────────────────────────────────

function buildConflictBody(
  conflictType: ConflictResponseDto['conflictType'],
  message: string,
  conflicting: import('@prisma/client').Attendance,
): ConflictResponseDto {
  return {
    error: 'CONFLICT',
    conflictType,
    message,
    conflicting: {
      id: conflicting.id,
      clientRef: conflicting.clientRef ?? null,
      checkOutClientRef: conflicting.checkOutClientRef ?? null,
      date: conflicting.date,
      completedAt: conflicting.completedAt ? conflicting.completedAt.toISOString() : null,
      operarioId: conflicting.operarioId,
      supervisorId: conflicting.supervisorId,
    },
  };
}

function mapDomainError(err: unknown): never {
  if (err instanceof AttendanceAlreadyExistsError) {
    throw new ConflictException(
      buildConflictBody('DUPLICATE_ATTENDANCE_DATE', err.message, err.conflicting),
    );
  }
  if (err instanceof ImmutableAttendanceError) {
    throw new ConflictException(
      buildConflictBody('DOUBLE_CHECKOUT', err.message, err.conflicting),
    );
  }
  if (err instanceof InactiveOperarioError) {
    throw new ConflictException(err.message);
  }
  if (err instanceof AttendanceNotFoundError || err instanceof OperarioNotInScopeError) {
    throw new NotFoundException(err.message);
  }
  if (err instanceof SignatureRequiredError) {
    throw new UnprocessableEntityException(err.message);
  }
  if (err instanceof InvalidGpsError) {
    throw new BadRequestException(err.message);
  }
  throw err;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('asistencia')
export class AttendanceController {
  constructor(
    @Inject(CHECK_IN_USE_CASE)
    private readonly checkInUseCase: Pick<CheckInAttendanceUseCase, 'execute'>,
    @Inject(CHECK_OUT_USE_CASE)
    private readonly checkOutUseCase: Pick<CheckOutAttendanceUseCase, 'execute'>,
    @Inject(LIST_ATTENDANCE_USE_CASE)
    private readonly listUseCase: Pick<ListAttendanceUseCase, 'execute'>,
    @Inject(GET_ATTENDANCE_USE_CASE)
    private readonly getUseCase: Pick<GetAttendanceUseCase, 'execute'>,
    @Inject(UPLOAD_SIGNATURE_USE_CASE)
    private readonly uploadSignatureUseCase: Pick<UploadSignatureUseCase, 'execute'>,
    @Inject(GET_SIGNATURE_URL_USE_CASE)
    private readonly getSignatureUrlUseCase: Pick<GetSignatureUrlUseCase, 'execute'>,
    @Inject(ATTENDANCE_REPO)
    private readonly attendanceRepo: AttendanceRepositoryPort,
  ) {}

  // ── Check-in ───────────────────────────────────────────────────────────────
  // Dynamic status: 201 for a newly created record, 200 for an idempotent clientRef hit.
  // @HttpCode is intentionally absent — status is set via passthrough @Res so Nest still
  // serializes the returned body normally.

  @Roles(...WRITE_ROLES)
  @Post('check-in')
  async checkIn(@Body() body: CheckInBody, @Res({ passthrough: true }) res: Response) {
    try {
      const result = await this.checkInUseCase.execute({
        operarioId: body.operarioId,
        date: body.date,
        checkInCapturedAt: body.checkInCapturedAt,
        checkInLat: body.checkInLat,
        checkInLng: body.checkInLng,
        checkInAccuracy: body.checkInAccuracy,
        clientRef: body.clientRef,
      });
      res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
      return result.record;
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Check-out by check-in clientRef (MUST be declared before :id/check-out) ─
  // Route order: NestJS matches top-down; the literal "by-client-ref" must come
  // before ":id" to prevent the param from capturing the literal string.

  @Roles(...WRITE_ROLES)
  @Post('by-client-ref/:clientRef/check-out')
  async checkOutByClientRef(
    @Param('clientRef') clientRef: string,
    @Body() body: CheckOutBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      // Locate the attendance by check-in clientRef (scope-enforced → 404 if not found/not owned)
      const attendance = await this.attendanceRepo.findByClientRef(clientRef);
      if (!attendance) {
        throw new AttendanceNotFoundError(clientRef);
      }

      const result = await this.checkOutUseCase.execute({
        id: attendance.id,
        checkOutCapturedAt: body.checkOutCapturedAt,
        checkOutLat: body.checkOutLat,
        checkOutLng: body.checkOutLng,
        checkOutAccuracy: body.checkOutAccuracy,
        checkOutClientRef: body.checkOutClientRef,
      });
      res.status(HttpStatus.OK);
      return result.record;
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Check-out by server id ─────────────────────────────────────────────────

  @Roles(...WRITE_ROLES)
  @Post(':id/check-out')
  async checkOut(
    @Param('id') id: string,
    @Body() body: CheckOutBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.checkOutUseCase.execute({
        id,
        checkOutCapturedAt: body.checkOutCapturedAt,
        checkOutLat: body.checkOutLat,
        checkOutLng: body.checkOutLng,
        checkOutAccuracy: body.checkOutAccuracy,
        checkOutClientRef: body.checkOutClientRef,
      });
      res.status(HttpStatus.OK);
      return result.record;
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Signature upload ───────────────────────────────────────────────────────

  @Roles(...WRITE_ROLES)
  @Post(':id/signature')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadSignature(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      return await this.uploadSignatureUseCase.execute({
        id,
        file: {
          buffer: file.buffer,
          mimetype: file.mimetype,
          size: file.size,
        },
      });
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Signature GET ──────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get(':id/signature')
  async getSignatureUrl(@Param('id') id: string) {
    try {
      return await this.getSignatureUrlUseCase.execute({ id });
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── List ───────────────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get()
  async listAttendance() {
    return this.listUseCase.execute();
  }

  // ── Detail ─────────────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get(':id')
  async getAttendance(@Param('id') id: string) {
    try {
      return await this.getUseCase.execute(id);
    } catch (err) {
      mapDomainError(err);
    }
  }
}
