/**
 * T4.11 — IamModule.
 *
 * Wires the IAM read layer:
 * - ScopeContextHolder → request-scoped provider that reads from request.scopeContextHolder
 *   (populated by AuthGuard before any repository is invoked)
 * - ScopedSupervisorRepository / ScopedOperarioRepository / ScopedAssignmentRepository
 *   → request-scoped (they depend on the request-scoped holder)
 * - IamController → singleton (NestJS default)
 * - RolesGuard → exported so AppModule can register it globally
 *
 * Request-scoped DI strategy:
 * The ScopeContextHolder instance is placed on request.scopeContextHolder by AuthGuard.
 * We expose it as a request-scoped provider using the SCOPE_CONTEXT_HOLDER injection token
 * so repositories can declare a typed constructor parameter.
 */

import { Module, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaService } from '../../database/prisma.service';
import {
  ScopeContextHolder,
  SCOPE_CONTEXT_HOLDER,
} from '../auth/domain/scope-context';
import { ScopedSupervisorRepository } from './infrastructure/scoped-supervisor.repository';
import { ScopedOperarioRepository } from './infrastructure/scoped-operario.repository';
import { ScopedAssignmentRepository } from './infrastructure/scoped-assignment.repository';
import { IamController } from './interface/iam.controller';
import { RolesGuard } from './interface/roles.guard';

/**
 * A lazy proxy for ScopeContextHolder that defers reading request.scopeContextHolder
 * until .current() is actually called (i.e., when a repository method executes —
 * AFTER AuthGuard has run).
 *
 * This solves the NestJS request-scoped DI timing problem: the DI factory runs
 * before guards, so req.scopeContextHolder is undefined at factory time. The
 * proxy captures the request reference and reads the holder lazily at call time.
 */
class LazyRequestScopeContextHolder extends ScopeContextHolder {
  constructor(private readonly req: Request & { scopeContextHolder?: ScopeContextHolder }) {
    super();
  }

  override current() {
    const holder = this.req.scopeContextHolder;
    if (!holder) {
      throw new Error(
        'ScopeContext has not been set. AuthGuard must run before repositories. ' +
          'Ensure the request goes through the authentication pipeline.',
      );
    }
    return holder.current();
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [IamController],
  providers: [
    // ── Request-scoped ScopeContextHolder ──────────────────────────────────
    // AuthGuard sets request.scopeContextHolder on every authenticated request.
    // We expose a lazy proxy under SCOPE_CONTEXT_HOLDER that defers reading
    // the holder until .current() is called (after guards have run).
    {
      provide: SCOPE_CONTEXT_HOLDER,
      scope: Scope.REQUEST,
      useFactory: (req: Request): ScopeContextHolder =>
        new LazyRequestScopeContextHolder(req as Request & { scopeContextHolder?: ScopeContextHolder }),
      inject: [REQUEST],
    },

    // ── Scoped repositories (request-scoped to pick up the per-request holder) ──
    {
      provide: ScopedSupervisorRepository,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedSupervisorRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },
    {
      provide: ScopedOperarioRepository,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedOperarioRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },
    {
      provide: ScopedAssignmentRepository,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedAssignmentRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },

    // ── Guards ─────────────────────────────────────────────────────────────
    RolesGuard,
  ],
  exports: [
    SCOPE_CONTEXT_HOLDER,
    ScopedSupervisorRepository,
    ScopedOperarioRepository,
    ScopedAssignmentRepository,
    RolesGuard,
  ],
})
export class IamModule {}
