/**
 * PrismaOrgRepository — infrastructure adapter implementing OrgRepositoryPort.
 *
 * Responsibilities:
 * - createManagementUser: persists new management-role user with mustChangePassword=true.
 * - assignCoordinador: validates zone + user + role, then executes a $transaction
 *   with clear-then-set ordering to preserve the @unique coordinatedZoneId constraint (INV-05).
 * - findZones / findMunicipios: delegates to ScopedZoneRepository / ScopedMunicipioRepository
 *   (scope filtering is already applied by those repos via applyScopeFilter).
 * - createZone / updateZone / deleteZone: zone CRUD with uniqueness + referential guards.
 * - createMunicipio / updateMunicipio / deleteMunicipio: municipio CRUD with guards.
 *
 * Error mapping:
 * - Prisma P2002 (unique violation on user.email) → EmailInUseError.
 * - Prisma P2002 on zone.name → ZoneNameInUseError.
 * - Prisma P2002 on (municipio.zoneId, municipio.name) → MunicipioNameInUseError.
 * - zoneRepo.findById returns null → ZoneNotFoundError.
 * - prisma.zone.findUnique returns null → ZoneNotFoundError.
 * - prisma.municipio.findUnique returns null → MunicipioNotFoundError.
 * - user.findUnique returns null → UserNotFoundError.
 * - user.role !== COORDINADOR → InvalidCoordinadorRoleError.
 * - zone children count > 0 → ZoneHasDependentsError.
 * - municipio supervisor count > 0 → MunicipioHasDependentsError.
 */

import { Injectable } from '@nestjs/common';
import type { Zone, Municipio, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type {
  OrgRepositoryPort,
  CreateManagementUserParams,
  AssignCoordinadorParams,
  UserListItem,
} from '../domain/ports/org-repository.port';
import {
  EmailInUseError,
  ZoneNotFoundError,
  ZoneNameInUseError,
  ZoneHasDependentsError,
  UserNotFoundError,
  InvalidCoordinadorRoleError,
  MunicipioNotFoundError,
  MunicipioNameInUseError,
  MunicipioHasDependentsError,
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
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Step A: clear coordinatedZoneId on any user currently holding this zone
      await tx.user.updateMany({
        where: { coordinatedZoneId: zoneId },
        data: { coordinatedZoneId: null },
      });

      // Step B: set coordinatedZoneId on the target user
      // This also moves the user off any OTHER zone they previously coordinated,
      // because coordinatedZoneId is a single column — overwriting it is the move.
      await tx.user.update({
        where: { id: userId },
        data: { coordinatedZoneId: zoneId },
      });
    });
  }

  // ─── findZones / findMunicipios ────────────────────────────────────────────

  // ─── findUsers (admin) ─────────────────────────────────────────────────────

  async findUsers(): Promise<UserListItem[]> {
    // Projection explicitly excludes passwordHash — never expose credentials.
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        mustChangePassword: true,
        coordinatedZoneId: true,
        createdAt: true,
      },
      orderBy: { email: 'asc' },
    });
  }

  async findZones(): Promise<Zone[]> {
    return this.zoneRepo.findMany();
  }

  async findMunicipios(): Promise<Municipio[]> {
    return this.municipioRepo.findMany();
  }

  // ─── Zone CRUD ─────────────────────────────────────────────────────────────
  // NOTE: All zone/municipio direct Prisma calls are delegated to ScopedZoneRepository /
  // ScopedMunicipioRepository because those files are the only sanctioned locations for
  // raw prisma.zone.* / prisma.municipio.* calls (C1 meta-guard — scope-meta-guard.spec.ts).

  async createZone(params: { name: string }): Promise<{ id: string }> {
    try {
      const zone = await this.zoneRepo.create({ name: params.name });
      return { id: zone.id };
    } catch (err) {
      if (this.isPrismaUniqueError(err)) {
        throw new ZoneNameInUseError(params.name);
      }
      throw err;
    }
  }

  async updateZone(id: string, params: { name: string }): Promise<Zone> {
    // Pre-check existence (without scope) to give ZoneNotFoundError instead of P2025
    const existing = await this.zoneRepo.findByIdForWrite(id);
    if (!existing) {
      throw new ZoneNotFoundError(id);
    }
    try {
      return await this.zoneRepo.update(id, { name: params.name });
    } catch (err) {
      if (this.isPrismaUniqueError(err)) {
        throw new ZoneNameInUseError(params.name);
      }
      throw err;
    }
  }

  async deleteZone(id: string): Promise<void> {
    const existing = await this.zoneRepo.findByIdForWrite(id);
    if (!existing) {
      throw new ZoneNotFoundError(id);
    }
    const counts = await this.zoneRepo.countDependents(id);
    if (counts.municipios > 0 || counts.supervisors > 0 || counts.coordinador) {
      throw new ZoneHasDependentsError(id);
    }
    await this.zoneRepo.delete(id);
  }

  // ─── Municipio CRUD ────────────────────────────────────────────────────────

  async createMunicipio(params: { name: string; zoneId: string }): Promise<{ id: string }> {
    // Validate zone exists first — gives a clear ZoneNotFoundError instead of FK violation
    const zone = await this.zoneRepo.findByIdForWrite(params.zoneId);
    if (!zone) {
      throw new ZoneNotFoundError(params.zoneId);
    }
    try {
      const municipio = await this.municipioRepo.create({ name: params.name, zoneId: params.zoneId });
      return { id: municipio.id };
    } catch (err) {
      if (this.isPrismaUniqueError(err)) {
        throw new MunicipioNameInUseError(params.name, params.zoneId);
      }
      throw err;
    }
  }

  async updateMunicipio(
    id: string,
    params: { name?: string; zoneId?: string },
  ): Promise<Municipio> {
    const existing = await this.municipioRepo.findByIdForWrite(id);
    if (!existing) {
      throw new MunicipioNotFoundError(id);
    }

    // If changing zone, validate new zone exists
    if (params.zoneId !== undefined) {
      const zone = await this.zoneRepo.findByIdForWrite(params.zoneId);
      if (!zone) {
        throw new ZoneNotFoundError(params.zoneId);
      }
    }

    // Build update data (only provided fields)
    const data: { name?: string; zoneId?: string } = {};
    if (params.name !== undefined) data.name = params.name;
    if (params.zoneId !== undefined) data.zoneId = params.zoneId;

    try {
      return await this.municipioRepo.update(id, data);
    } catch (err) {
      if (this.isPrismaUniqueError(err)) {
        const effectiveName = params.name ?? existing.name;
        const effectiveZoneId = params.zoneId ?? existing.zoneId;
        throw new MunicipioNameInUseError(effectiveName, effectiveZoneId);
      }
      throw err;
    }
  }

  async deleteMunicipio(id: string): Promise<void> {
    const existing = await this.municipioRepo.findByIdForWrite(id);
    if (!existing) {
      throw new MunicipioNotFoundError(id);
    }
    const supCount = await this.municipioRepo.countSupervisors(id);
    if (supCount > 0) {
      throw new MunicipioHasDependentsError(id);
    }
    await this.municipioRepo.delete(id);
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
