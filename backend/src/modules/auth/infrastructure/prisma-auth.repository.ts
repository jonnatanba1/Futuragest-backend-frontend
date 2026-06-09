/**
 * Auth infrastructure — PrismaAuthRepository.
 *
 * Implements AuthRepositoryPort using PrismaService.
 * Uses createPrismaClient() indirectly via the injected PrismaService
 * (which follows the Prisma 7 adapter pattern).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthRepositoryPort, DeviceSessionData } from '../domain/auth-repository.port';
import type { AuthUser } from '../domain/auth-user';
import type { UserProfile } from '../domain/user-profile';

@Injectable()
export class PrismaAuthRepository implements AuthRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { supervisor: { select: { id: true, zoneId: true } } },
    });

    if (!user) return null;
    return this.mapUser(user);
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { supervisor: { select: { id: true, zoneId: true } } },
    });

    if (!user) return null;
    return this.mapUser(user);
  }

  async upsertDeviceSession(data: {
    userId: string;
    deviceId: string;
    deviceLabel?: string;
    refreshTokenHash: string;
  }): Promise<DeviceSessionData> {
    const session = await this.prisma.deviceSession.upsert({
      where: {
        userId_deviceId: {
          userId: data.userId,
          deviceId: data.deviceId,
        },
      },
      update: {
        refreshTokenHash: data.refreshTokenHash,
        deviceLabel: data.deviceLabel,
        revokedAt: null, // re-registration clears revocation
        lastSeenAt: new Date(),
      },
      create: {
        userId: data.userId,
        deviceId: data.deviceId,
        deviceLabel: data.deviceLabel,
        refreshTokenHash: data.refreshTokenHash,
        lastSeenAt: new Date(),
      },
    });

    return this.mapSession(session);
  }

  async findActiveDeviceSession(userId: string, deviceId: string): Promise<DeviceSessionData | null> {
    const session = await this.prisma.deviceSession.findFirst({
      where: {
        userId,
        deviceId,
        revokedAt: null,
      },
    });

    return session ? this.mapSession(session) : null;
  }

  async findDeviceSession(userId: string, deviceId: string): Promise<DeviceSessionData | null> {
    const session = await this.prisma.deviceSession.findFirst({
      where: { userId, deviceId },
    });

    return session ? this.mapSession(session) : null;
  }

  async revokeDeviceSession(userId: string, deviceId: string): Promise<void> {
    await this.prisma.deviceSession.updateMany({
      where: { userId, deviceId },
      data: { revokedAt: new Date() },
    });
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.prisma.deviceSession.count({
      where: { userId, revokedAt: null },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async clearMustChangePassword(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mustChangePassword: false },
    });
  }

  async updatePushToken(userId: string, deviceId: string, pushToken: string, platform?: string): Promise<void> {
    await this.prisma.deviceSession.updateMany({
      where: { userId, deviceId },
      data: {
        pushToken,
        pushPlatform: platform ?? null,
      },
    });
  }

  async clearPushToken(userId: string, deviceId: string): Promise<void> {
    await this.prisma.deviceSession.updateMany({
      where: { userId, deviceId },
      data: {
        pushToken: null,
        pushPlatform: null,
      },
    });
  }

  async findUserWithScope(userId: string): Promise<UserProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        coordinatedZone: { select: { id: true, name: true } },
        supervisor: {
          select: {
            id: true,
            area: true,
            zoneId: true,
            municipioId: true,
            zone: { select: { id: true, name: true } },
            municipio: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) return null;
    return this.mapUserProfile(user);
  }

  // ─── Mappers ───────────────────────────────────────────────────────────────

  private mapUser(user: {
    id: string;
    email: string;
    passwordHash: string;
    role: string;
    mustChangePassword: boolean;
    coordinatedZoneId: string | null;
    supervisor: { id: string; zoneId: string } | null;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      coordinatedZoneId: user.coordinatedZoneId,
      supervisorId: user.supervisor?.id ?? null,
      supervisorZoneId: user.supervisor?.zoneId ?? null,
    };
  }

  private mapSession(session: {
    id: string;
    userId: string;
    deviceId: string;
    deviceLabel: string | null;
    refreshTokenHash: string;
    revokedAt: Date | null;
    lastSeenAt: Date;
    createdAt: Date;
    pushToken?: string | null;
    pushPlatform?: string | null;
  }): DeviceSessionData {
    return {
      id: session.id,
      userId: session.userId,
      deviceId: session.deviceId,
      deviceLabel: session.deviceLabel,
      refreshTokenHash: session.refreshTokenHash,
      revokedAt: session.revokedAt,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt,
    };
  }

  private mapUserProfile(user: {
    id: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
    coordinatedZoneId: string | null;
    coordinatedZone: { id: string; name: string } | null;
    supervisor: {
      id: string;
      area: string;
      zoneId: string;
      municipioId: string;
      zone: { id: string; name: string };
      municipio: { id: string; name: string };
    } | null;
  }): UserProfile {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      coordinatedZoneId: user.coordinatedZoneId ?? null,
      coordinatedZoneName: user.coordinatedZone?.name ?? null,
      supervisorId: user.supervisor?.id ?? null,
      supervisorArea: user.supervisor?.area ?? null,
      supervisorZoneId: user.supervisor?.zone?.id ?? null,
      supervisorZoneName: user.supervisor?.zone?.name ?? null,
      supervisorMunicipioId: user.supervisor?.municipio?.id ?? null,
      supervisorMunicipioName: user.supervisor?.municipio?.name ?? null,
    };
  }
}
