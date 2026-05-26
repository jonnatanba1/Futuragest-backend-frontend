/**
 * T4.7 — ScopedAssignmentRepository.
 *
 * Concrete scoped repository for the Assignment model.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Assignment } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';

@Injectable()
export class ScopedAssignmentRepository extends ScopedRepository<
  PrismaService['assignment'],
  Assignment
> {
  protected readonly model = 'Assignment';

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.assignment, scopeHolder);
  }

  findMany(where?: Prisma.AssignmentWhereInput): Promise<Assignment[]> {
    return this.findManyScoped({ where: where ?? {} });
  }

  findById(id: string): Promise<Assignment | null> {
    return this.findFirstScoped({ where: { id } });
  }
}
