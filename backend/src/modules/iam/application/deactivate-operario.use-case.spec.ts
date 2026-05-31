/**
 * T-14 — Unit tests for DeactivateOperarioUseCase (RED → GREEN).
 *
 * Covers:
 *   OP-44 — active operario → sets deactivatedAt
 *   OP-45 — already-inactive → AlreadyInactiveError (NOT idempotent)
 *   OP-30 — not found → OperarioNotFoundError
 */

import { DeactivateOperarioUseCase } from './deactivate-operario.use-case';
import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import { AlreadyInactiveError, OperarioNotFoundError } from '../domain/operario.errors';
import type { Operario } from '@prisma/client';

function makePort(overrides: Partial<OperarioRepositoryPort> = {}): jest.Mocked<OperarioRepositoryPort> {
  return {
    create: jest.fn(),
    findByDocumento: jest.fn(),
    findByIdScoped: jest.fn().mockResolvedValue({
      id: 'O1',
      fullName: 'Test',
      documento: '123',
      supervisorId: 'sup-1',
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Operario),
    setDeactivatedAt: jest.fn().mockImplementation((_id: string, date: Date | null) =>
      Promise.resolve({
        id: 'O1',
        fullName: 'Test',
        documento: '123',
        supervisorId: 'sup-1',
        deactivatedAt: date,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Operario),
    ),
    bulkCreate: jest.fn(),
    resolveSupervisorByEmail: jest.fn(),
    ...overrides,
  } as jest.Mocked<OperarioRepositoryPort>;
}

describe('DeactivateOperarioUseCase', () => {
  describe('OP-44 — active operario → deactivated', () => {
    it('calls setDeactivatedAt with a Date when operario is active', async () => {
      const port = makePort();
      const useCase = new DeactivateOperarioUseCase(port);

      const result = await useCase.execute('O1');

      expect(port.findByIdScoped).toHaveBeenCalledWith('O1');
      expect(port.setDeactivatedAt).toHaveBeenCalledWith('O1', expect.any(Date));
      expect(result.active).toBe(false);
      expect(result.deactivatedAt).not.toBeNull();
    });
  });

  describe('OP-45 — already-inactive → AlreadyInactiveError', () => {
    it('throws AlreadyInactiveError without calling setDeactivatedAt', async () => {
      const port = makePort({
        findByIdScoped: jest.fn().mockResolvedValue({
          id: 'O1',
          fullName: 'Test',
          documento: '123',
          supervisorId: 'sup-1',
          deactivatedAt: new Date('2026-05-01'),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Operario),
      });
      const useCase = new DeactivateOperarioUseCase(port);

      await expect(useCase.execute('O1')).rejects.toBeInstanceOf(AlreadyInactiveError);
      expect(port.setDeactivatedAt).not.toHaveBeenCalled();
    });
  });

  describe('OP-30 — not found → OperarioNotFoundError', () => {
    it('throws OperarioNotFoundError when scoped lookup returns null', async () => {
      const port = makePort({
        findByIdScoped: jest.fn().mockResolvedValue(null),
      });
      const useCase = new DeactivateOperarioUseCase(port);

      await expect(useCase.execute('ghost-id')).rejects.toBeInstanceOf(OperarioNotFoundError);
      expect(port.setDeactivatedAt).not.toHaveBeenCalled();
    });
  });
});
