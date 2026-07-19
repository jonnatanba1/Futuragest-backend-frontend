# Proposal: Jornada Laboral, Horas Extras, Recargos y Compensatorios

## Intent

Colombian labor law compliance (Ley 2101/2021, 2466/2025, Art. 160/168/179 CST): per-operario schedules, minute-by-minute shift classification, overtime surcharges, algorithmic holidays, compensatory rest. Deadlines: dominical surcharge 80%→90% **July 1, 2026**; max weekly hours 44h→42h **July 16, 2026**.

## Scope

### In Scope
- JornadaPolicy 3-level scope (operario→zona→global), 30-min lunch (not computable), 5-min tolerance
- TimeClassificationEngine v2: schedule-window + lunch-skip + midnight-crossing classification
- Check-in-only: check-out VIRTUAL (policy.horaFin + approved overtime). `POST /asistencia/:id/check-out` deprecated
- Auto late-arrival novedad (idempotent, toleranciaMin), overtime pre-auth (biometric approve/reject)
- Líder/Coordinador Flutter: push notifications + biometric approval
- Algorithmic holidays (18/year, Meeus/Jones/Butcher Easter + Emiliani, auto-seed)
- Effective-dated surcharge rates (diurno 25%, nocturno 35%, extra nocturno 75%, dominical 80→90→100%)
- AttendanceBreakdown 1:1 immutable; CompensatoryRest OCCASIONAL/HABITUAL; monetary breakdown
- Web config UI + Flutter multi-role (supervisor overtime request, líder/coordinador approve/reject)

### Out of Scope
- Operario-group scope, payroll integration

## Capabilities

### New
- `jornada-policy-scope`: 3-level resolution, lunch, tolerance
- `time-classification`: schedule-window + lunch-skip algorithm
- `overtime-pre-auth`: biometric approve/reject flow
- `late-arrival-novedad`: idempotent auto-generation
- `holiday-calendar`: multi-year algorithmic generation
- `surcharge-config`: effective-dated legal rates
- `compensatory-rest`: Sunday/holiday tracking (occasional vs habitual)

### Modified
- `attendance-checkin`: late check trigger, virtualized check-out
- `compensation-calculation`: breakdown-aware with monetary values
- `novedad`: TipoNovedad, LLEGADA_TARDE, autoGenerada

## Approach

Enhance existing JornadaModule (hexagonal). Prisma migration adds nullable columns (operarioId, almuerzoInicio/Fin, toleranciaMin) on JornadaPolicy. Refactor TimeClassificationEngine to schedule-window algorithm. Add LateArrivalNovedadPort + virtual check-out scheduler. Flutter role routing + biometric approval. Feature flags (`*_ENABLED`, default `false`) for zero-downtime rollout.

## Affected Areas

| Path | Impact |
|------|--------|
| `backend/` — prisma, jornada, asistencia, novedades, compensacion | Schema extension, engine refactor, late-arrival trigger, virtual checkout |
| `frontend_web/` | 4 new + 3 modified screens |
| `frontend_flutter/` | Role routing, overtime request, approval/reject flow |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| July 1 deadline missed | Medium | SurchargeRate effective dating; immediate seed data |
| Engine edge cases (midnight, lunch) | Medium | 21 unit tests (12 core + 5 lunch + 4 scope); TDD |
| Flutter biometric device failures | Medium | Audit label only; DEVICE_CREDENTIAL fallback |

## Rollback Plan

Feature flags default OFF. Migration nullable-only. Rollback: disable flags → deploy previous revision. Data additive, never destructive.

## Dependencies

Firebase FCM, MinIO storage, existing Jornada/Asistencia/Compensacion modules.

## Success Criteria

- [ ] TimeClassificationEngine: 21 tests (official calendar scenarios)
- [ ] HolidayCalculator: 18 holidays for 2026
- [ ] Check-in-only: check-in → late check → virtual check-out → breakdown persisted
- [ ] Dominical 90% effective July 1, 2026 (seed data verified)
- [ ] Biometric approve/reject via push notification
- [ ] Zero-downtime deploy + instant rollback via feature flags
