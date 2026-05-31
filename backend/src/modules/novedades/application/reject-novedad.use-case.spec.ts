/**
 * T-21 — Unit spec for RejectNovedadUseCase
 *
 * Covers: NV-46, NV-47
 */

import { RejectNovedadUseCase } from './reject-novedad.use-case';
import { ImmutableNovedadError, NovedadNotFoundError } from '../domain/novedad.errors';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';

function makeScopeHolder(userId = 'lider-user-id'): ScopeContextHolder {
  return {
    current: () => ({ userId, role: 'LIDER_OPERATIVO' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockRepo(overrides: Partial<NovedadRepositoryPort> = {}): NovedadRepositoryPort {
  return {
    create: jest.fn(),
    findByIdScoped: jest.fn().mockResolvedValue({ id: 'nov-1', status: 'PENDING' }),
    findManyScoped: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn().mockResolvedValue({
      id: 'nov-1',
      status: 'REJECTED',
      approvedByUserId: 'lider-user-id',
      decidedAt: new Date(),
    }),
    delete: jest.fn(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('RejectNovedadUseCase', () => {
  describe('NV-46 — PENDING → REJECTED, sets approvedByUserId + decidedAt', () => {
    it('calls updateStatus with REJECTED and userId from scope holder', async () => {
      const repo = makeMockRepo();
      const scopeHolder = makeScopeHolder('lider-user-id');

      const useCase = new RejectNovedadUseCase(repo, scopeHolder);
      const result = await useCase.execute('nov-1');

      expect(repo.findByIdScoped).toHaveBeenCalledWith('nov-1');
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'nov-1',
        expect.objectContaining({
          status: 'REJECTED',
          approvedByUserId: 'lider-user-id',
          decidedAt: expect.any(Date),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('NV-47 — already REJECTED → ImmutableNovedadError, update NOT called', () => {
    it('throws ImmutableNovedadError when status is REJECTED', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue({ id: 'nov-1', status: 'REJECTED' }),
      });
      const scopeHolder = makeScopeHolder();

      const useCase = new RejectNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-1')).rejects.toThrow(ImmutableNovedadError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws ImmutableNovedadError when status is APPROVED', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue({ id: 'nov-1', status: 'APPROVED' }),
      });
      const scopeHolder = makeScopeHolder();

      const useCase = new RejectNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-1')).rejects.toThrow(ImmutableNovedadError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('novedad not found → NovedadNotFoundError', () => {
    it('throws NovedadNotFoundError when repo returns null', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue(null),
      });

      const useCase = new RejectNovedadUseCase(repo, makeScopeHolder());

      await expect(useCase.execute('not-found')).rejects.toThrow(NovedadNotFoundError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
