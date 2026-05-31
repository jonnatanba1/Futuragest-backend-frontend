/**
 * T-25 — Unit spec for GetNovedadUseCase
 */

import { GetNovedadUseCase } from './get-novedad.use-case';
import { NovedadNotFoundError } from '../domain/novedad.errors';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';

function makeMockRepo(overrides: Partial<NovedadRepositoryPort> = {}): NovedadRepositoryPort {
  return {
    create: jest.fn(),
    findByIdScoped: jest.fn().mockResolvedValue({ id: 'nov-1', status: 'PENDING' }),
    findManyScoped: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('GetNovedadUseCase', () => {
  it('returns novedad when found in scope', async () => {
    const repo = makeMockRepo();
    const useCase = new GetNovedadUseCase(repo);

    const result = await useCase.execute('nov-1');

    expect(repo.findByIdScoped).toHaveBeenCalledWith('nov-1');
    expect(result).toMatchObject({ id: 'nov-1' });
  });

  it('throws NovedadNotFoundError when findByIdScoped returns null', async () => {
    const repo = makeMockRepo({
      findByIdScoped: jest.fn().mockResolvedValue(null),
    });
    const useCase = new GetNovedadUseCase(repo);

    await expect(useCase.execute('not-found')).rejects.toThrow(NovedadNotFoundError);
  });
});
