/**
 * Unit spec — PrismaAuthRepository (push-token persistence behavior)
 *
 * These tests mock PrismaService and assert the exact delegate calls. They guard the
 * push-notification-repair invariants without needing a live DB.
 *
 * Spec: PN-21 — upsertDeviceSession's UPDATE branch MUST NOT touch pushToken/pushPlatform,
 *               so a re-login does not wipe an already-registered push token (survival).
 * Spec: PN-22 — clearPushToken issues updateMany on (userId, deviceId) setting both fields to null.
 * Spec: PN-23 — updatePushToken still stores token + platform (regression guard).
 */

import { PrismaAuthRepository } from './prisma-auth.repository';
import type { PrismaService } from '../../../database/prisma.service';

type DeviceSessionDelegate = {
  upsert: jest.Mock;
  updateMany: jest.Mock;
};

function makePrisma(): { prisma: PrismaService; deviceSession: DeviceSessionDelegate } {
  const deviceSession: DeviceSessionDelegate = {
    upsert: jest.fn().mockResolvedValue({
      id: 'sess-1',
      userId: 'user-1',
      deviceId: 'device-1',
      deviceLabel: null,
      refreshTokenHash: 'hash',
      revokedAt: null,
      lastSeenAt: new Date(),
      createdAt: new Date(),
      pushToken: 'survivor-token',
      pushPlatform: 'android',
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = { deviceSession } as unknown as PrismaService;
  return { prisma, deviceSession };
}

describe('PrismaAuthRepository — push token persistence', () => {
  it('PN-21 — upsertDeviceSession UPDATE branch does not wipe pushToken/pushPlatform (survives re-login)', async () => {
    const { prisma, deviceSession } = makePrisma();
    const repo = new PrismaAuthRepository(prisma);

    await repo.upsertDeviceSession({
      userId: 'user-1',
      deviceId: 'device-1',
      deviceLabel: 'Phone',
      refreshTokenHash: 'new-hash',
    });

    expect(deviceSession.upsert).toHaveBeenCalledTimes(1);
    const arg = deviceSession.upsert.mock.calls[0][0];

    // The UPDATE branch (the re-login path) MUST NOT mention pushToken/pushPlatform —
    // otherwise re-login would overwrite/clear an existing token.
    expect(arg.update).not.toHaveProperty('pushToken');
    expect(arg.update).not.toHaveProperty('pushPlatform');

    // Likewise the CREATE branch leaves them at their schema default (null) — not set here.
    expect(arg.create).not.toHaveProperty('pushToken');
    expect(arg.create).not.toHaveProperty('pushPlatform');
  });

  it('PN-22 — clearPushToken sets pushToken and pushPlatform to null for (userId, deviceId)', async () => {
    const { prisma, deviceSession } = makePrisma();
    const repo = new PrismaAuthRepository(prisma);

    await repo.clearPushToken('user-9', 'device-9');

    expect(deviceSession.updateMany).toHaveBeenCalledTimes(1);
    expect(deviceSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-9', deviceId: 'device-9' },
      data: { pushToken: null, pushPlatform: null },
    });
  });

  it('PN-23 — updatePushToken stores token + platform (regression guard)', async () => {
    const { prisma, deviceSession } = makePrisma();
    const repo = new PrismaAuthRepository(prisma);

    await repo.updatePushToken('user-2', 'device-2', 'fcm-tok', 'ios');

    expect(deviceSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-2', deviceId: 'device-2' },
      data: { pushToken: 'fcm-tok', pushPlatform: 'ios' },
    });
  });

  it('PN-23b — updatePushToken with no platform stores pushPlatform: null', async () => {
    const { prisma, deviceSession } = makePrisma();
    const repo = new PrismaAuthRepository(prisma);

    await repo.updatePushToken('user-3', 'device-3', 'fcm-tok-2');

    expect(deviceSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-3', deviceId: 'device-3' },
      data: { pushToken: 'fcm-tok-2', pushPlatform: null },
    });
  });
});
