/**
 * T4.7 — ScopedSupervisorRepository.
 *
 * Concrete scoped repository for the Supervisor model.
 * Extends ScopedRepository so all reads go through applyScopeFilter.
 *
 * ESLint note: direct prisma.supervisor.findMany/findFirst calls are BANNED
 * by the no-raw-prisma-scoped-query rule outside this class.
 *
 * createWithUser: compound write — creates User + Supervisor in a single
 * $transaction. This is the ONLY sanctioned location for prisma.supervisor.create.
 * prisma.user.create is called here too (User is not a scoped model, so it is
 * allowed anywhere, but keeping it here keeps the transaction self-contained).
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Supervisor } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';
import { EmailInUseError } from '../domain/org.errors';

/** Parameters for the compound User + Supervisor creation transaction. */
export interface CreateSupervisorWithUserParams {
  email: string;
  passwordHash: string;
  area: Supervisor['area'];
  zoneId: string;
  municipioId: string;
  displayName?: string;
}

@Injectable()
export class ScopedSupervisorRepository extends ScopedRepository<
  PrismaService['supervisor'],
  Supervisor
> {
  protected readonly model = 'Supervisor';

  /** Full PrismaService kept for $transaction + prisma.user.create access. */
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.supervisor, scopeHolder);
    this.prisma = prisma;
  }

  /**
   * List supervisors visible to the current principal.
   * Optionally accepts extra where conditions (merged with scope).
   */
  findMany(where?: Prisma.SupervisorWhereInput): Promise<Supervisor[]> {
    return this.findManyScoped({ where: where ?? {} });
  }

  /**
   * Find a single supervisor by id — returns null if not found OR out of scope.
   * Controller should return 404 on null.
   */
  findById(id: string): Promise<Supervisor | null> {
    return this.findFirstScoped({ where: { id } });
  }

  /**
   * Like findMany, but enriched with the related user's email for display.
   * `user` is NOT a scoped relation (not in SCOPE_MAPS), so including it does
   * not bypass scope filtering — the W4 guard permits it.
   */
  findManyWithUser(where?: Prisma.SupervisorWhereInput): Promise<SupervisorWithUser[]> {
    return this.findManyScoped({
      where: where ?? {},
      include: { user: { select: { email: true, displayName: true } } },
    }) as Promise<SupervisorWithUser[]>;
  }

  /** Like findById, but enriched with the related user's email. */
  findByIdWithUser(id: string): Promise<SupervisorWithUser | null> {
    return this.findFirstScoped({
      where: { id },
      include: { user: { select: { email: true, displayName: true } } },
    }) as Promise<SupervisorWithUser | null>;
  }

  /**
   * Compound write — creates a User (role SUPERVISOR) and a Supervisor row in a
   * single $transaction. If anything fails the entire transaction is rolled back.
   *
   * This is the ONLY sanctioned location for prisma.supervisor.create (C1 guard).
   * prisma.user.create is also called here — User is not a scoped model, but keeping
   * it inside the transaction ensures atomicity.
   *
   * Error mapping:
   *   Prisma P2002 on user.email → EmailInUseError (caller maps to 409).
   *
   * Returns the Supervisor id.
   */
  async createWithUser(params: CreateSupervisorWithUserParams): Promise<{ id: string }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1 — create the User with role SUPERVISOR
        const user = await (tx as unknown as PrismaService).user.create({
          data: {
            email: params.email,
            passwordHash: params.passwordHash,
            role: 'SUPERVISOR',
            mustChangePassword: true,
            displayName: params.displayName,
          },
          select: { id: true },
        });

        // Step 2 — create the Supervisor linked to the new user
        const supervisor = await (tx as unknown as PrismaService).supervisor.create({
          data: {
            userId: user.id,
            area: params.area,
            zoneId: params.zoneId,
            municipioId: params.municipioId,
          },
          select: { id: true },
        });

        return { id: supervisor.id };
      });
    } catch (err) {
      // Prisma unique constraint on User.email → translate to domain error
      if (this.isPrismaUniqueError(err)) {
        throw new EmailInUseError(params.email);
      }
      throw err;
    }
  }

  /**
   * Update a supervisor's municipal assignment, area, and/or related user display name.
   * displayName is stored on the User row; municipio/area on the Supervisor row.
   * Uses a $transaction to ensure atomicity across both models.
   */
  async update(
    id: string,
    data: { municipioId?: string; area?: Supervisor['area']; displayName?: string },
  ): Promise<SupervisorWithUser> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update Supervisor row (only fields that are provided)
      const supData: Prisma.SupervisorUpdateInput = {};
      if (data.municipioId !== undefined) supData.municipio = { connect: { id: data.municipioId } };
      if (data.area !== undefined) supData.area = data.area;

      let supervisor: Supervisor;
      if (Object.keys(supData).length > 0) {
        supervisor = await (tx as unknown as PrismaService).supervisor.update({
          where: { id },
          data: supData,
        });
      } else {
        supervisor = await (tx as unknown as PrismaService).supervisor.findUniqueOrThrow({
          where: { id },
        });
      }

      // 2. Update User displayName if provided
      if (data.displayName !== undefined) {
        await (tx as unknown as PrismaService).user.update({
          where: { id: supervisor.userId },
          data: { displayName: data.displayName },
        });
      }

      // 3. Return enriched result
      const enriched = await (tx as unknown as PrismaService).supervisor.findUniqueOrThrow({
        where: { id },
        include: { user: { select: { email: true, displayName: true } } },
      });

      return enriched;
    });

    return result as unknown as SupervisorWithUser;
  }

  private isPrismaUniqueError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    );
  }
}

/** Supervisor row with only the user's email joined in. */
export type SupervisorWithUser = Supervisor & { user: { email: string; displayName: string | null } };
