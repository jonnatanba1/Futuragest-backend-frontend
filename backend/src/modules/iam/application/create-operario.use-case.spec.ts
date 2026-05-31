/**
 * T-12 — Unit tests for CreateOperarioUseCase (RED → GREEN).
 *
 * Covers:
 *   OP-38 — success path
 *   OP-39 — duplicate documento (P2002 → DuplicateDocumentoError)
 *   OP-40 — supervisor not found → OperarioSupervisorNotFoundError
 */

import { CreateOperarioUseCase } from './create-operario.use-case';
import type { OperarioRepositoryPort } from '../domain/ports/operario.repository.port';
import { DuplicateDocumentoError, OperarioSupervisorNotFoundError } from '../domain/operario.errors';
import type { Operario } from '@prisma/client';

function makePort(overrides: Partial<OperarioRepositoryPort> = {}): jest.Mocked<OperarioRepositoryPort> {
  return {
    create: jest.fn().mockResolvedValue({
      id: 'op-1',
      fullName: 'Test',
      documento: '123',
      supervisorId: 'sup-1',
      deactivatedAt: null,
      createdAt: new Date(),
    } as Operario),
    findByDocumento: jest.fn().mockResolvedValue(null),
    findByIdScoped: jest.fn().mockResolvedValue(null),
    setDeactivatedAt: jest.fn().mockResolvedValue({} as Operario),
    bulkCreate: jest.fn().mockResolvedValue(0),
    resolveSupervisorByEmail: jest.fn().mockResolvedValue({ id: 'sup-1' }),
    ...overrides,
  } as jest.Mocked<OperarioRepositoryPort>;
}

describe('CreateOperarioUseCase', () => {
  describe('OP-38 — success path', () => {
    it('creates operario when supervisor exists and documento is unique', async () => {
      const port = makePort();
      const useCase = new CreateOperarioUseCase(port);

      const result = await useCase.execute({
        fullName: 'Test Worker',
        documento: '12345678',
        supervisorId: 'sup-1',
      });

      expect(port.resolveSupervisorByEmail).not.toHaveBeenCalled(); // supervisorId lookup, not email
      // For individual create we validate supervisorId by checking it exists
      expect(port.create).toHaveBeenCalledWith({
        fullName: 'Test Worker',
        documento: '12345678',
        supervisorId: 'sup-1',
      });
      expect(result).toHaveProperty('id', 'op-1');
    });
  });

  describe('OP-39 — duplicate documento → DuplicateDocumentoError', () => {
    it('throws DuplicateDocumentoError when Prisma P2002 is thrown', async () => {
      const port = makePort({
        create: jest.fn().mockRejectedValue({
          code: 'P2002',
          message: 'Unique constraint failed',
        }),
      });
      const useCase = new CreateOperarioUseCase(port);

      await expect(
        useCase.execute({ fullName: 'Test', documento: 'dup-doc', supervisorId: 'sup-1' }),
      ).rejects.toBeInstanceOf(DuplicateDocumentoError);
    });

    it('does NOT call create a second time after P2002', async () => {
      const port = makePort({
        create: jest.fn().mockRejectedValue({ code: 'P2002', message: 'Unique constraint' }),
      });
      const useCase = new CreateOperarioUseCase(port);

      await expect(
        useCase.execute({ fullName: 'Test', documento: '111', supervisorId: 'sup-1' }),
      ).rejects.toBeInstanceOf(DuplicateDocumentoError);

      expect(port.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('OP-40 — supervisor not found → OperarioSupervisorNotFoundError', () => {
    it('throws OperarioSupervisorNotFoundError when supervisorId does not exist in DB', async () => {
      // The use-case verifies supervisorId exists via findByDocumento-like approach:
      // for individual create we do a supervisor existence check.
      // If the supervisor doesn't exist, Prisma throws P2003 (FK constraint).
      const port = makePort({
        create: jest.fn().mockRejectedValue({
          code: 'P2003',
          message: 'Foreign key constraint failed on supervisorId',
          meta: { field_name: 'supervisorId' },
        }),
      });
      const useCase = new CreateOperarioUseCase(port);

      await expect(
        useCase.execute({ fullName: 'Test', documento: '22222222', supervisorId: 'does-not-exist' }),
      ).rejects.toBeInstanceOf(OperarioSupervisorNotFoundError);

      expect(port.create).toHaveBeenCalledTimes(1);
    });
  });
});
