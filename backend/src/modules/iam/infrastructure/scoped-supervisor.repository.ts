/**
 * T4.7 — ScopedSupervisorRepository.
 *
 * Concrete scoped repository for the Supervisor model.
 * Extends ScopedRepository so all reads go through applyScopeFilter.
 *
 * ESLint note: direct prisma.supervisor.findMany/findFirst calls are BANNED
 * by the no-raw-prisma-scoped-query rule outside this class.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Supervisor } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';

@Injectable()
export class ScopedSupervisorRepository extends ScopedRepository<
  PrismaService['supervisor'],
  Supervisor
> {
  protected readonly model = 'Supervisor';

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.supervisor, scopeHolder);
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
}
