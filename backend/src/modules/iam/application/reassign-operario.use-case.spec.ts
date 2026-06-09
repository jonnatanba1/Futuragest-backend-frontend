import { ReassignOperarioUseCase } from './reassign-operario.use-case';
import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import { OperarioNotFoundError, OperarioSupervisorNotFoundError } from '../domain/operario.errors';
import type { Operario } from '@prisma/client';

function makeOperario(supervisorId: string): Operario {
  return {
    id: 'O1',
    fullName: 'Test',
    documento: '123',
    supervisorId,
    deactivatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Operario;
}

function makePort(overrides: Partial<OperarioRepositoryPort> = {}): jest.Mocked<OperarioRepositoryPort> {
  return {
    create: jest.fn(),
    findByDocumento: jest.fn(),
    findByIdScoped: jest.fn().mockResolvedValue(makeOperario('sup-old')),
    setDeactivatedAt: jest.fn(),
    setSupervisor: jest.fn().mockImplementation((_id: string, supervisorId: string) =>
      Promise.resolve(makeOperario(supervisorId)),
    ),
    bulkCreate: jest.fn(),
    resolveSupervisorByEmail: jest.fn(),
    ...overrides,
  } as jest.Mocked<OperarioRepositoryPort>;
}

describe('ReassignOperarioUseCase', () => {
  it('reassigns to the new supervisor and returns the updated operario', async () => {
    const port = makePort();
    const useCase = new ReassignOperarioUseCase(port);

    const result = await useCase.execute({ operarioId: 'O1', supervisorId: 'sup-new' });

    expect(port.setSupervisor).toHaveBeenCalledWith('O1', 'sup-new');
    expect(result.supervisorId).toBe('sup-new');
  });

  it('throws OperarioNotFoundError when the operario is out of scope / missing', async () => {
    const port = makePort({ findByIdScoped: jest.fn().mockResolvedValue(null) });
    const useCase = new ReassignOperarioUseCase(port);

    await expect(useCase.execute({ operarioId: 'X', supervisorId: 'sup-new' })).rejects.toThrow(
      OperarioNotFoundError,
    );
    expect(port.setSupervisor).not.toHaveBeenCalled();
  });

  it('maps P2003 (bad supervisor FK) to OperarioSupervisorNotFoundError', async () => {
    const port = makePort({
      setSupervisor: jest.fn().mockRejectedValue({ code: 'P2003' }),
    });
    const useCase = new ReassignOperarioUseCase(port);

    await expect(useCase.execute({ operarioId: 'O1', supervisorId: 'ghost' })).rejects.toThrow(
      OperarioSupervisorNotFoundError,
    );
  });
});
