/**
 * AttendanceController — interface layer for the asistencia module.
 *
 * Routes (in order — NestJS matches top-down, literal segments before :params):
 *   POST /asistencia/check-in                               → check-in (SUPERVISOR, 201/200)
 *   POST /asistencia/by-client-ref/:clientRef/check-out    → checkout by check-in clientRef (SUPERVISOR, 200)
 *   POST /asistencia/:id/check-out                         → checkout by server id (SUPERVISOR, 200)
 *   POST /asistencia/:id/photo                             → upload photo (SUPERVISOR, 200)
 *   GET  /asistencia/:id/photo                             → presigned GET URL (scoped, 200)
 *   GET  /asistencia                                       → scoped list (200)
 *   GET  /asistencia/:id                                   → scoped detail (200)
 *
 * Domain error → HTTP mapping (spec §3 + REQ-09..REQ-12):
 *   AttendanceAlreadyExistsError  → 409 ConflictException (structured ConflictResponseDto)
 *   AttendanceNotFoundError       → 404 NotFoundException
 *   ImmutableAttendanceError      → 409 ConflictException (structured ConflictResponseDto)
 *   InactiveOperarioError         → 409 ConflictException (plain — not structured)
 *   PhotoRequiredError            → 422 UnprocessableEntityException
 *   InvalidGpsError               → 400 BadRequestException
 *   OperarioNotInScopeError       → 404 NotFoundException (fail-closed)
 *   InvalidShiftDurationError     → 422 UnprocessableEntityException (Fix 6)
 *   AttendanceDateMismatchError   → 422 UnprocessableEntityException (Fix 8)
 *
 * File validation for photo upload is enforced in the use-case (mime + size).
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
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadedFile as MulterFile } from '../../../types/uploaded-file';
import { ApiProperty, ApiPropertyOptional, ApiOkResponse, ApiCreatedResponse, ApiOperation } from '@nestjs/swagger';
import {
  AttendanceResponseDto,
  PhotoUploadResponseDto,
  PhotoUrlDto,
} from './response-dtos';
import { IsDateString, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Roles } from '../../iam/interface/roles.decorator';
import type { CheckInAttendanceUseCase } from '../application/check-in-attendance.use-case';
import type { CheckOutAttendanceUseCase } from '../application/check-out-attendance.use-case';
import type { ListAttendanceUseCase } from '../application/list-attendance.use-case';
import type { GetAttendanceUseCase } from '../application/get-attendance.use-case';
import type { UploadPhotoUseCase } from '../application/upload-photo.use-case';
import type { GetPhotoUrlUseCase } from '../application/get-photo-url.use-case';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import {
  AttendanceAlreadyExistsError,
  AttendanceDateMismatchError,
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  InactiveOperarioError,
  InvalidShiftDurationError,
  PhotoRequiredError,
  InvalidGpsError,
  OperarioNotInScopeError,
} from '../domain/attendance.errors';
import type { ConflictResponseDto } from '@futuragest/contracts';

// ─── Injection tokens ────────────────────────────────────────────────────────

export const CHECK_IN_USE_CASE = Symbol('CheckInAttendanceUseCase');
export const CHECK_OUT_USE_CASE = Symbol('CheckOutAttendanceUseCase');
export const LIST_ATTENDANCE_USE_CASE = Symbol('ListAttendanceUseCase');
export const GET_ATTENDANCE_USE_CASE = Symbol('GetAttendanceUseCase');
export const UPLOAD_PHOTO_USE_CASE = Symbol('UploadPhotoUseCase');
export const GET_PHOTO_URL_USE_CASE = Symbol('GetPhotoUrlUseCase');
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
  @ApiProperty({ format: 'uuid' })
  @IsString()
  operarioId!: string;

  @ApiProperty({ description: 'Colombia local date', example: '2026-06-05' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato YYYY-MM-DD',
  })
  date!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  checkInCapturedAt!: string;

  @ApiProperty()
  @IsNumber()
  checkInLat!: number;

  @ApiProperty()
  @IsNumber()
  checkInLng!: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  checkInAccuracy?: number;

  @ApiProperty({ description: 'Idempotency token' })
  @IsString()
  clientRef!: string;

  /**
   * Optional audit label — how the supervisor verified identity before check-in.
   * Stored as-is from the client. AUDIT TRAIL ONLY: no authorization logic may
   * depend on this field.
   */
  @ApiPropertyOptional({
    enum: ['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE'],
    description: 'Verification method used by supervisor. Audit label only.',
  })
  @IsOptional()
  @IsIn(['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE'])
  verification?: 'BIOMETRIC' | 'DEVICE_CREDENTIAL' | 'NONE';
}

// ─── Query DTOs ───────────────────────────────────────────────────────────────

class ListAttendanceQuery {
  /**
   * ISO 8601 cursor — return only records with updatedAt >= since.
   * Mutually exclusive with clientRef (clientRef takes precedence).
   */
  @IsOptional()
  @IsISO8601({}, { message: 'since debe ser una fecha ISO 8601 válida' })
  since?: string;

  /**
   * clientRef recovery — return the single scoped attendance matching this
   * check-in clientRef. Returns 200 [] if not found (not 404).
   * Takes precedence over ?since= when both provided.
   */
  @IsOptional()
  @IsString()
  clientRef?: string;
}

export class CheckOutBody {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  checkOutCapturedAt!: string;

  @ApiProperty()
  @IsNumber()
  checkOutLat!: number;

  @ApiProperty()
  @IsNumber()
  checkOutLng!: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  checkOutAccuracy?: number;

  @ApiPropertyOptional({ description: 'Idempotency token' })
  @IsOptional()
  @IsString()
  checkOutClientRef?: string;

  /**
   * Optional audit label — how the supervisor verified identity before check-out.
   * Stored as-is from the client. AUDIT TRAIL ONLY: no authorization logic may
   * depend on this field.
   */
  @ApiPropertyOptional({
    enum: ['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE'],
    description: 'Verification method used by supervisor. Audit label only.',
  })
  @IsOptional()
  @IsIn(['BIOMETRIC', 'DEVICE_CREDENTIAL', 'NONE'])
  verification?: 'BIOMETRIC' | 'DEVICE_CREDENTIAL' | 'NONE';
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
  if (err instanceof PhotoRequiredError) {
    throw new UnprocessableEntityException(err.message);
  }
  if (err instanceof InvalidShiftDurationError) {
    throw new UnprocessableEntityException(err.message);
  }
  if (err instanceof AttendanceDateMismatchError) {
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
  private readonly logger = new Logger(AttendanceController.name);

  constructor(
    @Inject(CHECK_IN_USE_CASE)
    private readonly checkInUseCase: Pick<CheckInAttendanceUseCase, 'execute'>,
    @Inject(CHECK_OUT_USE_CASE)
    private readonly checkOutUseCase: Pick<CheckOutAttendanceUseCase, 'execute'>,
    @Inject(LIST_ATTENDANCE_USE_CASE)
    private readonly listUseCase: Pick<ListAttendanceUseCase, 'execute'>,
    @Inject(GET_ATTENDANCE_USE_CASE)
    private readonly getUseCase: Pick<GetAttendanceUseCase, 'execute'>,
    @Inject(UPLOAD_PHOTO_USE_CASE)
    private readonly uploadPhotoUseCase: Pick<UploadPhotoUseCase, 'execute'>,
    @Inject(GET_PHOTO_URL_USE_CASE)
    private readonly getPhotoUrlUseCase: Pick<GetPhotoUrlUseCase, 'execute'>,
    @Inject(ATTENDANCE_REPO)
    private readonly attendanceRepo: AttendanceRepositoryPort,
  ) {}

  // ── Check-in ───────────────────────────────────────────────────────────────
  // Dynamic status: 201 for a newly created record, 200 for an idempotent clientRef hit.
  // @HttpCode is intentionally absent — status is set via passthrough @Res so Nest still
  // serializes the returned body normally.

  @Roles(...WRITE_ROLES)
  @Post('check-in')
  @ApiCreatedResponse({ type: AttendanceResponseDto, description: '201 on new record, 200 on idempotent clientRef hit' })
  @ApiOkResponse({ type: AttendanceResponseDto })
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
        verification: body.verification,
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
  @ApiOperation({ summary: 'DEPRECATED — check-out is now virtual', deprecated: true })
  @ApiOkResponse({ type: AttendanceResponseDto })
  async checkOutByClientRef(
    @Param('clientRef') clientRef: string,
    @Body() body: CheckOutBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (process.env.CHECK_OUT_VIRTUAL_ENABLED === 'true') {
      res.status(HttpStatus.GONE);
      return {
        message: 'Manual check-out is deprecated. Check-out is now virtual.',
        code: 'CHECK_OUT_VIRTUAL',
      };
    }
    this.logger.warn('DEPRECATED — check-out is now virtual. Use /jornada/auto-complete instead.');
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
        verification: body.verification,
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
  @ApiOperation({ summary: 'DEPRECATED — check-out is now virtual', deprecated: true })
  @ApiOkResponse({ type: AttendanceResponseDto })
  async checkOut(
    @Param('id') id: string,
    @Body() body: CheckOutBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (process.env.CHECK_OUT_VIRTUAL_ENABLED === 'true') {
      res.status(HttpStatus.GONE);
      return {
        message: 'Manual check-out is deprecated. Check-out is now virtual.',
        code: 'CHECK_OUT_VIRTUAL',
      };
    }
    this.logger.warn('DEPRECATED — check-out is now virtual. Use /jornada/auto-complete instead.');
    try {
      const result = await this.checkOutUseCase.execute({
        id,
        checkOutCapturedAt: body.checkOutCapturedAt,
        checkOutLat: body.checkOutLat,
        checkOutLng: body.checkOutLng,
        checkOutAccuracy: body.checkOutAccuracy,
        checkOutClientRef: body.checkOutClientRef,
        verification: body.verification,
      });
      res.status(HttpStatus.OK);
      return result.record;
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── Photo upload ───────────────────────────────────────────────────────────

  @Roles(...WRITE_ROLES)
  @Post(':id/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOkResponse({ type: PhotoUploadResponseDto })
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
    @Query('phase') phase?: string,
  ) {
    // Validate phase query param — must be exactly 'checkin' or 'checkout' (or absent → 'checkin')
    const resolvedPhase = phase ?? 'checkin';
    if (resolvedPhase !== 'checkin' && resolvedPhase !== 'checkout') {
      throw new BadRequestException(
        `phase debe ser 'checkin' o 'checkout'; se recibió '${resolvedPhase}'`,
      );
    }

    try {
      return await this.uploadPhotoUseCase.execute({
        id,
        phase: resolvedPhase as 'checkin' | 'checkout',
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

  // ── Photo GET ──────────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get(':id/photo')
  @ApiOkResponse({ type: PhotoUrlDto })
  async getPhotoUrl(@Param('id') id: string, @Query('phase') phase?: string) {
    // phase must be 'checkin' or 'checkout' (or absent → 'checkin'). Mirrors uploadPhoto.
    const resolvedPhase = phase ?? 'checkin';
    if (resolvedPhase !== 'checkin' && resolvedPhase !== 'checkout') {
      throw new BadRequestException(
        `phase debe ser 'checkin' o 'checkout'; se recibió '${resolvedPhase}'`,
      );
    }
    try {
      return await this.getPhotoUrlUseCase.execute({
        id,
        phase: resolvedPhase as 'checkin' | 'checkout',
      });
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── List ───────────────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get()
  @ApiOkResponse({ type: AttendanceResponseDto, isArray: true })
  async listAttendance(@Query() rawQuery: Record<string, string>) {
    // Validate query params
    const query = plainToInstance(ListAttendanceQuery, rawQuery);
    const errors = validateSync(query);
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages);
    }

    // ?clientRef= takes precedence over ?since=
    if (query.clientRef) {
      const record = await this.attendanceRepo.findByClientRef(query.clientRef);
      return record ? [record] : [];
    }

    const since = query.since ? new Date(query.since) : undefined;
    return this.listUseCase.execute(since);
  }

  // ── Detail ─────────────────────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get(':id')
  @ApiOkResponse({ type: AttendanceResponseDto })
  async getAttendance(@Param('id') id: string) {
    try {
      return await this.getUseCase.execute(id);
    } catch (err) {
      mapDomainError(err);
    }
  }
}
