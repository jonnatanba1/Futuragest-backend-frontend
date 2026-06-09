/**
 * CompensacionController — interface layer for the compensacion module.
 *
 * Routes:
 *   GET  /compensacion/:operarioId?desde&hasta  → live period balance (READ_ROLES)
 *   POST /jornada-policy                        → insert new policy (WRITE_POLICY_ROLES)
 *   GET  /jornada-policy                        → policy timeline (READ_ROLES)
 *
 * Domain error → HTTP mapping (spec §7):
 *   NoPolicyForDateError                        → 422 UnprocessableEntityException
 *   JornadaPolicyOverlapsLiquidatedPeriodError  → 409 ConflictException
 *   JornadaPolicyDuplicateEffectiveDateError    → 409 ConflictException
 *   JornadaPolicyInvalidHorasError              → 400 BadRequestException
 *   OperarioNotInScopeError                     → 404 NotFoundException (fail-closed)
 *
 * Date query params validated with @Matches(/^\d{4}-\d{2}-\d{2}$/) (asistencia pattern).
 */

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import {
  IsNumber as IsNumberValidator,
  Max,
  Min,
  Matches as MatchesValidator,
  IsOptional,
  IsEnum,
} from 'class-validator';
import type { Request, Response } from 'express';
import { Roles } from '../../iam/interface/roles.decorator';
import type { GetPeriodBalanceUseCase } from '../application/get-period-balance.use-case';
import type { SetJornadaPolicyUseCase } from '../application/set-jornada-policy.use-case';
import type { GetJornadaPolicyTimelineUseCase } from '../application/get-jornada-policy-timeline.use-case';
import type { CloseCompensationPeriodUseCase } from '../application/close-compensation-period.use-case';
import type { PeriodBalance } from '../domain/period-balance.vo';
import type { JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type {
  CompensationPeriodRecord,
  CompensationDisposition,
} from '../domain/ports/compensation-period-repository.port';
import {
  NoPolicyForDateError,
  JornadaPolicyOverlapsLiquidatedPeriodError,
  JornadaPolicyDuplicateEffectiveDateError,
  JornadaPolicyInvalidHorasError,
  CompensationPeriodAlreadyClosedError,
  DispositionRequiredError,
} from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import {
  PeriodBalanceResponseDto,
  JornadaPolicyResponseDto,
  CompensationPeriodResponseDto,
  DayBreakdownDto,
} from './response-dtos';

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const GET_PERIOD_BALANCE_USE_CASE = Symbol('GetPeriodBalanceUseCase');
export const SET_JORNADA_POLICY_USE_CASE = Symbol('SetJornadaPolicyUseCase');
export const GET_JORNADA_POLICY_TIMELINE_USE_CASE = Symbol('GetJornadaPolicyTimelineUseCase');
export const CLOSE_COMPENSATION_PERIOD_USE_CASE = Symbol('CloseCompensationPeriodUseCase');

// ─── Role constants ────────────────────────────────────────────────────────────

const READ_ROLES = [
  'SUPERVISOR',
  'COORDINADOR',
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'LIDER_OPERATIVO',
] as const;

/**
 * Only TALENTO_HUMANO and SYSTEM_ADMIN may create JornadaPolicy.
 * JornadaPolicy is a company-wide HR policy (jornada laboral), not an operational
 * supervisory action — per decision #174 the authoring authority is TALENTO_HUMANO
 * and SYSTEM_ADMIN. COORDINADOR is explicitly excluded (spec REQ-RBAC-02 + decision #174).
 */
const WRITE_POLICY_ROLES = ['TALENTO_HUMANO', 'SYSTEM_ADMIN'] as const;

/**
 * Only TALENTO_HUMANO and SYSTEM_ADMIN may close a fortnight and decide disposition.
 * Decision #174-5 (REQ-RBAC-03): fortnight close requires HR authority.
 */
const CLOSE_PERIOD_ROLES = ['TALENTO_HUMANO', 'SYSTEM_ADMIN'] as const;

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class SetJornadaPolicyBody {
  @ApiProperty({ description: 'Daily work hours [0.5, 24]', example: 8 })
  @IsNumberValidator()
  @Min(0.5)
  @Max(24)
  horasDiarias!: number;

  @ApiProperty({ description: 'Effective date — YYYY-MM-DD Colombia local', example: '2026-07-01' })
  @MatchesValidator(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'vigenteDesde debe tener el formato YYYY-MM-DD',
  })
  vigenteDesde!: string;
}

export class CloseFortnightBody {
  @ApiProperty({ description: 'Fortnight start — YYYY-MM-DD Colombia local (inclusive)', example: '2026-05-01' })
  @MatchesValidator(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener el formato YYYY-MM-DD' })
  desde!: string;

  @ApiProperty({ description: 'Fortnight end — YYYY-MM-DD Colombia local (inclusive)', example: '2026-05-15' })
  @MatchesValidator(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener el formato YYYY-MM-DD' })
  hasta!: string;

  @ApiProperty({
    description: 'Required when saldo < 0. CARRY_OVER rolls debt to next period; PAYROLL_DEDUCTION settles in payroll.',
    enum: ['CARRY_OVER', 'PAYROLL_DEDUCTION'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['CARRY_OVER', 'PAYROLL_DEDUCTION'], { message: 'disposition debe ser CARRY_OVER o PAYROLL_DEDUCTION' })
  disposition?: CompensationDisposition | null;

  @ApiProperty({ description: 'Optional client idempotency token', required: false })
  @IsOptional()
  clientRef?: string | null;
}

// ─── Error → HTTP helper ──────────────────────────────────────────────────────

function mapDomainError(err: unknown): never {
  if (err instanceof NoPolicyForDateError) {
    throw new UnprocessableEntityException({ error: err.code, message: err.message });
  }
  if (err instanceof JornadaPolicyOverlapsLiquidatedPeriodError) {
    throw new ConflictException({ error: err.code, message: err.message });
  }
  if (err instanceof JornadaPolicyDuplicateEffectiveDateError) {
    throw new ConflictException({ error: err.code, message: err.message });
  }
  if (err instanceof JornadaPolicyInvalidHorasError) {
    throw new BadRequestException({ error: err.code, message: err.message });
  }
  if (err instanceof OperarioNotInScopeError) {
    throw new NotFoundException(err.message);
  }
  // PR-B errors
  if (err instanceof CompensationPeriodAlreadyClosedError) {
    throw new ConflictException({ error: err.code, message: err.message });
  }
  if (err instanceof DispositionRequiredError) {
    throw new UnprocessableEntityException({ error: err.code, message: err.message });
  }
  throw err;
}

// ─── Serialization helpers ────────────────────────────────────────────────────

function serializeBalance(
  operarioId: string,
  desde: string,
  hasta: string,
  balance: PeriodBalance,
): PeriodBalanceResponseDto {
  const breakdown: DayBreakdownDto[] = balance.perDay.map((day) => ({
    date: day.date,
    horasReales: day.horasReales.toString(),
    jornadaHoras: day.jornadaHoras.toString(),
    delta: day.delta.toString(),
  }));

  return {
    operarioId,
    desde,
    hasta,
    creditosHoras: balance.creditos.toString(),
    debitosHoras: balance.debitos.toString(),
    saldoHoras: balance.saldo.toString(),
    breakdown,
  };
}

function serializePolicy(policy: JornadaPolicyRecord): JornadaPolicyResponseDto {
  return {
    id: policy.id,
    horasDiarias: policy.horasDiarias.toString(),
    vigenteDesde: policy.vigenteDesde.toISOString(),
    createdAt: policy.createdAt.toISOString(),
  };
}

function serializePeriod(period: CompensationPeriodRecord): CompensationPeriodResponseDto {
  return {
    id: period.id,
    operarioId: period.operarioId,
    periodKey: period.periodKey,
    desde: period.desde,
    hasta: period.hasta,
    creditosHoras: period.creditos.toString(),
    debitosHoras: period.debitos.toString(),
    carryIn: period.carryIn.toString(),
    saldoHoras: period.saldo.toString(),
    disposition: period.disposition,
    approvedByUserId: period.approvedByUserId,
    decidedAt: period.decidedAt?.toISOString() ?? null,
    closedAt: period.closedAt.toISOString(),
    clientRef: period.clientRef,
    createdAt: period.createdAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller()
export class CompensacionController {
  constructor(
    @Inject(GET_PERIOD_BALANCE_USE_CASE)
    private readonly getBalanceUseCase: Pick<GetPeriodBalanceUseCase, 'execute'>,
    @Inject(SET_JORNADA_POLICY_USE_CASE)
    private readonly setJornadaPolicyUseCase: Pick<SetJornadaPolicyUseCase, 'execute'>,
    @Inject(GET_JORNADA_POLICY_TIMELINE_USE_CASE)
    private readonly getTimelineUseCase: Pick<GetJornadaPolicyTimelineUseCase, 'execute'>,
    @Inject(CLOSE_COMPENSATION_PERIOD_USE_CASE)
    private readonly closeUseCase: Pick<CloseCompensationPeriodUseCase, 'execute'>,
  ) {}

  // ── GET /compensacion/:operarioId?desde&hasta ─────────────────────────────

  @Roles(...READ_ROLES)
  @Get('compensacion/:operarioId')
  @ApiOkResponse({ type: PeriodBalanceResponseDto })
  async getPeriodBalance(
    @Param('operarioId') operarioId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PeriodBalanceResponseDto> {
    // Validate date query params
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!desde || !dateRegex.test(desde) || !hasta || !dateRegex.test(hasta)) {
      throw new BadRequestException(
        'Los parámetros "desde" y "hasta" son requeridos en formato YYYY-MM-DD',
      );
    }
    if (desde > hasta) {
      throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
    }

    try {
      const balance = await this.getBalanceUseCase.execute({ operarioId, desde, hasta });
      res.status(HttpStatus.OK);
      return serializeBalance(operarioId, desde, hasta, balance);
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── POST /jornada-policy ──────────────────────────────────────────────────

  @Roles(...WRITE_POLICY_ROLES)
  @Post('jornada-policy')
  @ApiCreatedResponse({ type: JornadaPolicyResponseDto })
  async setJornadaPolicy(
    @Body() body: SetJornadaPolicyBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JornadaPolicyResponseDto> {
    try {
      const policy = await this.setJornadaPolicyUseCase.execute({
        horasDiarias: body.horasDiarias,
        vigenteDesde: body.vigenteDesde,
      });
      res.status(HttpStatus.CREATED);
      return serializePolicy(policy);
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── GET /jornada-policy ───────────────────────────────────────────────────

  @Roles(...READ_ROLES)
  @Get('jornada-policy')
  @ApiOkResponse({ type: JornadaPolicyResponseDto, isArray: true })
  async getJornadaPolicyTimeline(): Promise<JornadaPolicyResponseDto[]> {
    const timeline = await this.getTimelineUseCase.execute();
    return timeline.map(serializePolicy);
  }

  // ── POST /compensacion/:operarioId/close ─────────────────────────────────
  // Closes a fortnight for an operario (immutable snapshot).
  // Returns HTTP 201 (new close) or HTTP 200 (idempotent replay) — both passthrough @Res.
  // approvedByUserId is taken from the JWT subject (req.user.sub).

  @Roles(...CLOSE_PERIOD_ROLES)
  @Post('compensacion/:operarioId/close')
  @ApiCreatedResponse({ type: CompensationPeriodResponseDto })
  @ApiOkResponse({ type: CompensationPeriodResponseDto })
  async closeFortnight(
    @Param('operarioId') operarioId: string,
    @Body() body: CloseFortnightBody,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<CompensationPeriodResponseDto> {
    // Validate date fields
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!body.desde || !dateRegex.test(body.desde) || !body.hasta || !dateRegex.test(body.hasta)) {
      throw new BadRequestException(
        'Los campos "desde" y "hasta" son requeridos en formato YYYY-MM-DD',
      );
    }
    if (body.desde > body.hasta) {
      throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
    }

    // Extract authenticated user id from JWT subject (set by AuthGuard)
    const approvedByUserId = (req as unknown as { user?: { sub?: string } }).user?.sub ?? 'unknown';

    try {
      const { period, idempotent } = await this.closeUseCase.execute({
        operarioId,
        desde: body.desde,
        hasta: body.hasta,
        disposition: body.disposition ?? null,
        approvedByUserId,
        clientRef: body.clientRef ?? null,
      });

      res.status(idempotent ? HttpStatus.OK : HttpStatus.CREATED);
      return serializePeriod(period);
    } catch (err) {
      mapDomainError(err);
    }
  }
}
