/**
 * T-19 — Unit spec for ApproveNovedadUseCase
 *
 * Covers: NV-44, NV-45
 */

import { ApproveNovedadUseCase } from './approve-novedad.use-case';
import { ImmutableNovedadError, NovedadNotFoundError } from '../domain/novedad.errors';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';

function makeScopeHolder(userId = 'lider-user-id'): ScopeContextHolder {
  return {
    current: () => ({
      userId,
      role: 'LIDER_OPERATIVO',
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockRepo(overrides: Partial<NovedadRepositoryPort> = {}): NovedadRepositoryPort {
  return {
    create: jest.fn(),
    findByIdScoped: jest.fn().mockResolvedValue({
      id: 'nov-1',
      status: 'PENDING',
      supervisorId: 'sup-s1',
      zoneId: 'zone-z1',
    }),
    findManyScoped: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn().mockResolvedValue({
      id: 'nov-1',
      status: 'APPROVED',
      approvedByUserId: 'lider-user-id',
      decidedAt: new Date(),
    }),
    delete: jest.fn(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('ApproveNovedadUseCase', () => {
  describe('NV-44 — PENDING → APPROVED, approvedByUserId from scope', () => {
    it('calls updateStatus with APPROVED and userId from scope holder', async () => {
      const repo = makeMockRepo();
      const scopeHolder = makeScopeHolder('lider-user-id');

      const useCase = new ApproveNovedadUseCase(repo, scopeHolder);
      const result = await useCase.execute('nov-1');

      expect(repo.findByIdScoped).toHaveBeenCalledWith('nov-1');
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'nov-1',
        expect.objectContaining({
          status: 'APPROVED',
          approvedByUserId: 'lider-user-id',
          decidedAt: expect.any(Date),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('NV-45 — already-decided → ImmutableNovedadError, update NOT called', () => {
    it('throws ImmutableNovedadError when status is APPROVED', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue({ id: 'nov-1', status: 'APPROVED' }),
      });
      const scopeHolder = makeScopeHolder();

      const useCase = new ApproveNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-1')).rejects.toThrow(ImmutableNovedadError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws ImmutableNovedadError when status is REJECTED', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue({ id: 'nov-1', status: 'REJECTED' }),
      });
      const scopeHolder = makeScopeHolder();

      const useCase = new ApproveNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-1')).rejects.toThrow(ImmutableNovedadError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('novedad not found → NovedadNotFoundError', () => {
    it('throws NovedadNotFoundError when repo returns null', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue(null),
      });
      const scopeHolder = makeScopeHolder();

      const useCase = new ApproveNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('not-found')).rejects.toThrow(NovedadNotFoundError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ── VM-06..VM-07 — VerificationMethod (decisionVerification) ──────────────

  describe('VM-06 — approve with verification → persists decisionVerification', () => {
    it('passes decisionVerification: BIOMETRIC to updateStatus when provided', async () => {
      const repo = makeMockRepo();
      const scopeHolder = makeScopeHolder('lider-user-id');

      const useCase = new ApproveNovedadUseCase(repo, scopeHolder);
      await useCase.execute('nov-1', 'BIOMETRIC');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'nov-1',
        expect.objectContaining({ decisionVerification: 'BIOMETRIC' }),
      );
    });

    it('passes decisionVerification: NONE to updateStatus when provided', async () => {
      const repo = makeMockRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new ApproveNovedadUseCase(repo, scopeHolder);
      await useCase.execute('nov-1', 'NONE');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'nov-1',
        expect.objectContaining({ decisionVerification: 'NONE' }),
      );
    });
  });

  describe('VM-07 — approve without verification → persists null', () => {
    it('passes decisionVerification: null to updateStatus when absent', async () => {
      const repo = makeMockRepo();
      const scopeHolder = makeScopeHolder();

      const useCase = new ApproveNovedadUseCase(repo, scopeHolder);
      await useCase.execute('nov-1');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'nov-1',
        expect.objectContaining({ decisionVerification: null }),
      );
    });
  });
});
