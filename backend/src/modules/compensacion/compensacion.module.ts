/**
 * CompensacionModule — DI wiring for the compensacion domain.
 *
 * All providers are REQUEST-scoped (depend on request-scoped ScopeContextHolder
 * populated by AuthGuard before any use-case runs).
 *
 * PR-A providers: JornadaPolicy CRUD + live balance computation.
 * PR-B additions: CompensationPeriod, close-fortnight, carry-in wiring,
 *   real CompensationPeriodLookup (replaces NullCompensationPeriodLookup stub).
 *
 * Mirrors AsistenciaModule wiring pattern (useFactory, inject arrays).
 */

import { Module, Scope } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';
import { SCOPE_CONTEXT_HOLDER, type ScopeContextHolder } from '../auth/domain/scope-context';

// Infrastructure adapters
import { ScopedAttendanceRepository } from '../iam/infrastructure/scoped-attendance.repository';
import { ScopedOperarioRepository } from '../iam/infrastructure/scoped-operario.repository';
import { JornadaPolicyRepository } from '../iam/infrastructure/jornada-policy.repository';
import { ScopedCompensationPeriodRepository } from '../iam/infrastructure/scoped-compensation-period.repository';
import { SupervisorZoneReaderAdapter } from '../iam/infrastructure/supervisor-zone-reader';
import { CompensationDriftMarkerAdapter } from './infrastructure/compensation-drift-marker.adapter';

// Domain ports
import { JORNADA_POLICY_REPOSITORY_PORT } from './domain/ports/jornada-policy-repository.port';
import { ATTENDANCE_READER_PORT } from './domain/ports/attendance-reader.port';
import { OPERARIO_READER_PORT } from './domain/ports/operario-reader.port';
import { COMPENSATION_PERIOD_REPOSITORY_PORT } from './domain/ports/compensation-period-repository.port';
// CompensationPeriodLookupPort — now wired to the REAL adapter (PR-B replaces PR-A stub)
import { COMPENSATION_PERIOD_LOOKUP_PORT } from './domain/ports/compensation-period-lookup.port';
import { SUPERVISOR_ZONE_READER_PORT } from './domain/ports/supervisor-zone-reader.port';
// Cross-module drift marker port (Fix 5 — exported for AsistenciaModule consumption)
import { COMPENSATION_DRIFT_MARKER_PORT } from '../asistencia/domain/ports/compensation-drift-marker.port';

// Use-cases
import { CalculatePeriodBalanceUseCase } from './application/calculate-period-balance.use-case';
import { GetPeriodBalanceUseCase } from './application/get-period-balance.use-case';
import { SetJornadaPolicyUseCase } from './application/set-jornada-policy.use-case';
import { GetJornadaPolicyTimelineUseCase } from './application/get-jornada-policy-timeline.use-case';
import { CloseCompensationPeriodUseCase } from './application/close-compensation-period.use-case';
import { GetPeriodPayoutUseCase } from './application/get-period-payout.use-case';
import { ConfirmPeriodPayoutUseCase } from './application/confirm-period-payout.use-case';

// Controller tokens
import {
  CompensacionController,
  GET_PERIOD_BALANCE_USE_CASE,
  SET_JORNADA_POLICY_USE_CASE,
  GET_JORNADA_POLICY_TIMELINE_USE_CASE,
  CLOSE_COMPENSATION_PERIOD_USE_CASE,
  GET_PERIOD_PAYOUT_USE_CASE,
  CONFIRM_PERIOD_PAYOUT_USE_CASE,
} from './interface/compensacion.controller';

@Module({
  imports: [PrismaModule, AuthModule, IamModule],
  controllers: [CompensacionController],
  providers: [
    // ── JornadaPolicyRepository — singleton (global, no request scope needed) ─
    {
      provide: JORNADA_POLICY_REPOSITORY_PORT,
      useFactory: (prisma: PrismaService) => new JornadaPolicyRepository(prisma),
      inject: [PrismaService],
    },

    // ── SupervisorZoneReaderAdapter — singleton (global, no request scope needed) ─
    // Fix 7: resolves supervisor's zoneId for CloseCompensationPeriodUseCase.
    {
      provide: SUPERVISOR_ZONE_READER_PORT,
      useFactory: (prisma: PrismaService) => new SupervisorZoneReaderAdapter(prisma),
      inject: [PrismaService],
    },

    // ── CompensationDriftMarkerAdapter — singleton (global, no request scope needed) ─
    // Fix 5: marks closed periods as diverged when attendance data changes.
    // Exported so AsistenciaModule can inject it into CheckOutAttendanceUseCase.
    {
      provide: COMPENSATION_DRIFT_MARKER_PORT,
      useFactory: (prisma: PrismaService) => new CompensationDriftMarkerAdapter(prisma),
      inject: [PrismaService],
    },

    // ── ScopedAttendanceRepository — request-scoped (needs ScopeContextHolder) ─
    {
      provide: ATTENDANCE_READER_PORT,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedAttendanceRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },

    // ── ScopedOperarioRepository — request-scoped, provided as OperarioReaderPort ─
    {
      provide: OPERARIO_READER_PORT,
      scope: Scope.REQUEST,
      useFactory: (operarioRepo: ScopedOperarioRepository) => operarioRepo,
      inject: [ScopedOperarioRepository],
    },

    // ── ScopedCompensationPeriodRepository — request-scoped ──────────────────
    // PR-B: replaces the NullCompensationPeriodLookup stub from PR-A.
    // Provided under TWO tokens:
    //   1. COMPENSATION_PERIOD_REPOSITORY_PORT — full CRUD (close use-case + get balance carry-in)
    //   2. COMPENSATION_PERIOD_LOOKUP_PORT — narrow read-only interface used by SetJornadaPolicyUseCase
    //      (findOverlappingClosed). Both point to the same factory instance.
    {
      provide: COMPENSATION_PERIOD_REPOSITORY_PORT,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedCompensationPeriodRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },
    {
      // CompensationPeriodLookupPort — real adapter (PR-B replaces NullCompensationPeriodLookup)
      provide: COMPENSATION_PERIOD_LOOKUP_PORT,
      scope: Scope.REQUEST,
      useFactory: (periodRepo: ScopedCompensationPeriodRepository) => periodRepo,
      inject: [COMPENSATION_PERIOD_REPOSITORY_PORT],
    },

    // ── CalculatePeriodBalanceUseCase — pure, no scope needed ─────────────────
    CalculatePeriodBalanceUseCase,

    // ── GetPeriodBalanceUseCase — request-scoped ─────────────────────────────
    // PR-B: now injects CompensationPeriodRepositoryPort for carry-in read.
    {
      provide: GET_PERIOD_BALANCE_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        reader: ScopedAttendanceRepository,
        policyRepo: JornadaPolicyRepository,
        calcUseCase: CalculatePeriodBalanceUseCase,
        operarioRepo: ScopedOperarioRepository,
        periodRepo: ScopedCompensationPeriodRepository,
      ) => new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase, operarioRepo, periodRepo),
      inject: [
        ATTENDANCE_READER_PORT,
        JORNADA_POLICY_REPOSITORY_PORT,
        CalculatePeriodBalanceUseCase,
        OPERARIO_READER_PORT,
        COMPENSATION_PERIOD_REPOSITORY_PORT,
      ],
    },

    // ── SetJornadaPolicyUseCase — request-scoped (PR-B: real period lookup) ───
    // PR-A used singleton + NullCompensationPeriodLookup.
    // PR-B: now request-scoped so it can use the real ScopedCompensationPeriodRepository
    // which depends on the request-scoped ScopeContextHolder.
    {
      provide: SET_JORNADA_POLICY_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        policyRepo: JornadaPolicyRepository,
        periodLookup: ScopedCompensationPeriodRepository,
      ) => new SetJornadaPolicyUseCase(policyRepo, periodLookup),
      inject: [JORNADA_POLICY_REPOSITORY_PORT, COMPENSATION_PERIOD_LOOKUP_PORT],
    },

    // ── GetJornadaPolicyTimelineUseCase — singleton ───────────────────────────
    {
      provide: GET_JORNADA_POLICY_TIMELINE_USE_CASE,
      useFactory: (policyRepo: JornadaPolicyRepository) =>
        new GetJornadaPolicyTimelineUseCase(policyRepo),
      inject: [JORNADA_POLICY_REPOSITORY_PORT],
    },

    // ── CloseCompensationPeriodUseCase — request-scoped ──────────────────────
    // Fix 7: now also injects SupervisorZoneReaderAdapter to resolve real zoneId.
    {
      provide: CLOSE_COMPENSATION_PERIOD_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        periodRepo: ScopedCompensationPeriodRepository,
        attendanceReader: ScopedAttendanceRepository,
        policyRepo: JornadaPolicyRepository,
        calcUseCase: CalculatePeriodBalanceUseCase,
        operarioRepo: ScopedOperarioRepository,
        supervisorZoneReader: SupervisorZoneReaderAdapter,
      ) =>
        new CloseCompensationPeriodUseCase(
          periodRepo,
          attendanceReader,
          policyRepo,
          calcUseCase,
          operarioRepo,
          supervisorZoneReader,
        ),
      inject: [
        COMPENSATION_PERIOD_REPOSITORY_PORT,
        ATTENDANCE_READER_PORT,
        JORNADA_POLICY_REPOSITORY_PORT,
        CalculatePeriodBalanceUseCase,
        OPERARIO_READER_PORT,
        SUPERVISOR_ZONE_READER_PORT,
      ],
    },

    // ── GetPeriodPayoutUseCase — request-scoped (PR-C) ───────────────────────
    // Reads the frozen CompensationPeriod snapshot and applies the recargo factor.
    {
      provide: GET_PERIOD_PAYOUT_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        periodRepo: ScopedCompensationPeriodRepository,
        operarioRepo: ScopedOperarioRepository,
      ) => new GetPeriodPayoutUseCase(periodRepo, operarioRepo),
      inject: [COMPENSATION_PERIOD_REPOSITORY_PORT, OPERARIO_READER_PORT],
    },

    // ── ConfirmPeriodPayoutUseCase — request-scoped (Fix 4) ──────────────────
    // Stamps paidAt + payoutRef on a closed period (sanctioned mutation).
    {
      provide: CONFIRM_PERIOD_PAYOUT_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        periodRepo: ScopedCompensationPeriodRepository,
        operarioRepo: ScopedOperarioRepository,
      ) => new ConfirmPeriodPayoutUseCase(periodRepo, operarioRepo),
      inject: [COMPENSATION_PERIOD_REPOSITORY_PORT, OPERARIO_READER_PORT],
    },
  ],
  exports: [
    // Export COMPENSATION_DRIFT_MARKER_PORT so AsistenciaModule can inject it
    // into CheckOutAttendanceUseCase for Fix 5 drift detection.
    COMPENSATION_DRIFT_MARKER_PORT,
  ],
})
export class CompensacionModule {}
