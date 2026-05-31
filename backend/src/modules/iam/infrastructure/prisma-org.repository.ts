/**
 * PrismaOrgRepository — infrastructure adapter implementing OrgRepositoryPort.
 *
 * Responsibilities:
 * - createManagementUser: persists new management-role user with mustChangePassword=true.
 * - assignCoordinador: validates zone + user + role, then executes a $transaction
 *   with clear-then-set ordering to preserve the @unique coordinatedZoneId constraint (INV-05).
 * - findZones / findMunicipios: delegates to ScopedZoneRepository / ScopedMunicipioRepository
 *   (scope filtering is already applied by those repos via applyScopeFilter).
 *
 * Error mapping:
 * - Prisma P2002 (unique violation on user.email) → EmailInUseError.
 * - zoneRepo.findById returns null → ZoneNotFoundError.
 * - user.findUnique returns null → UserNotFoundError.
 * - user.role !== COORDINADOR → InvalidCoordinadorRoleError.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Zone, Municipio } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type {
  OrgRepositoryPort,
  CreateManagementUserParams,
  AssignCoordinadorParams,
} from '../domain/ports/org-repository.port';
import {
  EmailInUseError,
  ZoneNotFoundError,
  UserNotFoundError,
  InvalidCoordinadorRoleError,
} from '../domain/org.errors';
import type { ScopedZoneRepository } from './scoped-zone.repository';
import type { ScopedMunicipioRepository } from './scoped-municipio.repository';

@Injectable()
export class PrismaOrgRepository implements OrgRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zoneRepo: ScopedZoneRepository,
    private readonly municipioRepo: ScopedMunicipioRepository,
  ) {}

  // ─── createManagementUser ──────────────────────────────────────────────────

  async createManagementUser(params: CreateManagementUserParams): Promise<{ id: string }> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: params.email,
          passwordHash: params.passwordHash,
          role: params.role,
          mustChangePassword: true,
          // coordinatedZoneId intentionally omitted — Prisma default is null.
          // Management roles (GERENCIA, TALENTO_HUMANO, LIDER_OPERATIVO) are GLOBAL_ROLES.
        },
        select: { id: true },
      });

      return { id: user.id };
    } catch (err) {
      // Prisma unique constraint violation on User.email
      if (this.isPrismaUniqueError(err)) {
        throw new EmailInUseError(params.email);
      }
      throw err;
    }
  }

  // ─── assignCoordinador ─────────────────────────────────────────────────────

  async assignCoordinador(params: AssignCoordinadorParams): Promise<void> {
    const { userId, zoneId } = params;

    // 1. Validate zone exists (pre-transaction — fast guard, no @unique risk here)
    const zone = await this.zoneRepo.findById(zoneId);
    if (!zone) {
      throw new ZoneNotFoundError(zoneId);
    }

    // 2. Validate user exists and has COORDINADOR role
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    if (user.role !== 'COORDINADOR') {
      throw new InvalidCoordinadorRoleError(user.role);
    }

    // 3. Transactional clear-then-set (INV-05 — preserves @unique coordinatedZoneId)
    //    Step A: release current holder of target zone (if any)
    //    Step B: assign target user to the zone
    //    This ordering is MANDATORY: set-before-clear would transiently violate @unique.
    await this.prisma.$transaction(async (tx) => {
      // Step A: clear coordinatedZoneId on any user currently holding this zone
      await (tx as any).user.updateMany({
        where: { coordinatedZoneId: zoneId },
        data: { coordinatedZoneId: null },
      });

      // Step B: set coordinatedZoneId on the target user
      // This also moves the user off any OTHER zone they previously coordinated,
      // because coordinatedZoneId is a single column — overwriting it is the move.
      await (tx as any).user.update({
        where: { id: userId },
        data: { coordinatedZoneId: zoneId },
      });
    });
  }

  // ─── findZones / findMunicipios ────────────────────────────────────────────

  async findZones(): Promise<Zone[]> {
    return this.zoneRepo.findMany();
  }

  async findMunicipios(): Promise<Municipio[]> {
    return this.municipioRepo.findMany();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private isPrismaUniqueError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    );
  }
}
