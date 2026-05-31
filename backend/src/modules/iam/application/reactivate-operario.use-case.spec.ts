/**
 * T-16 — Unit tests for ReactivateOperarioUseCase (RED → GREEN).
 *
 * Covers:
 *   OP-46 — inactive operario → clears deactivatedAt
 *   OP-47 — already-active → AlreadyActiveError (NOT idempotent)
 *   OP-30 variant — not found → OperarioNotFoundError
 */

import { ReactivateOperarioUseCase } from './reactivate-operario.use-case';
import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import { AlreadyActiveError, OperarioNotFoundError } from '../domain/operario.errors';
import type { Operario } from '@prisma/client';

function makePort(overrides: Partial<OperarioRepositoryPort> = {}): jest.Mocked<OperarioRepositoryPort> {
  return {
    create: jest.fn(),
    findByDocumento: jest.fn(),
    findByIdScoped: jest.fn().mockResolvedValue({
      id: 'O2',
      fullName: 'Test',
      documento: '456',
      supervisorId: 'sup-1',
      deactivatedAt: new Date('2026-05-01'),
      createdAt: new Date(),
    } as Operario),
    setDeactivatedAt: jest.fn().mockImplementation((_id: string, date: Date | null) =>
      Promise.resolve({
        id: 'O2',
        fullName: 'Test',
        documento: '456',
        supervisorId: 'sup-1',
        deactivatedAt: date,
        createdAt: new Date(),
      } as Operario),
    ),
    bulkCreate: jest.fn(),
    resolveSupervisorByEmail: jest.fn(),
    ...overrides,
  } as jest.Mocked<OperarioRepositoryPort>;
}

describe('ReactivateOperarioUseCase', () => {
  describe('OP-46 — inactive operario → active', () => {
    it('calls setDeactivatedAt with null when operario is inactive', async () => {
      const port = makePort();
      const useCase = new ReactivateOperarioUseCase(port);

      const result = await useCase.execute('O2');

      expect(port.findByIdScoped).toHaveBeenCalledWith('O2');
      expect(port.setDeactivatedAt).toHaveBeenCalledWith('O2', null);
      expect(result.active).toBe(true);
      expect(result.deactivatedAt).toBeNull();
    });
  });

  describe('OP-47 — already-active → AlreadyActiveError', () => {
    it('throws AlreadyActiveError without calling setDeactivatedAt', async () => {
      const port = makePort({
        findByIdScoped: jest.fn().mockResolvedValue({
          id: 'O1',
          fullName: 'Test',
          documento: '123',
          supervisorId: 'sup-1',
          deactivatedAt: null,
          createdAt: new Date(),
        } as Operario),
      });
      const useCase = new ReactivateOperarioUseCase(port);

      await expect(useCase.execute('O1')).rejects.toBeInstanceOf(AlreadyActiveError);
      expect(port.setDeactivatedAt).not.toHaveBeenCalled();
    });
  });

  describe('OP-30 variant — not found → OperarioNotFoundError', () => {
    it('throws OperarioNotFoundError when scoped lookup returns null', async () => {
      const port = makePort({
        findByIdScoped: jest.fn().mockResolvedValue(null),
      });
      const useCase = new ReactivateOperarioUseCase(port);

      await expect(useCase.execute('ghost-id')).rejects.toBeInstanceOf(OperarioNotFoundError);
      expect(port.setDeactivatedAt).not.toHaveBeenCalled();
    });
  });
});
