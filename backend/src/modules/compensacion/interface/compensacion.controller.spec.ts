/**
 * A8.2 RED → A8.3 GREEN (patched): CompensacionController unit spec.
 *
 * Covers:
 *   EP-01a  — 200 balance
 *   EP-01c  — zeros response for no attendances
 *   EP-02b  — 201 valid insert
 *   GET jornada-policy 200 timeline
 *   W3-role — POST /jornada-policy WRITE_POLICY_ROLES must be exactly
 *             [TALENTO_HUMANO, SYSTEM_ADMIN] per decision #174.
 *             COORDINADOR and SUPERVISOR must NOT be in that set.
 *
 * B8.2 PR-B additions:
 *   EP-04a  — POST /compensacion/:operarioId/close → 201 with period snapshot.
 *   EP-04b  — Idempotent re-close (same clientRef) → 200 with existing period.
 *   EP-04d  — Unauthorized role → tested via role metadata assertion.
 *
 * Uses NestJS Testing module + Reflector for metadata assertions. Mocks use-cases
 * via injection tokens.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Decimal } from '@prisma/client/runtime/client';
import {
  CompensacionController,
  GET_PERIOD_BALANCE_USE_CASE,
  SET_JORNADA_POLICY_USE_CASE,
  GET_JORNADA_POLICY_TIMELINE_USE_CASE,
  CLOSE_COMPENSATION_PERIOD_USE_CASE,
  GET_PERIOD_PAYOUT_USE_CASE,
} from './compensacion.controller';
import { ROLES_KEY } from '../../iam/interface/roles.decorator';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import { PeriodNotClosedError } from '../domain/compensacion.errors';
import type { PeriodBalance } from '../domain/period-balance.vo';
import type { JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';
import type { CompensationPeriodRecord } from '../domain/ports/compensation-period-repository.port';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBalance(saldo: number): PeriodBalance {
  const d = (n: number) => new Decimal(n);
  return {
    creditos: d(0.5),
    debitos: d(1.0),
    carryIn: d(0),
    saldo: d(saldo),
    perDay: [
      {
        date: '2026-05-01',
        horasReales: d(7),
        jornadaHoras: d(8),
        delta: d(-1),
      },
    ],
  };
}

function makePolicy(dateStr: string, hours: number): JornadaPolicyRecord {
  return {
    id: `pol-${dateStr}`,
    horasDiarias: new Decimal(hours),
    vigenteDesde: new Date(`${dateStr}T00:00:00Z`),
    createdAt: new Date(),
  };
}

function makePeriodRecord(overrides: Partial<CompensationPeriodRecord> = {}): CompensationPeriodRecord {
  return {
    id: 'cp-1',
    operarioId: 'O1',
    zoneId: 'zone-1',
    supervisorId: 'sup-1',
    periodKey: '2026-05-Q1',
    desde: '2026-05-01',
    hasta: '2026-05-15',
    creditos: new Decimal('0.50'),
    debitos: new Decimal('1.00'),
    carryIn: new Decimal('0.00'),
    saldo: new Decimal('-0.50'),
    disposition: 'CARRY_OVER',
    approvedByUserId: 'admin-user',
    decidedAt: new Date(),
    closedAt: new Date(),
    clientRef: 'ref-abc',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CompensacionController', () => {
  let controller: CompensacionController;
  let mockGetBalance: jest.Mock;
  let mockSetPolicy: jest.Mock;
  let mockGetTimeline: jest.Mock;
  let mockClosePeriod: jest.Mock;
  let mockPayout: jest.Mock;

  beforeEach(async () => {
    mockGetBalance = jest.fn();
    mockSetPolicy = jest.fn();
    mockGetTimeline = jest.fn();
    mockClosePeriod = jest.fn();
    mockPayout = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompensacionController],
      providers: [
        { provide: GET_PERIOD_BALANCE_USE_CASE, useValue: { execute: mockGetBalance } },
        { provide: SET_JORNADA_POLICY_USE_CASE, useValue: { execute: mockSetPolicy } },
        { provide: GET_JORNADA_POLICY_TIMELINE_USE_CASE, useValue: { execute: mockGetTimeline } },
        { provide: CLOSE_COMPENSATION_PERIOD_USE_CASE, useValue: { execute: mockClosePeriod } },
        { provide: GET_PERIOD_PAYOUT_USE_CASE, useValue: { execute: mockPayout } },
      ],
    })
      .overrideGuard(require('../../auth/interface/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../iam/interface/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../auth/interface/must-change-password.guard').MustChangePasswordGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CompensacionController>(CompensacionController);
  });

  // ── GET /compensacion/:operarioId ──────────────────────────────────────────

  describe('getPeriodBalance', () => {
    it('EP-01a — returns 200 with serialized balance', async () => {
      const balance = makeBalance(-0.5);
      mockGetBalance.mockResolvedValue(balance);

      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      const result = await controller.getPeriodBalance('O1', '2026-05-01', '2026-05-15', mockRes);

      expect(result).toBeDefined();
      expect(result.saldoHoras).toBe('-0.5');
      expect(result.operarioId).toBe('O1');
      expect(result.desde).toBe('2026-05-01');
      expect(result.breakdown).toHaveLength(1);
    });

    it('EP-01b — use-case throws OperarioNotInScopeError → NotFoundException (404)', async () => {
      mockGetBalance.mockRejectedValue(new OperarioNotInScopeError('OUT-OF-SCOPE'));

      const mockRes = { status: jest.fn().mockReturnThis() } as any;

      await expect(
        controller.getPeriodBalance('OUT-OF-SCOPE', '2026-05-01', '2026-05-15', mockRes),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('EP-01c — no attendances → zeros in response', async () => {
      const balance: PeriodBalance = {
        creditos: new Decimal(0),
        debitos: new Decimal(0),
        carryIn: new Decimal(0),
        saldo: new Decimal(0),
        perDay: [],
      };
      mockGetBalance.mockResolvedValue(balance);

      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      const result = await controller.getPeriodBalance('O1', '2026-05-01', '2026-05-15', mockRes);

      expect(result.saldoHoras).toBe('0');
      expect(result.breakdown).toHaveLength(0);
    });
  });

  // ── POST /jornada-policy ───────────────────────────────────────────────────

  describe('setJornadaPolicy', () => {
    it('EP-02b — valid insert → 201 with policy', async () => {
      const created = makePolicy('2026-07-01', 8);
      mockSetPolicy.mockResolvedValue(created);

      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      const result = await controller.setJornadaPolicy(
        { horasDiarias: 8, vigenteDesde: '2026-07-01' },
        mockRes,
      );

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result.horasDiarias).toBe('8');
    });
  });

  // ── GET /jornada-policy ────────────────────────────────────────────────────

  describe('getJornadaPolicyTimeline', () => {
    it('returns timeline with two policies', async () => {
      const timeline = [makePolicy('2025-01-01', 8), makePolicy('2026-01-01', 7.5)];
      mockGetTimeline.mockResolvedValue(timeline);

      const result = await controller.getJornadaPolicyTimeline();

      expect(result).toHaveLength(2);
      expect(result[0].horasDiarias).toBe('8');
      expect(result[1].horasDiarias).toBe('7.5');
    });
  });

  // ── W3 — WRITE_POLICY_ROLES metadata assertion ────────────────────────────
  //
  // Per decision #174: JornadaPolicy authoring roles = TALENTO_HUMANO + SYSTEM_ADMIN.
  // COORDINADOR must NOT be in the set (it was the stale comment value).
  // SUPERVISOR must NOT be in the set (least-privileged operational role).

  describe('WRITE_POLICY_ROLES — @Roles metadata on setJornadaPolicy', () => {
    it('W3 — setJornadaPolicy requires exactly TALENTO_HUMANO and SYSTEM_ADMIN', () => {
      const reflector = new Reflector();
      const roles: string[] = reflector.get(ROLES_KEY, controller.setJornadaPolicy);

      // Must contain the two authoritative roles
      expect(roles).toContain('TALENTO_HUMANO');
      expect(roles).toContain('SYSTEM_ADMIN');

      // COORDINADOR was the stale comment value — must be removed
      expect(roles).not.toContain('COORDINADOR');

      // SUPERVISOR must never author policy
      expect(roles).not.toContain('SUPERVISOR');
    });
  });

  // ── B8.2 POST /compensacion/:operarioId/close ──────────────────────────────

  describe('closeFortnight', () => {
    it('EP-04a — first close → 201 with CompensationPeriodResponseDto', async () => {
      const period = makePeriodRecord();
      mockClosePeriod.mockResolvedValue({ period, idempotent: false });

      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      const mockReq = { user: { sub: 'admin-user' } } as any;

      const result = await controller.closeFortnight(
        'O1',
        {
          desde: '2026-05-01',
          hasta: '2026-05-15',
          disposition: 'CARRY_OVER',
          clientRef: 'ref-abc',
        },
        mockRes,
        mockReq,
      );

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result.periodKey).toBe('2026-05-Q1');
      expect(result.disposition).toBe('CARRY_OVER');
      expect(result.saldoHoras).toBe('-0.5');
    });

    it('EP-04b — idempotent re-close (same clientRef) → 200 with existing period', async () => {
      const period = makePeriodRecord();
      mockClosePeriod.mockResolvedValue({ period, idempotent: true });

      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      const mockReq = { user: { sub: 'admin-user' } } as any;

      const result = await controller.closeFortnight(
        'O1',
        {
          desde: '2026-05-01',
          hasta: '2026-05-15',
          disposition: 'CARRY_OVER',
          clientRef: 'ref-abc',
        },
        mockRes,
        mockReq,
      );

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result.periodKey).toBe('2026-05-Q1');
    });

    it('EP-04d — CLOSE_ROLES metadata: only TALENTO_HUMANO and SYSTEM_ADMIN', () => {
      const reflector = new Reflector();
      const roles: string[] = reflector.get(ROLES_KEY, controller.closeFortnight);

      expect(roles).toContain('TALENTO_HUMANO');
      expect(roles).toContain('SYSTEM_ADMIN');
      expect(roles).not.toContain('COORDINATOR');
      expect(roles).not.toContain('SUPERVISOR');
    });
  });

  // ── PR-C GET /compensacion/:operarioId/payout ──────────────────────────────

  describe('getPeriodPayout', () => {
    it('EP-05a — returns 200 with serialized payout', async () => {
      mockPayout.mockResolvedValue({
        operarioId: 'O1',
        periodKey: '2026-05-Q1',
        saldoHoras: new Decimal('8'),
        horasBase: new Decimal('8'),
        factorRecargo: new Decimal('1.25'),
        horasPagables: new Decimal('10'),
      });

      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      const result = await controller.getPeriodPayout('O1', '2026-05-Q1', mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result.horasPagables).toBe('10');
      expect(result.factorRecargo).toBe('1.25');
      expect(result.saldoHoras).toBe('8');
    });

    it('EP-05b — invalid periodKey → 400 BadRequest', async () => {
      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      await expect(
        controller.getPeriodPayout('O1', 'not-a-period', mockRes),
      ).rejects.toMatchObject({ status: 400 });
      expect(mockPayout).not.toHaveBeenCalled();
    });

    it('EP-05c — PeriodNotClosedError → 404 NotFound', async () => {
      mockPayout.mockRejectedValue(new PeriodNotClosedError('O1', '2026-05-Q1'));

      const mockRes = { status: jest.fn().mockReturnThis() } as any;
      await expect(
        controller.getPeriodPayout('O1', '2026-05-Q1', mockRes),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('EP-05d — PAYOUT_ROLES metadata: only TALENTO_HUMANO and SYSTEM_ADMIN', () => {
      const reflector = new Reflector();
      const roles: string[] = reflector.get(ROLES_KEY, controller.getPeriodPayout);

      expect(roles).toContain('TALENTO_HUMANO');
      expect(roles).toContain('SYSTEM_ADMIN');
      expect(roles).not.toContain('SUPERVISOR');
      expect(roles).not.toContain('COORDINADOR');
    });
  });
});
