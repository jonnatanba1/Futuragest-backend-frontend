/**
 * T4.11 + T-72 — IamModule.
 *
 * Wires the IAM read layer AND the new org management layer:
 * - ScopeContextHolder → request-scoped provider that reads from request.scopeContextHolder
 *   (populated by AuthGuard before any repository is invoked)
 * - ScopedSupervisorRepository / ScopedOperarioRepository / ScopedAssignmentRepository
 *   → request-scoped (they depend on the request-scoped holder)
 * - ScopedZoneRepository / ScopedMunicipioRepository → request-scoped
 * - PrismaOrgRepository → request-scoped (depends on scoped zone/municipio repos)
 * - AssignCoordinadorToZoneUseCase → request-scoped (depends on PrismaOrgRepository)
 * - ProvisionManagementUserUseCase → REQUEST-SCOPED (depends on ScopeContextHolder
 *   to read actor role for the privilege-escalation guard; MUST be request-scoped or
 *   it silently reads an empty context and the guard becomes a no-op)
 * - IamController → singleton (NestJS default)
 * - OrgController → singleton (read routes scope-filtered at repo level)
 * - RolesGuard → exported so AppModule can register it globally
 *
 * Cross-module DI:
 * AuthModule exports PASSWORD_HASHER_PORT (ArgonPasswordHasher). IamModule imports
 * AuthModule to consume it for ProvisionManagementUserUseCase.
 *
 * Request-scoped DI strategy:
 * The ScopeContextHolder instance is placed on request.scopeContextHolder by AuthGuard.
 * We expose a lazy proxy under SCOPE_CONTEXT_HOLDER that defers reading the holder
 * until .current() is called (after guards have run).
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
import { AuthModule } from '../auth/auth.module';
import { PASSWORD_HASHER_PORT } from '../auth/domain/password-hasher.port';
import type { PasswordHasherPort } from '../auth/domain/password-hasher.port';
import { ScopedSupervisorRepository } from './infrastructure/scoped-supervisor.repository';
import { ScopedOperarioRepository } from './infrastructure/scoped-operario.repository';
import { ScopedAssignmentRepository } from './infrastructure/scoped-assignment.repository';
import { ScopedZoneRepository } from './infrastructure/scoped-zone.repository';
import { ScopedMunicipioRepository } from './infrastructure/scoped-municipio.repository';
import { ScopedAreaRepository } from './infrastructure/scoped-area.repository';
import { PrismaOrgRepository } from './infrastructure/prisma-org.repository';
import { AssignCoordinadorToZoneUseCase } from './application/assign-coordinador-to-zone.use-case';
import { ProvisionManagementUserUseCase } from './application/provision-management-user.use-case';
import { UpdateUserUseCase } from './application/update-user.use-case';
import { CreateOperarioUseCase } from './application/create-operario.use-case';
import { DeactivateOperarioUseCase } from './application/deactivate-operario.use-case';
import { ReactivateOperarioUseCase } from './application/reactivate-operario.use-case';
import { BulkImportOperariosUseCase } from './application/bulk-import-operarios.use-case';
import { CreateSupervisorUseCase } from './application/create-supervisor.use-case';
import { UpdateSupervisorUseCase } from './application/update-supervisor.use-case';
import { ReassignOperarioUseCase } from './application/reassign-operario.use-case';
import { ORG_REPOSITORY_PORT } from './domain/ports/org-repository.port';
import type { OrgRepositoryPort } from './domain/ports/org-repository.port';
import { OPERARIO_REPOSITORY } from './domain/ports/operario.repository.port';
import type { OperarioRepositoryPort } from './domain/ports/operario.repository.port';
import { OPERARIO_STATUS } from './domain/ports/operario-status.port';
import { IamController } from './interface/iam.controller';
import { OrgController, ORG_REPO, ASSIGN_COORDINADOR_USE_CASE, PROVISION_MANAGEMENT_USER_USE_CASE, UPDATE_USER_USE_CASE } from './interface/org.controller';
import {
  OperarioController,
  CREATE_OPERARIO_USE_CASE,
  DEACTIVATE_OPERARIO_USE_CASE,
  REACTIVATE_OPERARIO_USE_CASE,
  BULK_IMPORT_OPERARIOS_USE_CASE,
  CREATE_SUPERVISOR_USE_CASE,
  UPDATE_SUPERVISOR_USE_CASE,
  REASSIGN_OPERARIO_USE_CASE,
} from './interface/operario.controller';
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
  imports: [PrismaModule, AuthModule],
  controllers: [IamController, OrgController, OperarioController],
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

    // ── Org scoped repositories ────────────────────────────────────────────
    {
      provide: ScopedZoneRepository,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedZoneRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },
    {
      provide: ScopedMunicipioRepository,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedMunicipioRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },
    {
      provide: ScopedAreaRepository,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedAreaRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },

    // ── PrismaOrgRepository — request-scoped (depends on scoped repos) ─────
    {
      provide: ORG_REPOSITORY_PORT,
      scope: Scope.REQUEST,
      useFactory: (
        prisma: PrismaService,
        zoneRepo: ScopedZoneRepository,
        municipioRepo: ScopedMunicipioRepository,
        areaRepo: ScopedAreaRepository,
      ) => new PrismaOrgRepository(prisma, zoneRepo, municipioRepo, areaRepo),
      inject: [PrismaService, ScopedZoneRepository, ScopedMunicipioRepository, ScopedAreaRepository],
    },

    // ── Alias ORG_REPO → ORG_REPOSITORY_PORT (OrgController uses ORG_REPO) ─
    {
      provide: ORG_REPO,
      scope: Scope.REQUEST,
      useFactory: (repo: OrgRepositoryPort) => repo,
      inject: [ORG_REPOSITORY_PORT],
    },

    // ── AssignCoordinadorToZoneUseCase — request-scoped ────────────────────
    {
      provide: ASSIGN_COORDINADOR_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (orgRepo: OrgRepositoryPort) =>
        new AssignCoordinadorToZoneUseCase(orgRepo),
      inject: [ORG_REPOSITORY_PORT],
    },

    // ── ProvisionManagementUserUseCase — REQUEST-SCOPED (CRITICAL) ─────────
    // Must be request-scoped so ScopeContextHolder.current() returns the
    // per-request actor role for the privilege-escalation guard.
    // A singleton would silently read empty context and bypass the guard.
    {
      provide: PROVISION_MANAGEMENT_USER_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        orgRepo: OrgRepositoryPort,
        hasher: PasswordHasherPort,
        scopeHolder: ScopeContextHolder,
      ) => new ProvisionManagementUserUseCase(orgRepo, hasher, scopeHolder),
      inject: [ORG_REPOSITORY_PORT, PASSWORD_HASHER_PORT, SCOPE_CONTEXT_HOLDER],
    },

    // ── UpdateUserUseCase — REQUEST-SCOPED ──────────────────────────────────
    {
      provide: UPDATE_USER_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        orgRepo: OrgRepositoryPort,
        scopeHolder: ScopeContextHolder,
      ) => new UpdateUserUseCase(orgRepo, scopeHolder),
      inject: [ORG_REPOSITORY_PORT, SCOPE_CONTEXT_HOLDER],
    },

    // ── OPERARIO_REPOSITORY alias → ScopedOperarioRepository (already provided) ──
    {
      provide: OPERARIO_REPOSITORY,
      scope: Scope.REQUEST,
      useFactory: (repo: ScopedOperarioRepository): OperarioRepositoryPort => repo,
      inject: [ScopedOperarioRepository],
    },

    // ── OPERARIO_STATUS alias → ScopedOperarioRepository (PR-3: cross-module port) ──
    // Exported so AsistenciaModule can inject it into CheckInAttendanceUseCase.
    // ScopedOperarioRepository implements isActive(operarioId): Promise<boolean|null>.
    // No circular dep: asistencia → iam only.
    {
      provide: OPERARIO_STATUS,
      scope: Scope.REQUEST,
      useFactory: (repo: ScopedOperarioRepository) => repo,
      inject: [ScopedOperarioRepository],
    },

    // ── CreateOperarioUseCase — REQUEST-SCOPED ─────────────────────────────
    {
      provide: CREATE_OPERARIO_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: OperarioRepositoryPort) => new CreateOperarioUseCase(repo),
      inject: [OPERARIO_REPOSITORY],
    },

    // ── DeactivateOperarioUseCase — REQUEST-SCOPED ─────────────────────────
    {
      provide: DEACTIVATE_OPERARIO_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: OperarioRepositoryPort) => new DeactivateOperarioUseCase(repo),
      inject: [OPERARIO_REPOSITORY],
    },

    // ── ReactivateOperarioUseCase — REQUEST-SCOPED ─────────────────────────
    {
      provide: REACTIVATE_OPERARIO_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: OperarioRepositoryPort) => new ReactivateOperarioUseCase(repo),
      inject: [OPERARIO_REPOSITORY],
    },

    // ── ReassignOperarioUseCase — REQUEST-SCOPED ──────────────────────────
    {
      provide: REASSIGN_OPERARIO_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: OperarioRepositoryPort) => new ReassignOperarioUseCase(repo),
      inject: [OPERARIO_REPOSITORY],
    },

    // ── BulkImportOperariosUseCase — REQUEST-SCOPED ────────────────────────
    // Parser (parseOperarioImport) is a pure function — imported directly in the
    // controller; this use-case only receives pre-parsed rows.
    {
      provide: BULK_IMPORT_OPERARIOS_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: OperarioRepositoryPort) => new BulkImportOperariosUseCase(repo),
      inject: [OPERARIO_REPOSITORY],
    },

    // ── CreateSupervisorUseCase — REQUEST-SCOPED ────────────────────────────
    // Depends on ScopedSupervisorRepository (compound write), ScopedZoneRepository,
    // ScopedMunicipioRepository, and PasswordHasherPort (from AuthModule).
    {
      provide: CREATE_SUPERVISOR_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        supervisorRepo: ScopedSupervisorRepository,
        zoneRepo: ScopedZoneRepository,
        municipioRepo: ScopedMunicipioRepository,
        hasher: PasswordHasherPort,
      ) => new CreateSupervisorUseCase(supervisorRepo, zoneRepo, municipioRepo, hasher),
      inject: [ScopedSupervisorRepository, ScopedZoneRepository, ScopedMunicipioRepository, PASSWORD_HASHER_PORT],
    },

    // ── UpdateSupervisorUseCase — REQUEST-SCOPED ────────────────────────────
    {
      provide: UPDATE_SUPERVISOR_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        supervisorRepo: ScopedSupervisorRepository,
        municipioRepo: ScopedMunicipioRepository,
      ) => new UpdateSupervisorUseCase(supervisorRepo, municipioRepo),
      inject: [ScopedSupervisorRepository, ScopedMunicipioRepository],
    },

    // ── Guards ─────────────────────────────────────────────────────────────
    RolesGuard,
  ],
  exports: [
    SCOPE_CONTEXT_HOLDER,
    ScopedSupervisorRepository,
    ScopedOperarioRepository,
    ScopedZoneRepository,
    ScopedAssignmentRepository,
    OPERARIO_REPOSITORY,
    OPERARIO_STATUS,
    RolesGuard,
  ],
})
export class IamModule {}
