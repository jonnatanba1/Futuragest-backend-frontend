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
import {
  AreaNotFoundError,
  AreaNameInUseError,
  AreaHasDependentsError,
} from '../domain/area.errors';
import { PrismaOrgRepository } from './prisma-org.repository';
import type { ScopedZoneRepository } from './scoped-zone.repository';
import type { ScopedMunicipioRepository } from './scoped-municipio.repository';
import type { ScopedAreaRepository } from './scoped-area.repository';
import type { Zone, Municipio, Area } from '@prisma/client';
import type { PrismaService } from '../../../database/prisma.service';

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

function makeZoneRepo(zones: Zone[] = []): jest.Mocked<Pick<ScopedZoneRepository, 'findMany' | 'findById' | 'findByIdForWrite'>> {
  return {
    findMany: jest.fn().mockResolvedValue(zones),
    findById: jest.fn().mockResolvedValue(null),
    findByIdForWrite: jest.fn().mockResolvedValue(null),
  };
}

function makeMunicipioRepo(
  municipios: Municipio[] = [],
): jest.Mocked<Pick<ScopedMunicipioRepository, 'findMany'>> {
  return { findMany: jest.fn().mockResolvedValue(municipios) };
}

function makeAreaRepo(
  areas: Area[] = [],
): jest.Mocked<Pick<ScopedAreaRepository, 'findMany' | 'findById' | 'findByIdForWrite' | 'create' | 'update' | 'checkDependents' | 'delete'>> {
  return {
    findMany: jest.fn().mockResolvedValue(areas),
    findById: jest.fn().mockResolvedValue(null),
    findByIdForWrite: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    checkDependents: jest.fn().mockResolvedValue({}),
    delete: jest.fn(),
  };
}

const ZONE_ID = 'zone-uraba-uuid';
const USER_ID = 'coord-user-uuid';

// ─── createManagementUser ─────────────────────────────────────────────────────

describe('PrismaOrgRepository — createManagementUser', () => {
  it('calls prisma.user.create with hashed password and management role', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({ id: 'new-id' });
    const repo = new PrismaOrgRepository(
      prisma as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      prisma as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
    );

    await repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID });

    // capturedTx is always assigned inside $transaction before assignCoordinador resolves.
    // TS cannot see the closure assignment, so it flow-narrows capturedTx to null — go via unknown.
    expect(capturedTx).not.toBeNull();
    const tx = capturedTx as unknown as FakePrisma;

    // The updateMany (clear) must target the zone being assigned to
    expect(tx.user.updateMany).toHaveBeenCalledWith(
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
      prisma as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
    );

    await repo.assignCoordinador({ userId: USER_ID, zoneId: ZONE_ID });

    // capturedTx is always assigned inside $transaction before assignCoordinador resolves.
    // TS cannot see the closure assignment, so it flow-narrows capturedTx to null — go via unknown.
    expect(capturedTx).not.toBeNull();
    const tx = capturedTx as unknown as FakePrisma;

    // The update (set) must target the user being assigned
    expect(tx.user.update).toHaveBeenCalledWith(
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
      makePrisma() as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
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
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      municipioRepo as unknown as ScopedMunicipioRepository,
      makeAreaRepo() as unknown as ScopedAreaRepository,
    );

    const result = await repo.findMunicipios();

    expect(municipioRepo.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fakeMunicipios);
  });
});

// ─── Area CRUD ───────────────────────────────────────────────────────────────

const AREA_ID = 'area-patio-uuid';
const AREA_ZONE_ID = 'zone-uraba-uuid';

function makeArea(overrides: Partial<Area> = {}): Area {
  return {
    id: AREA_ID,
    name: 'Patio Central',
    horaInicio: '08:00',
    horaFin: '16:00',
    zoneId: AREA_ZONE_ID,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ── findAreas ──

describe('PrismaOrgRepository — findAreas delegation', () => {
  it('findAreas delegates to ScopedAreaRepository.findMany', async () => {
    const fakeAreas: Area[] = [makeArea()];
    const areaRepo = makeAreaRepo(fakeAreas);
    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    const result = await repo.findAreas();

    expect(areaRepo.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fakeAreas);
  });
});

// ── createArea ──

describe('PrismaOrgRepository — createArea', () => {
  it('creates área and returns { id } when zone exists and name is unique', async () => {
    const areaRepo = makeAreaRepo();
    areaRepo.create.mockResolvedValue(makeArea({ id: 'new-area-id' }));

    const zoneRepo = makeZoneRepo();
    zoneRepo.findByIdForWrite.mockResolvedValue({ id: AREA_ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    const result = await repo.createArea({
      name: 'Patio Central',
      horaInicio: '08:00',
      horaFin: '16:00',
      zoneId: AREA_ZONE_ID,
    });

    expect(areaRepo.create).toHaveBeenCalledWith({
      name: 'Patio Central',
      horaInicio: '08:00',
      horaFin: '16:00',
      zoneId: AREA_ZONE_ID,
    });
    expect(result).toEqual({ id: 'new-area-id' });
  });

  it('throws ZoneNotFoundError when zone does not exist', async () => {
    const areaRepo = makeAreaRepo();
    // findByIdForWrite resolves null → zone not found (we check zone existence via zoneRepo in full impl)
    // Actually, in the area pattern, the zone existence check goes through zoneRepo.findByIdForWrite
    const zoneRepo = makeZoneRepo();
    (zoneRepo as any).findByIdForWrite = jest.fn().mockResolvedValue(null);

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await expect(
      repo.createArea({
        name: 'Test',
        horaInicio: '08:00',
        horaFin: '16:00',
        zoneId: 'nonexistent-zone',
      }),
    ).rejects.toThrow(ZoneNotFoundError);

    expect(areaRepo.create).not.toHaveBeenCalled();
  });

  it('throws AreaNameInUseError when Prisma throws P2002 (unique constraint on zoneId+name)', async () => {
    const areaRepo = makeAreaRepo();
    const zoneRepo = makeZoneRepo();
    zoneRepo.findByIdForWrite.mockResolvedValue({ id: AREA_ZONE_ID, name: 'Zona Urabá', createdAt: new Date(), updatedAt: new Date() });
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    areaRepo.create.mockRejectedValue(p2002);

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await expect(
      repo.createArea({
        name: 'Duplicate',
        horaInicio: '08:00',
        horaFin: '16:00',
        zoneId: AREA_ZONE_ID,
      }),
    ).rejects.toThrow(AreaNameInUseError);
  });
});

// ── updateArea ──

describe('PrismaOrgRepository — updateArea', () => {
  it('updates área and returns updated entity', async () => {
    const areaRepo = makeAreaRepo();
    const existing = makeArea();
    const updated = makeArea({ name: 'Updated Name' });
    areaRepo.findByIdForWrite.mockResolvedValue(existing);
    areaRepo.update.mockResolvedValue(updated);

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    const result = await repo.updateArea(AREA_ID, { name: 'Updated Name' });

    expect(areaRepo.update).toHaveBeenCalledWith(AREA_ID, { name: 'Updated Name' });
    expect(result).toEqual(updated);
  });

  it('throws AreaNotFoundError when área does not exist', async () => {
    const areaRepo = makeAreaRepo();
    areaRepo.findByIdForWrite.mockResolvedValue(null); // not found

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await expect(
      repo.updateArea(AREA_ID, { name: 'New Name' }),
    ).rejects.toThrow(AreaNotFoundError);

    expect(areaRepo.update).not.toHaveBeenCalled();
  });

  it('throws AreaNameInUseError when P2002 on update (duplicate name in zone)', async () => {
    const areaRepo = makeAreaRepo();
    areaRepo.findByIdForWrite.mockResolvedValue(makeArea());
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    areaRepo.update.mockRejectedValue(p2002);

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await expect(
      repo.updateArea(AREA_ID, { name: 'Taken' }),
    ).rejects.toThrow(AreaNameInUseError);
  });

  it('validates new zone exists when zoneId is being changed', async () => {
    const areaRepo = makeAreaRepo();
    areaRepo.findByIdForWrite.mockResolvedValue(makeArea());
    const zoneRepo = makeZoneRepo();
    (zoneRepo as any).findByIdForWrite = jest.fn().mockResolvedValue(null); // new zone doesn't exist

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      zoneRepo as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await expect(
      repo.updateArea(AREA_ID, { zoneId: 'nonexistent-zone' }),
    ).rejects.toThrow(ZoneNotFoundError);

    expect(areaRepo.update).not.toHaveBeenCalled();
  });
});

// ── deleteArea ──

describe('PrismaOrgRepository — deleteArea', () => {
  it('deletes área when no dependents exist', async () => {
    const areaRepo = makeAreaRepo();
    areaRepo.findByIdForWrite.mockResolvedValue(makeArea());
    areaRepo.checkDependents.mockResolvedValue({ operarios: 0 });

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await repo.deleteArea(AREA_ID);

    expect(areaRepo.delete).toHaveBeenCalledWith(AREA_ID);
  });

  it('throws AreaNotFoundError when área does not exist', async () => {
    const areaRepo = makeAreaRepo();
    areaRepo.findByIdForWrite.mockResolvedValue(null);

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await expect(
      repo.deleteArea(AREA_ID),
    ).rejects.toThrow(AreaNotFoundError);

    expect(areaRepo.delete).not.toHaveBeenCalled();
  });

  it('throws AreaHasDependentsError when dependents exist', async () => {
    const areaRepo = makeAreaRepo();
    areaRepo.findByIdForWrite.mockResolvedValue(makeArea());
    areaRepo.checkDependents.mockResolvedValue({ operarios: 3 });

    const repo = new PrismaOrgRepository(
      makePrisma() as unknown as PrismaService,
      makeZoneRepo() as unknown as ScopedZoneRepository,
      makeMunicipioRepo() as unknown as ScopedMunicipioRepository,
      areaRepo as unknown as ScopedAreaRepository,
    );

    await expect(
      repo.deleteArea(AREA_ID),
    ).rejects.toThrow(AreaHasDependentsError);

    expect(areaRepo.delete).not.toHaveBeenCalled();
  });
});
