/**
 * T-23 — Unit spec for CancelNovedadUseCase
 *
 * Covers: NV-48, NV-49, NV-50
 */

import { CancelNovedadUseCase } from './cancel-novedad.use-case';
import { ImmutableNovedadError, NovedadNotFoundError } from '../domain/novedad.errors';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';

function makeScopeHolder(supervisorId = 'sup-s1'): ScopeContextHolder {
  return {
    current: () => ({ userId: 'user-s1', role: 'SUPERVISOR', supervisorId }),
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
    }),
    findManyScoped: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('CancelNovedadUseCase', () => {
  describe('NV-48 — PENDING + owner → hard delete', () => {
    it('calls repo.delete with the novedad id', async () => {
      const repo = makeMockRepo();
      const scopeHolder = makeScopeHolder('sup-s1');

      const useCase = new CancelNovedadUseCase(repo, scopeHolder);
      await useCase.execute('nov-1');

      expect(repo.findByIdScoped).toHaveBeenCalledWith('nov-1');
      expect(repo.delete).toHaveBeenCalledWith('nov-1');
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('NV-49 — novedad not PENDING → ImmutableNovedadError, delete NOT called', () => {
    it('throws ImmutableNovedadError when status is APPROVED', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue({
          id: 'nov-1',
          status: 'APPROVED',
          supervisorId: 'sup-s1',
        }),
      });
      const scopeHolder = makeScopeHolder('sup-s1');

      const useCase = new CancelNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-1')).rejects.toThrow(ImmutableNovedadError);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws ImmutableNovedadError when status is REJECTED', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue({
          id: 'nov-1',
          status: 'REJECTED',
          supervisorId: 'sup-s1',
        }),
      });
      const scopeHolder = makeScopeHolder('sup-s1');

      const useCase = new CancelNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-1')).rejects.toThrow(ImmutableNovedadError);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('NV-50 — different supervisorId → NovedadNotFoundError (fail-closed)', () => {
    it('throws NovedadNotFoundError when supervisorId does not match scope', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue({
          id: 'nov-2',
          status: 'PENDING',
          supervisorId: 'sup-s2', // different supervisor
        }),
      });
      const scopeHolder = makeScopeHolder('sup-s1'); // caller is sup-s1

      const useCase = new CancelNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-2')).rejects.toThrow(NovedadNotFoundError);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws NovedadNotFoundError when repo returns null (not in scope)', async () => {
      const repo = makeMockRepo({
        findByIdScoped: jest.fn().mockResolvedValue(null),
      });
      const scopeHolder = makeScopeHolder('sup-s1');

      const useCase = new CancelNovedadUseCase(repo, scopeHolder);

      await expect(useCase.execute('nov-missing')).rejects.toThrow(NovedadNotFoundError);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
