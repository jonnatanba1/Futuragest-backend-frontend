/**
 * AsistenciaModule — DI wiring for the attendance domain.
 *
 * All providers are REQUEST-scoped because they depend on the request-scoped
 * ScopeContextHolder (populated by AuthGuard before any use-case runs).
 *
 * IamModule is imported to:
 * - Reuse SCOPE_CONTEXT_HOLDER (already request-scoped and exported by IamModule).
 * - Reuse ScopedOperarioRepository (for operario ownership check in CheckInUseCase).
 *
 * StorageModule is imported to inject STORAGE_PORT into signature use-cases.
 *
 * Pattern mirrors iam.module.ts factory wiring + LazyRequestScopeContextHolder.
 */

import { Module, Scope } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { StorageModule } from '../storage/storage.module';
import { SCOPE_CONTEXT_HOLDER, type ScopeContextHolder } from '../auth/domain/scope-context';
import { ScopedAttendanceRepository } from '../iam/infrastructure/scoped-attendance.repository';
import { ScopedOperarioRepository } from '../iam/infrastructure/scoped-operario.repository';
import { OPERARIO_STATUS } from '../iam/domain/ports/operario-status.port';
import type { OperarioStatusPort } from '../iam/domain/ports/operario-status.port';
import { ATTENDANCE_REPOSITORY_PORT } from './domain/ports/attendance-repository.port';
import type { AttendanceRepositoryPort } from './domain/ports/attendance-repository.port';
import { STORAGE_PORT } from '../storage/domain/storage.port';
import type { StoragePort } from '../storage/domain/storage.port';
import { CheckInAttendanceUseCase } from './application/check-in-attendance.use-case';
import { CheckOutAttendanceUseCase } from './application/check-out-attendance.use-case';
import { ListAttendanceUseCase } from './application/list-attendance.use-case';
import { GetAttendanceUseCase } from './application/get-attendance.use-case';
import { UploadSignatureUseCase } from './application/upload-signature.use-case';
import { GetSignatureUrlUseCase } from './application/get-signature-url.use-case';
import {
  AttendanceController,
  CHECK_IN_USE_CASE,
  CHECK_OUT_USE_CASE,
  LIST_ATTENDANCE_USE_CASE,
  GET_ATTENDANCE_USE_CASE,
  UPLOAD_SIGNATURE_USE_CASE,
  GET_SIGNATURE_URL_USE_CASE,
  ATTENDANCE_REPO,
} from './interface/attendance.controller';

@Module({
  imports: [PrismaModule, AuthModule, IamModule, StorageModule],
  controllers: [AttendanceController],
  providers: [
    // ── ScopedAttendanceRepository — request-scoped (needs SCOPE_CONTEXT_HOLDER) ──
    {
      provide: ATTENDANCE_REPOSITORY_PORT,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedAttendanceRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },

    // ── ATTENDANCE_REPO alias (controller injection token) ────────────────────
    {
      provide: ATTENDANCE_REPO,
      scope: Scope.REQUEST,
      useFactory: (repo: AttendanceRepositoryPort) => repo,
      inject: [ATTENDANCE_REPOSITORY_PORT],
    },

    // ── CheckInAttendanceUseCase — REQUEST-SCOPED ──────────────────────────────
    // PR-3: injects OPERARIO_STATUS (exported by IamModule) for inactive-operario guard.
    {
      provide: CHECK_IN_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        repo: AttendanceRepositoryPort,
        operarioRepo: ScopedOperarioRepository,
        scopeHolder: ScopeContextHolder,
        operarioStatus: OperarioStatusPort,
      ) => new CheckInAttendanceUseCase(repo, operarioRepo, scopeHolder, operarioStatus),
      inject: [ATTENDANCE_REPOSITORY_PORT, ScopedOperarioRepository, SCOPE_CONTEXT_HOLDER, OPERARIO_STATUS],
    },

    // ── CheckOutAttendanceUseCase — REQUEST-SCOPED ────────────────────────────
    {
      provide: CHECK_OUT_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: AttendanceRepositoryPort) => new CheckOutAttendanceUseCase(repo),
      inject: [ATTENDANCE_REPOSITORY_PORT],
    },

    // ── ListAttendanceUseCase — REQUEST-SCOPED ────────────────────────────────
    {
      provide: LIST_ATTENDANCE_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: AttendanceRepositoryPort) => new ListAttendanceUseCase(repo),
      inject: [ATTENDANCE_REPOSITORY_PORT],
    },

    // ── GetAttendanceUseCase — REQUEST-SCOPED ─────────────────────────────────
    {
      provide: GET_ATTENDANCE_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: AttendanceRepositoryPort) => new GetAttendanceUseCase(repo),
      inject: [ATTENDANCE_REPOSITORY_PORT],
    },

    // ── UploadSignatureUseCase — REQUEST-SCOPED ───────────────────────────────
    {
      provide: UPLOAD_SIGNATURE_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: AttendanceRepositoryPort, storage: StoragePort) =>
        new UploadSignatureUseCase(repo, storage),
      inject: [ATTENDANCE_REPOSITORY_PORT, STORAGE_PORT],
    },

    // ── GetSignatureUrlUseCase — REQUEST-SCOPED ───────────────────────────────
    {
      provide: GET_SIGNATURE_URL_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (repo: AttendanceRepositoryPort, storage: StoragePort) =>
        new GetSignatureUrlUseCase(repo, storage),
      inject: [ATTENDANCE_REPOSITORY_PORT, STORAGE_PORT],
    },
  ],
  exports: [ATTENDANCE_REPOSITORY_PORT],
})
export class AsistenciaModule {}
