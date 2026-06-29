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
  UnauthorizedException,
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
import type { GetPeriodPayoutUseCase, PeriodPayout } from '../application/get-period-payout.use-case';
import type { ConfirmPeriodPayoutUseCase, ConfirmedPayout } from '../application/confirm-period-payout.use-case';
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
  NonCanonicalPeriodRangeError,
  NonContiguousCloseError,
  ClientRefConflictError,
  PeriodNotClosedError,
  NothingToPayError,
  ZoneIdResolutionError,
} from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import {
  PeriodBalanceResponseDto,
  JornadaPolicyResponseDto,
  CompensationPeriodResponseDto,
  DayBreakdownDto,
  PeriodPayoutResponseDto,
} from './response-dtos';

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const GET_PERIOD_BALANCE_USE_CASE = Symbol('GetPeriodBalanceUseCase');
export const SET_JORNADA_POLICY_USE_CASE = Symbol('SetJornadaPolicyUseCase');
export const GET_JORNADA_POLICY_TIMELINE_USE_CASE = Symbol('GetJornadaPolicyTimelineUseCase');
export const CLOSE_COMPENSATION_PERIOD_USE_CASE = Symbol('CloseCompensationPeriodUseCase');
export const GET_PERIOD_PAYOUT_USE_CASE = Symbol('GetPeriodPayoutUseCase');
export const CONFIRM_PERIOD_PAYOUT_USE_CASE = Symbol('ConfirmPeriodPayoutUseCase');

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

/**
 * Only TALENTO_HUMANO and SYSTEM_ADMIN may read the payout/liquidation of a period.
 * Payout is payroll-sensitive information (decision #174-1 + #174-5).
 */
const PAYOUT_ROLES = ['TALENTO_HUMANO', 'SYSTEM_ADMIN'] as const;

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
  // PR-C errors
  if (err instanceof PeriodNotClosedError) {
    throw new NotFoundException({ error: err.code, message: err.message });
  }
  // Audit fix errors
  if (err instanceof NonCanonicalPeriodRangeError) {
    throw new UnprocessableEntityException({ error: err.code, message: err.message });
  }
  if (err instanceof NonContiguousCloseError) {
    throw new ConflictException({ error: err.code, message: err.message });
  }
  if (err instanceof ClientRefConflictError) {
    throw new ConflictException({ error: err.code, message: err.message });
  }
  // Fix 4 errors
  if (err instanceof NothingToPayError) {
    throw new UnprocessableEntityException({ error: err.code, message: err.message });
  }
  // Fix 7 errors
  if (err instanceof ZoneIdResolutionError) {
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
    carryIn: balance.carryIn.toString(),
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
    paidAt: period.paidAt?.toISOString() ?? null,
    payoutRef: period.payoutRef ?? null,
    divergedAt: period.divergedAt?.toISOString() ?? null,
    createdAt: period.createdAt.toISOString(),
  };
}

function serializePayout(
  payout: PeriodPayout | ConfirmedPayout,
  paidAt?: Date | null,
  payoutRef?: string | null,
): PeriodPayoutResponseDto {
  const confirmedPayout = payout as ConfirmedPayout;
  return {
    operarioId: payout.operarioId,
    periodKey: payout.periodKey,
    saldoHoras: payout.saldoHoras.toString(),
    horasBase: payout.horasBase.toString(),
    factorRecargo: payout.factorRecargo.toString(),
    horasPagables: payout.horasPagables.toString(),
    paidAt: (confirmedPayout.paidAt ?? paidAt ?? null)?.toISOString() ?? null,
    payoutRef: confirmedPayout.payoutRef ?? payoutRef ?? null,
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

// Body DTO for confirm-payout endpoint
export class ConfirmPayoutBody {
  @ApiProperty({ description: 'Canonical fortnight identifier e.g. "2026-05-Q1"', example: '2026-05-Q1' })
  @MatchesValidator(/^\d{4}-\d{2}-Q[12]$/, {
    message: 'periodKey debe tener el formato YYYY-MM-Q1 o YYYY-MM-Q2',
  })
  periodKey!: string;
}

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
    @Inject(GET_PERIOD_PAYOUT_USE_CASE)
    private readonly payoutUseCase: Pick<GetPeriodPayoutUseCase, 'execute'>,
    @Inject(CONFIRM_PERIOD_PAYOUT_USE_CASE)
    private readonly confirmPayoutUseCase: Pick<ConfirmPeriodPayoutUseCase, 'execute'>,
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

    // Extract authenticated user id from JWT subject (set by AuthGuard).
    // Fix 9: missing sub → UnauthorizedException (401) — closing a fortnight with an
    // anonymous author is not permitted (immutable audit trail requires a real user id).
    const sub = (req as unknown as { user?: { sub?: string } }).user?.sub;
    if (!sub) {
      throw new UnauthorizedException('Se requiere autenticación para cerrar una quincena.');
    }
    const approvedByUserId = sub;

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

  // ── GET /compensacion/:operarioId/payout?periodKey ────────────────────────
  // Liquidation of a CLOSED period's positive saldo with the recargo factor (PR-C).
  // Payroll-sensitive → TALENTO_HUMANO + SYSTEM_ADMIN only.

  @Roles(...PAYOUT_ROLES)
  @Get('compensacion/:operarioId/payout')
  @ApiOkResponse({ type: PeriodPayoutResponseDto })
  async getPeriodPayout(
    @Param('operarioId') operarioId: string,
    @Query('periodKey') periodKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PeriodPayoutResponseDto> {
    if (!periodKey || !/^\d{4}-\d{2}-Q[12]$/.test(periodKey)) {
      throw new BadRequestException(
        'El parámetro "periodKey" es requerido en formato YYYY-MM-Q1 o YYYY-MM-Q2',
      );
    }

    try {
      const payout = await this.payoutUseCase.execute({ operarioId, periodKey });
      res.status(HttpStatus.OK);
      return serializePayout(payout);
    } catch (err) {
      mapDomainError(err);
    }
  }

  // ── POST /compensacion/:operarioId/payout/confirm ─────────────────────────
  // Confirms (liquidates) a closed period's payout — stamps paidAt + payoutRef.
  // Idempotent: repeated calls with the same period return the existing confirmation.
  // Fix 4: payout is no longer infinitely re-executable without a record.

  @Roles(...PAYOUT_ROLES)
  @Post('compensacion/:operarioId/payout/confirm')
  @ApiOkResponse({ type: PeriodPayoutResponseDto })
  async confirmPeriodPayout(
    @Param('operarioId') operarioId: string,
    @Body() body: ConfirmPayoutBody,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<PeriodPayoutResponseDto> {
    // confirmedByUserId from JWT subject — required for audit trail
    const sub = (req as unknown as { user?: { sub?: string } }).user?.sub;
    if (!sub) {
      throw new UnauthorizedException('Se requiere autenticación para confirmar un pago.');
    }

    try {
      const confirmed = await this.confirmPayoutUseCase.execute({
        operarioId,
        periodKey: body.periodKey,
        confirmedByUserId: sub,
      });
      res.status(HttpStatus.OK);
      return serializePayout(confirmed);
    } catch (err) {
      mapDomainError(err);
    }
  }
}
