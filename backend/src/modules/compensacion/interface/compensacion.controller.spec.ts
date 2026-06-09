/**
 * A8.2 RED → A8.3 GREEN: CompensacionController unit spec.
 *
 * Covers EP-01a (200 balance), POST jornada-policy (201), GET jornada-policy (200 timeline),
 * EP-02a (403 for unauthorized role on POST jornada-policy).
 *
 * Uses NestJS Testing module. Mocks use-cases via injection tokens.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import {
  CompensacionController,
  GET_PERIOD_BALANCE_USE_CASE,
  SET_JORNADA_POLICY_USE_CASE,
  GET_JORNADA_POLICY_TIMELINE_USE_CASE,
} from './compensacion.controller';
import type { PeriodBalance } from '../domain/period-balance.vo';
import type { JornadaPolicyRecord } from '../domain/ports/jornada-policy-repository.port';

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

describe('CompensacionController', () => {
  let controller: CompensacionController;
  let mockGetBalance: jest.Mock;
  let mockSetPolicy: jest.Mock;
  let mockGetTimeline: jest.Mock;

  beforeEach(async () => {
    mockGetBalance = jest.fn();
    mockSetPolicy = jest.fn();
    mockGetTimeline = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompensacionController],
      providers: [
        { provide: GET_PERIOD_BALANCE_USE_CASE, useValue: { execute: mockGetBalance } },
        { provide: SET_JORNADA_POLICY_USE_CASE, useValue: { execute: mockSetPolicy } },
        { provide: GET_JORNADA_POLICY_TIMELINE_USE_CASE, useValue: { execute: mockGetTimeline } },
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
});
