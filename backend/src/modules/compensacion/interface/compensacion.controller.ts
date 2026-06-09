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
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import { IsNumber as IsNumberValidator, Max, Min, Matches as MatchesValidator } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../../iam/interface/roles.decorator';
import type { GetPeriodBalanceUseCase } from '../application/get-period-balance.use-case';
import type { SetJornadaPolicyUseCase } from '../application/set-jornada-policy.use-case';
import type { GetJornadaPolicyTimelineUseCase } from '../application/get-jornada-policy-timeline.use-case';
import type { PeriodBalance } from '../domain/period-balance.vo';
import type { JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import {
  NoPolicyForDateError,
  JornadaPolicyOverlapsLiquidatedPeriodError,
  JornadaPolicyDuplicateEffectiveDateError,
  JornadaPolicyInvalidHorasError,
} from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import {
  PeriodBalanceResponseDto,
  JornadaPolicyResponseDto,
  DayBreakdownDto,
} from './response-dtos';

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const GET_PERIOD_BALANCE_USE_CASE = Symbol('GetPeriodBalanceUseCase');
export const SET_JORNADA_POLICY_USE_CASE = Symbol('SetJornadaPolicyUseCase');
export const GET_JORNADA_POLICY_TIMELINE_USE_CASE = Symbol('GetJornadaPolicyTimelineUseCase');

// ─── Role constants ────────────────────────────────────────────────────────────

const READ_ROLES = [
  'SUPERVISOR',
  'COORDINADOR',
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'LIDER_OPERATIVO',
] as const;

/** Only COORDINADOR and SYSTEM_ADMIN may create/modify JornadaPolicy (spec REQ-RBAC-02). */
const WRITE_POLICY_ROLES = ['COORDINADOR', 'SYSTEM_ADMIN', 'TALENTO_HUMANO'] as const;

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
}
