/**
 * Unit spec — RecipientResolver
 *
 * Spec: PN-13 — RecipientResolver returns empty array when no active LIDER_OPERATIVO tokens exist.
 * Spec: PN-14 — RecipientResolver returns { userId, deviceId, pushToken } tuples from the ORM query.
 * Spec: PN-15 — RecipientResolver narrows out null pushToken rows (defensive).
 * Spec: PN-16 — query filters on role (LIDER_OPERATIVO), revokedAt:null, pushToken:{not:null}.
 * Spec: PN-17 — PUSH_NOTIFY_SYSTEM_ADMIN=true includes SYSTEM_ADMIN in the role filter.
 */

import { RecipientResolver } from './recipient-resolver';

type Row = { userId: string; deviceId: string; pushToken: string | null };

describe('RecipientResolver', () => {
  function makeMockPrisma(rows: Row[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = {
      deviceSession: { findMany },
    } as unknown as import('../../../database/prisma.service').PrismaService;
    return { prisma, findMany };
  }

  const ORIG_ENV = process.env.PUSH_NOTIFY_SYSTEM_ADMIN;
  afterEach(() => {
    if (ORIG_ENV === undefined) delete process.env.PUSH_NOTIFY_SYSTEM_ADMIN;
    else process.env.PUSH_NOTIFY_SYSTEM_ADMIN = ORIG_ENV;
  });

  it('PN-13 — returns empty array when no active LIDER_OPERATIVO tokens', async () => {
    const { prisma } = makeMockPrisma([]);
    const resolver = new RecipientResolver(prisma);

    const recipients = await resolver.getActivePushTokens();
    expect(recipients).toEqual([]);
  });

  it('PN-14 — returns { userId, deviceId, pushToken } tuples from the ORM query', async () => {
    const { prisma } = makeMockPrisma([
      { userId: 'u1', deviceId: 'd1', pushToken: 'token-1' },
      { userId: 'u2', deviceId: 'd2', pushToken: 'token-2' },
    ]);
    const resolver = new RecipientResolver(prisma);

    const recipients = await resolver.getActivePushTokens();
    expect(recipients).toEqual([
      { userId: 'u1', deviceId: 'd1', pushToken: 'token-1' },
      { userId: 'u2', deviceId: 'd2', pushToken: 'token-2' },
    ]);
  });

  it('PN-15 — narrows out rows whose pushToken is null (defensive)', async () => {
    const { prisma } = makeMockPrisma([
      { userId: 'u1', deviceId: 'd1', pushToken: 'token-valid' },
      { userId: 'u2', deviceId: 'd2', pushToken: null },
    ]);
    const resolver = new RecipientResolver(prisma);

    const recipients = await resolver.getActivePushTokens();
    expect(recipients).toEqual([{ userId: 'u1', deviceId: 'd1', pushToken: 'token-valid' }]);
  });

  it('PN-16 — query filters on role LIDER_OPERATIVO, revokedAt:null, pushToken:{not:null}', async () => {
    delete process.env.PUSH_NOTIFY_SYSTEM_ADMIN;
    const { prisma, findMany } = makeMockPrisma([]);
    const resolver = new RecipientResolver(prisma);

    await resolver.getActivePushTokens();

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.user.role.in).toEqual(['LIDER_OPERATIVO']);
    expect(arg.where.revokedAt).toBeNull();
    expect(arg.where.pushToken).toEqual({ not: null });
    expect(arg.select).toEqual({ userId: true, deviceId: true, pushToken: true });
  });

  it('PN-17 — PUSH_NOTIFY_SYSTEM_ADMIN=true includes SYSTEM_ADMIN in the role filter', async () => {
    process.env.PUSH_NOTIFY_SYSTEM_ADMIN = 'true';
    const { prisma, findMany } = makeMockPrisma([]);
    const resolver = new RecipientResolver(prisma);

    await resolver.getActivePushTokens();

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.user.role.in).toEqual(['LIDER_OPERATIVO', 'SYSTEM_ADMIN']);
  });
});
