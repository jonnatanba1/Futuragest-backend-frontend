/**
 * T4.7 — ScopedOperarioRepository.
 *
 * Concrete scoped repository for the Operario model.
 * SUPERVISOR scope: only their own operarios.
 * COORDINADOR scope: operarios whose supervisor is in their zone.
 * Global roles: all operarios.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma, Operario } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { ScopeContextHolder } from '../../auth/domain/scope-context';
import { ScopedRepository } from './scoped-repository';

@Injectable()
export class ScopedOperarioRepository extends ScopedRepository<
  PrismaService['operario'],
  Operario
> {
  protected readonly model = 'Operario';

  constructor(prisma: PrismaService, scopeHolder: ScopeContextHolder) {
    super(prisma.operario, scopeHolder);
  }

  findMany(where?: Prisma.OperarioWhereInput): Promise<Operario[]> {
    return this.findManyScoped({ where: where ?? {} });
  }

  findById(id: string): Promise<Operario | null> {
    return this.findFirstScoped({ where: { id } });
  }
}
