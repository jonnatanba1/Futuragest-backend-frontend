/**
 * CompensacionModule — DI wiring for the compensacion domain.
 *
 * All providers are REQUEST-scoped (depend on request-scoped ScopeContextHolder
 * populated by AuthGuard before any use-case runs).
 *
 * PR-A providers: JornadaPolicy CRUD + live balance computation.
 * PR-B additions: CompensationPeriod, close-fortnight, carry-in.
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
import { JornadaPolicyRepository } from '../iam/infrastructure/jornada-policy.repository';

// Domain ports
import { JORNADA_POLICY_REPOSITORY_PORT } from './domain/ports/jornada-policy-repository.port';
import { ATTENDANCE_READER_PORT } from './domain/ports/attendance-reader.port';
import {
  COMPENSATION_PERIOD_LOOKUP_PORT,
  NullCompensationPeriodLookup,
} from './domain/ports/compensation-period-lookup.port';

// Use-cases
import { CalculatePeriodBalanceUseCase } from './application/calculate-period-balance.use-case';
import { GetPeriodBalanceUseCase } from './application/get-period-balance.use-case';
import { SetJornadaPolicyUseCase } from './application/set-jornada-policy.use-case';
import { GetJornadaPolicyTimelineUseCase } from './application/get-jornada-policy-timeline.use-case';

// Controller tokens
import {
  CompensacionController,
  GET_PERIOD_BALANCE_USE_CASE,
  SET_JORNADA_POLICY_USE_CASE,
  GET_JORNADA_POLICY_TIMELINE_USE_CASE,
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

    // ── ScopedAttendanceRepository — request-scoped (needs ScopeContextHolder) ─
    // Reused from IamModule; here we provide it as AttendanceReaderPort.
    {
      provide: ATTENDANCE_READER_PORT,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, holder: ScopeContextHolder) =>
        new ScopedAttendanceRepository(prisma, holder),
      inject: [PrismaService, SCOPE_CONTEXT_HOLDER],
    },

    // ── CompensationPeriodLookupPort — PR-A stub (always returns null) ─────────
    // PR-B replaces this with the real scoped adapter.
    {
      provide: COMPENSATION_PERIOD_LOOKUP_PORT,
      useValue: new NullCompensationPeriodLookup(),
    },

    // ── CalculatePeriodBalanceUseCase — pure, no scope needed ─────────────────
    CalculatePeriodBalanceUseCase,

    // ── GetPeriodBalanceUseCase — request-scoped (uses scoped attendance reader) ─
    {
      provide: GET_PERIOD_BALANCE_USE_CASE,
      scope: Scope.REQUEST,
      useFactory: (
        reader: ScopedAttendanceRepository,
        policyRepo: JornadaPolicyRepository,
        calcUseCase: CalculatePeriodBalanceUseCase,
      ) => new GetPeriodBalanceUseCase(reader, policyRepo, calcUseCase),
      inject: [ATTENDANCE_READER_PORT, JORNADA_POLICY_REPOSITORY_PORT, CalculatePeriodBalanceUseCase],
    },

    // ── SetJornadaPolicyUseCase — singleton (global policy, no scope) ─────────
    {
      provide: SET_JORNADA_POLICY_USE_CASE,
      useFactory: (policyRepo: JornadaPolicyRepository, periodLookup: NullCompensationPeriodLookup) =>
        new SetJornadaPolicyUseCase(policyRepo, periodLookup),
      inject: [JORNADA_POLICY_REPOSITORY_PORT, COMPENSATION_PERIOD_LOOKUP_PORT],
    },

    // ── GetJornadaPolicyTimelineUseCase — singleton ───────────────────────────
    {
      provide: GET_JORNADA_POLICY_TIMELINE_USE_CASE,
      useFactory: (policyRepo: JornadaPolicyRepository) =>
        new GetJornadaPolicyTimelineUseCase(policyRepo),
      inject: [JORNADA_POLICY_REPOSITORY_PORT],
    },
  ],
})
export class CompensacionModule {}
