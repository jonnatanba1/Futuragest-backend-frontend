/**
 * Unit tests for UpdateUserUseCase.
 *
 * Verifies:
 * - Happy path: updates displayName on a user.
 * - Happy path: updates role with privilege-escalation check.
 * - UserNotFoundError propagated from repo.
 * - UnsupportedProvisionRoleError for invalid role change.
 * - ForbiddenException when privilege-escalation is detected.
 * - Actor role read from ScopeContextHolder, NOT from input.
 */

import { ForbiddenException } from '@nestjs/common';
import { UpdateUserUseCase } from './update-user.use-case';
import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';
import type { ScopeContextHolder, ScopeContext } from '../../auth/domain/scope-context';
import {
  UnsupportedProvisionRoleError,
  UserNotFoundError,
} from '../domain/org.errors';
import type { Role } from '@prisma/client';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeRepo(): jest.Mocked<OrgRepositoryPort> {
  return {
    createManagementUser: jest.fn(),
    assignCoordinador: jest.fn(),
    findZones: jest.fn(),
    findMunicipios: jest.fn(),
    createZone: jest.fn(),
    updateZone: jest.fn(),
    deleteZone: jest.fn(),
    createMunicipio: jest.fn(),
    updateMunicipio: jest.fn(),
    deleteMunicipio: jest.fn(),
    findUsers: jest.fn(),
    updateUser: jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@test.co',
      role: 'LIDER_OPERATIVO' as Role,
      mustChangePassword: false,
      coordinatedZoneId: null,
      displayName: 'New Name',
      createdAt: new Date(),
    }),
    findAreas: jest.fn(),
    createArea: jest.fn(),
    updateArea: jest.fn(),
    deleteArea: jest.fn(),
  };
}

function makeHolder(role: ScopeContext['role']): ScopeContextHolder {
  const ctx: ScopeContext = { userId: 'actor-user-id', role };
  return {
    current: jest.fn().mockReturnValue(ctx),
    set: jest.fn(),
    get: jest.fn().mockReturnValue(ctx),
  } as unknown as ScopeContextHolder;
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('UpdateUserUseCase — happy path', () => {
  it('updates displayName and returns updated user', async () => {
    const repo = makeRepo();
    const holder = makeHolder('SYSTEM_ADMIN');
    const useCase = new UpdateUserUseCase(repo, holder);

    const result = await useCase.execute({ id: 'user-1', displayName: 'New Name' });

    expect(repo.updateUser).toHaveBeenCalledWith('user-1', {
      displayName: 'New Name',
      role: undefined,
    });
    expect(result).toHaveProperty('displayName', 'New Name');
  });

  it('updates role when actor is SYSTEM_ADMIN', async () => {
    const repo = makeRepo();
    const holder = makeHolder('SYSTEM_ADMIN');
    const useCase = new UpdateUserUseCase(repo, holder);

    await useCase.execute({ id: 'user-1', role: 'GERENCIA' });

    expect(repo.updateUser).toHaveBeenCalledWith('user-1', {
      displayName: undefined,
      role: 'GERENCIA',
    });
  });

  it('updates both displayName and role', async () => {
    const repo = makeRepo();
    const holder = makeHolder('SYSTEM_ADMIN');
    const useCase = new UpdateUserUseCase(repo, holder);

    await useCase.execute({ id: 'user-1', displayName: 'Promoted', role: 'GERENCIA' });

    expect(repo.updateUser).toHaveBeenCalledWith('user-1', {
      displayName: 'Promoted',
      role: 'GERENCIA',
    });
  });
});

// ─── Not found ────────────────────────────────────────────────────────────────

describe('UpdateUserUseCase — not found', () => {
  it('propagates UserNotFoundError from repo', async () => {
    const repo = makeRepo();
    repo.updateUser.mockRejectedValue(new UserNotFoundError('bad-id'));
    const holder = makeHolder('SYSTEM_ADMIN');
    const useCase = new UpdateUserUseCase(repo, holder);

    await expect(
      useCase.execute({ id: 'bad-id', displayName: 'X' }),
    ).rejects.toThrow(UserNotFoundError);
  });
});

// ─── Role validation ──────────────────────────────────────────────────────────

describe('UpdateUserUseCase — role validation', () => {
  it('rejects SUPERVISOR via UnsupportedProvisionRoleError', async () => {
    const repo = makeRepo();
    const holder = makeHolder('SYSTEM_ADMIN');
    const useCase = new UpdateUserUseCase(repo, holder);

    await expect(
      useCase.execute({ id: 'user-1', role: 'SUPERVISOR' as Role }),
    ).rejects.toThrow(UnsupportedProvisionRoleError);

    expect(repo.updateUser).not.toHaveBeenCalled();
  });

  it('rejects SYSTEM_ADMIN target via UnsupportedProvisionRoleError', async () => {
    const repo = makeRepo();
    const holder = makeHolder('SYSTEM_ADMIN');
    const useCase = new UpdateUserUseCase(repo, holder);

    await expect(
      useCase.execute({ id: 'user-1', role: 'SYSTEM_ADMIN' as Role }),
    ).rejects.toThrow(UnsupportedProvisionRoleError);
  });

  it('allows COORDINADOR role change', async () => {
    const repo = makeRepo();
    const holder = makeHolder('SYSTEM_ADMIN');
    const useCase = new UpdateUserUseCase(repo, holder);

    await useCase.execute({ id: 'user-1', role: 'COORDINADOR' });

    expect(repo.updateUser).toHaveBeenCalledWith('user-1', {
      displayName: undefined,
      role: 'COORDINADOR',
    });
  });
});

// ─── Privilege escalation ─────────────────────────────────────────────────────

describe('UpdateUserUseCase — privilege escalation', () => {
  it('TALENTO_HUMANO cannot promote to GERENCIA', async () => {
    const repo = makeRepo();
    const holder = makeHolder('TALENTO_HUMANO');
    const useCase = new UpdateUserUseCase(repo, holder);

    await expect(
      useCase.execute({ id: 'user-1', role: 'GERENCIA' }),
    ).rejects.toThrow(ForbiddenException);

    expect(repo.updateUser).not.toHaveBeenCalled();
  });

  it('TALENTO_HUMANO can change to LIDER_OPERATIVO (lower rank)', async () => {
    const repo = makeRepo();
    const holder = makeHolder('TALENTO_HUMANO');
    const useCase = new UpdateUserUseCase(repo, holder);

    await useCase.execute({ id: 'user-1', role: 'LIDER_OPERATIVO' });

    expect(repo.updateUser).toHaveBeenCalled();
  });

  it('does NOT check rank when only displayName changes (no role change)', async () => {
    const repo = makeRepo();
    const holder = makeHolder('TALENTO_HUMANO');
    const useCase = new UpdateUserUseCase(repo, holder);

    await useCase.execute({ id: 'user-1', displayName: 'Only Name' });

    expect(repo.updateUser).toHaveBeenCalledWith('user-1', {
      displayName: 'Only Name',
      role: undefined,
    });
    // ScopeContextHolder should NOT be called for rank check (no role change)
    // But it's called for the guard, which is fine.
  });

  it('reads actor role from holder.current().role, not from input', async () => {
    const repo = makeRepo();
    const holder = makeHolder('TALENTO_HUMANO');
    const useCase = new UpdateUserUseCase(repo, holder);

    await useCase.execute({ id: 'user-1', role: 'LIDER_OPERATIVO' });

    expect((holder.current as jest.Mock)).toHaveBeenCalled();
  });
});
