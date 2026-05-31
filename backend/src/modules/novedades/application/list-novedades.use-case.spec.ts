/**
 * T-25 (continued) — Unit spec for ListNovedadesUseCase
 */

import { ListNovedadesUseCase } from './list-novedades.use-case';
import type { NovedadRepositoryPort } from '../domain/ports/novedad-repository.port';

function makeMockRepo(overrides: Partial<NovedadRepositoryPort> = {}): NovedadRepositoryPort {
  return {
    create: jest.fn(),
    findByIdScoped: jest.fn(),
    findManyScoped: jest.fn().mockResolvedValue([
      { id: 'nov-1', status: 'PENDING' },
      { id: 'nov-2', status: 'APPROVED' },
    ]),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('ListNovedadesUseCase', () => {
  it('returns array of novedades from findManyScoped', async () => {
    const repo = makeMockRepo();
    const useCase = new ListNovedadesUseCase(repo);

    const result = await useCase.execute();

    expect(repo.findManyScoped).toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no novedades in scope', async () => {
    const repo = makeMockRepo({
      findManyScoped: jest.fn().mockResolvedValue([]),
    });
    const useCase = new ListNovedadesUseCase(repo);

    const result = await useCase.execute();
    expect(result).toEqual([]);
  });
});
