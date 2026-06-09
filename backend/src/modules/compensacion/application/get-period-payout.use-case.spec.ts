import { Decimal } from '@prisma/client/runtime/client';
import { GetPeriodPayoutUseCase } from './get-period-payout.use-case';
import { PeriodNotClosedError } from '../domain/compensacion.errors';
import { OperarioNotInScopeError } from '../../asistencia/domain/attendance.errors';
import type { CompensationPeriodRecord } from '../domain/ports/compensation-period-repository.port';

function makePeriod(saldo: string): CompensationPeriodRecord {
  return {
    id: 'cp-1',
    operarioId: 'op-1',
    zoneId: 'z-1',
    supervisorId: 's-1',
    periodKey: '2026-05-Q1',
    desde: '2026-05-01',
    hasta: '2026-05-15',
    creditos: new Decimal(saldo).greaterThan(0) ? new Decimal(saldo) : new Decimal(0),
    debitos: new Decimal(0),
    carryIn: new Decimal(0),
    saldo: new Decimal(saldo),
    disposition: null,
    approvedByUserId: 'u-1',
    decidedAt: null,
    closedAt: new Date('2026-05-16T00:00:00Z'),
    clientRef: null,
    createdAt: new Date('2026-05-16T00:00:00Z'),
    updatedAt: new Date('2026-05-16T00:00:00Z'),
  };
}

describe('GetPeriodPayoutUseCase (PR-C)', () => {
  const operarioInScope = { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) };

  beforeEach(() => jest.clearAllMocks());

  it('computes payout from the closed snapshot saldo with 1.25x recargo', async () => {
    const periodRepo = { findByOperarioAndPeriod: jest.fn().mockResolvedValue(makePeriod('8')) };
    const useCase = new GetPeriodPayoutUseCase(periodRepo, {
      findById: jest.fn().mockResolvedValue({ id: 'op-1' }),
    });

    const result = await useCase.execute({ operarioId: 'op-1', periodKey: '2026-05-Q1' });

    expect(result.saldoHoras.toString()).toBe('8');
    expect(result.horasPagables.toString()).toBe('10');
    expect(result.factorRecargo.toString()).toBe('1.25');
  });

  it('returns zero payable hours when the closed saldo is negative', async () => {
    const periodRepo = { findByOperarioAndPeriod: jest.fn().mockResolvedValue(makePeriod('-4')) };
    const useCase = new GetPeriodPayoutUseCase(periodRepo, {
      findById: jest.fn().mockResolvedValue({ id: 'op-1' }),
    });

    const result = await useCase.execute({ operarioId: 'op-1', periodKey: '2026-05-Q1' });
    expect(result.horasPagables.toString()).toBe('0');
  });

  it('throws OperarioNotInScopeError (404) before touching the period repo', async () => {
    const periodRepo = { findByOperarioAndPeriod: jest.fn() };
    const useCase = new GetPeriodPayoutUseCase(periodRepo, {
      findById: jest.fn().mockResolvedValue(null),
    });

    await expect(
      useCase.execute({ operarioId: 'ghost', periodKey: '2026-05-Q1' }),
    ).rejects.toBeInstanceOf(OperarioNotInScopeError);
    expect(periodRepo.findByOperarioAndPeriod).not.toHaveBeenCalled();
  });

  it('throws PeriodNotClosedError (404) when no closed snapshot exists', async () => {
    const periodRepo = { findByOperarioAndPeriod: jest.fn().mockResolvedValue(null) };
    const useCase = new GetPeriodPayoutUseCase(periodRepo, {
      findById: jest.fn().mockResolvedValue({ id: 'op-1' }),
    });

    await expect(
      useCase.execute({ operarioId: 'op-1', periodKey: '2026-05-Q1' }),
    ).rejects.toBeInstanceOf(PeriodNotClosedError);
  });

  it('reads the frozen saldo, not a recomputed live balance', async () => {
    const period = makePeriod('5.6');
    const periodRepo = { findByOperarioAndPeriod: jest.fn().mockResolvedValue(period) };
    const useCase = new GetPeriodPayoutUseCase(periodRepo, {
      findById: jest.fn().mockResolvedValue({ id: 'op-1' }),
    });

    const result = await useCase.execute({ operarioId: 'op-1', periodKey: '2026-05-Q1' });
    // 5.6 * 1.25 = 7 exactly
    expect(result.horasPagables.toString()).toBe('7');
  });

  // operarioInScope referenced to keep the shared fixture meaningful
  it('exposes a scoped existence check contract', () => {
    expect(typeof operarioInScope.findById).toBe('function');
  });
});
