/**
 * T-60 — Unit tests for PrismaOrgRepository.
 *
 * Written FIRST (TDD red phase) — fails before the repository exists.
 *
 * Verifies:
 * - createManagementUser: correct Prisma create call, hash forwarded, no raw password,
 *   mustChangePassword=true, coordinatedZoneId not set (stays null from Prisma default).
 * - assignCoordinador: $transaction entered; updateMany (clear) called BEFORE update (set);
 *   validates zone exists (ZoneNotFoundError on miss);
 *   validates user exists (UserNotFoundError on miss);
 *   validates user role is COORDINADOR (InvalidCoordinadorRoleError on mismatch).
 * - findZones: delegates to ScopedZoneRepository.findMany.
 * - findMunicipios: delegates to ScopedMunicipioRepository.findMany.
 */

import {
  InvalidCoordinadorRoleError,
  ZoneNotFoundError,
  UserNotFoundError,
  EmailInUseError,
} from '../domain/org.errors';
import { PrismaOrgRepository } from './prisma-org.repository';
import type { ScopedZoneRepository } from './scoped-zone.repository';
import type { ScopedMunicipioRepository } from './scoped-municipio.repository';
import type { Zone, Municipio } from '@prisma/client';

// ─── Test doubles ─────────────────────────────────────────────────────────────

/** Minimal fake PrismaClient covering only the methods PrismaOrgRepository calls. */
interface FakePrisma {
  user: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

function makePrisma(overrides: Partial<FakePrisma> = {}): FakePrisma {
  const prisma: FakePrisma = {
    user: {
      create: jest.fn().mockResolvedValue({ id: 'created-user-id' }),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({ id: 'user-id', coordinatedZoneId: 'zone-id' }),
    },
    $transaction: jest.fn(),
    ...overrides,
  };
  return prisma;
}

function makeZoneRepo(zones: Zone[] = []): jest.Mocked<Pick<ScopedZoneRepository, 'findMany' | 'findById'>> {
  return {
    findMany: jest.fn().mockResolvedValue(zones),
    findById: jest.fn().mockResolvedValue(null),
  };
}

function makeMunicipioRepo(
  municipios: Municipio[] = [],
): jest.Mocked<Pick<ScopedMunicipioRepository, 'findMany'>> {
  return { findMany: jest.fn().mockResolvedValue(municipios) };
}

const ZONE_ID = 'zone-uraba-uuid';
const USER_ID = 'coord-user-uuid';

// ─── createManagementUser ─────────────────────────────────────────────────────

describe('PrismaOrgRepository — createManagementUser', () => {
  it('calls prisma.user.create with hashed password and management role', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({ id: 'new-id' });
    const repo = new PrismaOrgRepository(
      prisma as any,
      makeZoneRepo() as any,
      makeMunicipioRepo() as any,
    );

    await repo.createManagementUser({
      email: 'g@test.co',
      passwordHash: '$argon2-hash',
      role: 'GERENCIA',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'g@test.co',
          passwordHash: '$argon2-hash',
          role: 'GERENCIA',
          mustChangePassword: true,
        }),
      }),
    );
  });

  it('does NOT pass coordinatedZoneId in the create call (management roles have no zone)', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({ id: 'new-id' });
    const repo = new PrismaOrgRepository(
      prisma as any,
      makeZoneRepo() as any,
      makeMunicipioRepo() as any,
    );

    await repo.createManagementUser({
      email: 'th@test.co',
      passwordHash: '$argon2-hash',
      role: 'TALENTO_HUMANO',
    });

    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data).not.toHaveProperty('coordinatedZoneId');
  });

  it('returns { id } on success', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({ id: 'abc-123' });
    const repo = new PrismaOrgRepository(
      prisma as any,
      makeZoneRepo() as any,
      makeMunicipioRepo() as any,
    );

    const result = await repo.createManagementUser({
      email: 'lo@test.co',
      passwordHash: '$argon2-hash',
      role: 'LIDER_OPERATIVO',
    });

    expect(result).toEqual({ id: 'abc-123' });
  });

  it('throws EmailInUseError when Prisma throws P2002 (unique constraint on email)', async () => {
    const prisma = makePrisma();
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prisma.user.create.mockRejectedValue(p2002);
    const repo = new PrismaOrgRepository(
      prisma as any,
      makeZoneRepo() as any,
      makeMunicipioRepo() as any,
    );

    await expect(
      repo.createManagementUser({ email: 'dup@test.co', passwordHash: '$argon2-hash', role: 'GERENCIA' }),
    ).rejects.toThrow(EmailInUseError);
  });
});

// ─── assignCoordinador — validation ──────────────────────────────────────────

describe('PrismaOrgRepository — assignCoordinador validation', () => {
  it('throws ZoneNotFoundError when zone does not exist', async () => {
    const prisma = makePrisma();
    const zoneRepo = makeZoneRepo();
    // findById resolves null → zone not found
    zoneRepo.findById.mockResolvedValue(null);
    const repo = new PrismaOrgRepository(
      prisma as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    await expect(
      repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID }),
    ).rejects.toThrow(ZoneNotFoundError);

    // Transaction should NOT have been entered
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError when user does not exist', async () => {
    const prisma = makePrisma();
    const zoneRepo = makeZoneRepo();
    zoneRepo.findById.mockResolvedValue({ id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });
    prisma.user.findUnique.mockResolvedValue(null); // user not found
    const repo = new PrismaOrgRepository(
      prisma as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    await expect(
      repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID }),
    ).rejects.toThrow(UserNotFoundError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws InvalidCoordinadorRoleError when user role is not COORDINADOR', async () => {
    const prisma = makePrisma();
    const zoneRepo = makeZoneRepo();
    zoneRepo.findById.mockResolvedValue({ id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      role: 'SUPERVISOR', // wrong role
      email: 'sup@test.co',
    });
    const repo = new PrismaOrgRepository(
      prisma as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    await expect(
      repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID }),
    ).rejects.toThrow(InvalidCoordinadorRoleError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ─── assignCoordinador — $transaction clear-then-set order ────────────────────

describe('PrismaOrgRepository — assignCoordinador $transaction clear-then-set', () => {
  it('enters $transaction after passing validation', async () => {
    const prisma = makePrisma();
    const zoneRepo = makeZoneRepo();
    zoneRepo.findById.mockResolvedValue({ id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'COORDINADOR', email: 'coord@test.co' });

    // Mock $transaction to execute the callback with the fake prisma as tx
    prisma.$transaction.mockImplementation(async (cb: (tx: FakePrisma) => Promise<void>) => {
      const tx: FakePrisma = {
        user: {
          create: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn().mockResolvedValue({ id: USER_ID }),
        },
        $transaction: jest.fn(),
      };
      return cb(tx);
    });

    const repo = new PrismaOrgRepository(
      prisma as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    await repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('calls updateMany (clear) BEFORE update (set) inside $transaction', async () => {
    const callOrder: string[] = [];
    const prisma = makePrisma();
    const zoneRepo = makeZoneRepo();
    zoneRepo.findById.mockResolvedValue({ id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'COORDINADOR', email: 'coord@test.co' });

    prisma.$transaction.mockImplementation(async (cb: (tx: FakePrisma) => Promise<void>) => {
      const tx: FakePrisma = {
        user: {
          create: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn().mockImplementation(() => {
            callOrder.push('updateMany'); // clear step
            return Promise.resolve({ count: 0 });
          }),
          update: jest.fn().mockImplementation(() => {
            callOrder.push('update'); // set step
            return Promise.resolve({ id: USER_ID });
          }),
        },
        $transaction: jest.fn(),
      };
      return cb(tx);
    });

    const repo = new PrismaOrgRepository(
      prisma as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    await repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID });

    // Clear MUST come before set (INV-05)
    expect(callOrder).toEqual(['updateMany', 'update']);
  });

  it('updateMany clears by zoneId (releases current holder of target zone)', async () => {
    let capturedTx: FakePrisma | null = null;
    const prisma = makePrisma();
    const zoneRepo = makeZoneRepo();
    zoneRepo.findById.mockResolvedValue({ id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'COORDINADOR', email: 'coord@test.co' });

    prisma.$transaction.mockImplementation(async (cb: (tx: FakePrisma) => Promise<void>) => {
      const tx: FakePrisma = {
        user: {
          create: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn().mockResolvedValue({ id: USER_ID }),
        },
        $transaction: jest.fn(),
      };
      capturedTx = tx;
      return cb(tx);
    });

    const repo = new PrismaOrgRepository(
      prisma as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    await repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID });

    // The updateMany (clear) must target the zone being assigned to
    expect(capturedTx!.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coordinatedZoneId: ZONE_ID }),
        data: { coordinatedZoneId: null },
      }),
    );
  });

  it('update sets coordinatedZoneId on the target user', async () => {
    let capturedTx: FakePrisma | null = null;
    const prisma = makePrisma();
    const zoneRepo = makeZoneRepo();
    zoneRepo.findById.mockResolvedValue({ id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'COORDINADOR', email: 'coord@test.co' });

    prisma.$transaction.mockImplementation(async (cb: (tx: FakePrisma) => Promise<void>) => {
      const tx: FakePrisma = {
        user: {
          create: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn().mockResolvedValue({ id: USER_ID }),
        },
        $transaction: jest.fn(),
      };
      capturedTx = tx;
      return cb(tx);
    });

    const repo = new PrismaOrgRepository(
      prisma as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    await repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID });

    // The update (set) must target the user being assigned
    expect(capturedTx!.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { coordinatedZoneId: ZONE_ID },
      }),
    );
  });
});

// ─── findZones / findMunicipios ───────────────────────────────────────────────

describe('PrismaOrgRepository — findZones and findMunicipios delegation', () => {
  it('findZones delegates to ScopedZoneRepository.findMany', async () => {
    const fakeZones: Zone[] = [
      { id: ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() },
    ];
    const zoneRepo = makeZoneRepo(fakeZones);
    const repo = new PrismaOrgRepository(
      makePrisma() as any,
      zoneRepo as any,
      makeMunicipioRepo() as any,
    );

    const result = await repo.findZones();

    expect(zoneRepo.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fakeZones);
  });

  it('findMunicipios delegates to ScopedMunicipioRepository.findMany', async () => {
    const fakeMunicipios: Municipio[] = [
      { id: 'mun-1', name: 'Turbo', zoneId: ZONE_ID, createdAt: new Date(), updatedAt: new Date() },
    ];
    const municipioRepo = makeMunicipioRepo(fakeMunicipios);
    const repo = new PrismaOrgRepository(
      makePrisma() as any,
      makeZoneRepo() as any,
      municipioRepo as any,
    );

    const result = await repo.findMunicipios();

    expect(municipioRepo.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fakeMunicipios);
  });
});
