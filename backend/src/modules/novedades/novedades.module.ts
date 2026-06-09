/**
 * NovedadesModule — DI wiring for the overtime novelty domain.
 *
 * All providers are REQUEST-scoped because they depend on the request-scoped
 * ScopeContextHolder (populated by AuthGuard before any use-case runs).
 *
 * Imports:
 * - PrismaModule: PrismaService for ScopedNovedadRepository
 * - AuthModule: AuthGuard
 * - IamModule: SCOPE_CONTEXT_HOLDER (request-scoped, exported by IamModule)
 * - AsistenciaModule: exports ATTENDANCE_REPOSITORY_PORT (needed for completed-check)
 *
 * Pattern mirrors asistencia.module.ts LazyRequestScopeContextHolder / REQUEST factory wiring.
 */

import { Module, Scope } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { AsistenciaModule } from '../asistencia/asistencia.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SCOPE_CONTEXT_HOLDER, type ScopeContextHolder } from '../auth/domain/scope-context';
import { ScopedNovedadRepository } from '../iam/infrastructure/scoped-novedad.repository';
import { NOVEDAD_REPOSITORY_PORT } from './domain/ports/novedad-repository.port';
import type { NovedadRepositoryPort } from './domain/ports/novedad-repository.port';
import { ATTENDANCE_REPOSITORY_PORT } from '../asistencia/domain/ports/attendance-repository.port';
import type { AttendanceRepositoryPort } from '../asistencia/domain/ports/attendance-repository.port';
import { NOTIFICATION_PORT } from '../notifications/domain/notification.port';
import type { NotificationPort } from '../notifications/domain/notification.port';
import { CreateNovedadUseCase } from './application/create-novedad.use-case';
import { ApproveNovedadUseCase } from './application/approve-novedad.use-case';
import { RejectNovedadUseCase } from './application/reject-novedad.use-case';
import { CancelNovedadUseCase } from './application/cancel-novedad.use-case';
import { GetNovedadUseCase } from './application/get-novedad.use-case';
import { ListNovedadesUseCase } from './application/list-novedades.use-case';
import {
  NovedadController,
  CREATE_NOVEDAD_USE_CASE,
  APPROVE_NOVEDAD_USE_CASE,
  REJECT_NOVEDAD_USE_CASE,
  CANCEL_NOVEDAD_USE_CASE,
  GET_NOVEDAD_USE_CASE,
  LIST_NOVEDADES_USE_CASE,
} from './interface/novedad.controller';

@Module({
  imports: [PrismaModule, AuthModule, IamModule, AsistenciaModule, NotificationsModule],
  controllers: [NovedadController],
  providers: [
    // ── ScopedNovedadRepository — request-scoped (needs SCOPE_CONTEXT_HOLDER) ──
    {
      provide: NOVEDAD_REPOSITORY_PORT,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedNovedadRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },

    // ── CreateNovedadUseCase — REQUEST-SCOPED ──────────────────────────────────
    {
      provide: CREATE_NOVEDAD_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        novedadRepo: NovedadRepositoryPort,
        attendanceRepo: AttendanceRepositoryPort,
        scopeHolder: ScopeContextHolder,
        notificationPort: NotificationPort,
      ) => new CreateNovedadUseCase(novedadRepo, attendanceRepo, scopeHolder, notificationPort),
      inject: [NOVEDAD_REPOSITORY_PORT, ATTENDANCE_REPOSITORY_PORT, SCOPE_CONTEXT_HOLDER, NOTIFICATION_PORT],
    },

    // ── ApproveNovedadUseCase — REQUEST-SCOPED ─────────────────────────────────
    {
      provide: APPROVE_NOVEDAD_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (novedadRepo: NovedadRepositoryPort, scopeHolder: ScopeContextHolder) =>
        new ApproveNovedadUseCase(novedadRepo, scopeHolder),
      inject: [NOVEDAD_REPOSITORY_PORT, SCOPE_CONTEXT_HOLDER],
    },

    // ── RejectNovedadUseCase — REQUEST-SCOPED ──────────────────────────────────
    {
      provide: REJECT_NOVEDAD_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (novedadRepo: NovedadRepositoryPort, scopeHolder: ScopeContextHolder) =>
        new RejectNovedadUseCase(novedadRepo, scopeHolder),
      inject: [NOVEDAD_REPOSITORY_PORT, SCOPE_CONTEXT_HOLDER],
    },

    // ── CancelNovedadUseCase — REQUEST-SCOPED ──────────────────────────────────
    {
      provide: CANCEL_NOVEDAD_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (novedadRepo: NovedadRepositoryPort, scopeHolder: ScopeContextHolder) =>
        new CancelNovedadUseCase(novedadRepo, scopeHolder),
      inject: [NOVEDAD_REPOSITORY_PORT, SCOPE_CONTEXT_HOLDER],
    },

    // ── GetNovedadUseCase — REQUEST-SCOPED ─────────────────────────────────────
    {
      provide: GET_NOVEDAD_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (novedadRepo: NovedadRepositoryPort) => new GetNovedadUseCase(novedadRepo),
      inject: [NOVEDAD_REPOSITORY_PORT],
    },

    // ── ListNovedadesUseCase — REQUEST-SCOPED ──────────────────────────────────
    {
      provide: LIST_NOVEDADES_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (novedadRepo: NovedadRepositoryPort) => new ListNovedadesUseCase(novedadRepo),
      inject: [NOVEDAD_REPOSITORY_PORT],
    },
  ],
})
export class NovedadesModule {}
