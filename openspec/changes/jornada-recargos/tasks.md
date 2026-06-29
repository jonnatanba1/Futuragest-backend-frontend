# Tasks: Jornada, Horas Extras, Recargos y Compensatorios

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2100 (backend ~1200 + web ~400 + Flutter ~500) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: **Yes**
Chained PRs recommended: **Yes**
Chain strategy: **stacked-to-main**
400-line budget risk: **High**

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema migration + JornadaPolicy 3-level + seeds | PR 1 | ~300 LOC; base=feature/jornada-recargos |
| 2 | Engine v2 + classify use-case + virtual checkout scheduler | PR 2 | ~450 LOC; base=PR 1 branch |
| 3 | Late arrival novedad auto-generation | PR 3 | ~250 LOC; base=PR 2 branch |
| 4 | Enhanced compensation (breakdown + payout + CompensatoryRest) | PR 4 | ~400 LOC; base=PR 3 branch |
| 5 | Frontend web: config UI + balance + compensatories | PR 5 | ~400 LOC; base=PR 4 branch (or independent) |
| 6 | Flutter multi-rol: overtime request + biometric approval | PR 6 | ~400 LOC; base=PR 4 branch (or independent) |

---

## Phase 1: Fundamentos — Schema + Policy 3-Level + Seeds (PR 1, F1)

- [x] 1.1 [RED] Write failing test: JornadaPolicy lacks operarioId, almuerzoInicio, almuerzoFin, toleranciaMin fields. `backend/prisma/schema.prisma` — `spec.ts`
- [x] 1.2 [GREEN] Add migration `20260629230000_add_jornada_policy_v2_and_tipo_novedad` with ALTER TABLE for operarioId, almuerzoInicio, almuerzoFin, toleranciaMin; partial unique index `WHERE "tipoNovedad"='LLEGADA_TARDE' AND "autoGenerada"=true`. Add `TipoNovedad` enum + `tipoNovedad`, `minutosTarde`, `autoGenerada` to Novedad. `backend/prisma/migrations/`
- [x] 1.3 [GREEN] Update schema.prisma: JornadaPolicy add operarioId, almuerzoInicio, almuerzoFin, toleranciaMin; change @@unique to `[operarioId, zoneId, vigenteDesde]`. Novedad add tipoNovedad, minutosTarde, autoGenerada. Run `prisma migrate deploy` + `prisma generate`.
- [x] 1.4 [GREEN] Extend `JornadaPolicyRepositoryPort`: add `resolvePolicy(operarioId, zoneId, date)` with 3-level fallback (operario→zona→global). Implement in Prisma repo. `backend/src/modules/jornada/domain/ports/jornada-policy-repository.port.ts` + `infrastructure/prisma-jornada-policy.repository.ts`
- [x] 1.5 [GREEN] Create `resolve-policy.use-case.ts`: orchestrates 3-level fallback, throws `NoPolicyForDateError`. Tests: scope resolution (S1-S5 scenarios). `backend/src/modules/jornada/application/`
- [x] 1.6 [GREEN] Add seed migration for surcharge rates (80/90/100% dominical), global policy (6:00–14:00, lunch auto, tol=5), holidays 2026. `backend/prisma/seeds/`
- [x] 1.7 [GREEN] Register new providers in `jornada.module.ts`. Verify `prisma migrate status` zero drift.
- [x] 1.8 [RED→GREEN] Integration test: policy resolution operario→zona→global; lunch auto midpoint calc (6:00–14:00 → 9:45–10:15); toleranciaMin=5 default. `backend/src/modules/jornada/jornada.int-spec.ts`

## Phase 2: TimeClassificationEngine v2 + Virtual Check-Out (PR 2, F2)

- [x] 2.1 [RED] Write failing tests for new engine signature: `classifyShift({ checkIn, checkOut, schedule, holidays })` — 12 core + 5 lunch scenarios. `backend/src/modules/jornada/domain/time-classification-engine.spec.ts`
- [x] 2.2 [GREEN] Refactor `TimeClassificationEngine`: accept `schedule{horaInicio, horaFin, horasDiarias, diasLaborales, almuerzoInicio, almuerzoFin}` + `holidays:Set`. Add schedule-window ordinary/extra logic: within schedule → ordinary up to horasDiarias, beyond → extra. Add unconditional lunch-window skip. Update `isDiurno` comment to 7:00 PM (correct). `backend/src/modules/jornada/domain/time-classification-engine.ts`
- [x] 2.3 [GREEN] Update `ClassifyAttendanceUseCase`: resolve operarioId, pass schedule window + holidays to engine, handle lunch auto-calculation when null. `backend/src/modules/jornada/application/classify-attendance.use-case.ts`
- [x] 2.4 [GREEN] Create `virtual-checkout.scheduler.ts`: cron job polling `completedAt IS NULL AND checkOutVirtual <= now()`. Computes `checkOutVirtual = MAX(horaFin, horaFin + Σ APPROVED overtime)`. Marks `completedAt`, triggers classification. Feature-flag gated: `CHECK_OUT_VIRTUAL_ENABLED`. `backend/src/modules/jornada/infrastructure/virtual-checkout.scheduler.ts`
- [x] 2.5 [GREEN] Deprecate manual `POST /asistencia/:id/check-out`: return `410 Gone` when flag ON. Add feature-flag check in checkout controller. Tests: V1-V4 scenarios. `backend/src/modules/asistencia/interface/attendance.controller.ts`
- [x] 2.6 [RED→GREEN] Integration test: full pipeline start-to-finish — check-in → virtual checkout → classification → breakdown persisted. `backend/src/modules/jornada/jornada.int-spec.ts`

## Phase 3: Late Arrival Novedad Auto (PR 3, F2.5)

- [x] 3.1 [RED] Write failing tests for `LateArrivalNovedadService`: 8 scenarios (A1-A8) covering exact on-time, within tolerance, at boundary, outside tolerance, very late, early, idempotent duplicate, per-operario policy. `backend/src/modules/jornada/application/late-arrival-novedad.service.spec.ts`
- [x] 3.2 [GREEN] Create `LateArrivalNovedadPort` interface (symbol-based DI token) in `asistencia/domain/ports/`. Create `LateArrivalNovedadService`: resolves policy via 3-level `findLatest`, compares checkIn local time against `horaInicio + toleranciaMin`, creates `Novedad{LLEGADA_TARDE, autoGenerada=true, minutosTarde=N}` via NovedadRepositoryPort. Idempotent via P2002 catch. Extended `CreateNovedadData` with `tipoNovedad`, `autoGenerada`, `minutosTarde`. Updated `ScopedNovedadRepository.create()` to pass new fields. `backend/src/modules/jornada/application/late-arrival-novedad.service.ts` + `backend/src/modules/asistencia/domain/ports/late-arrival-novedad.port.ts`
- [x] 3.3 [GREEN] Wire fire-and-forget call in `CheckInAttendanceUseCase`: after successful create, invoke `lateArrivalPort.checkAndCreateLateArrivalNovedad(attendanceId)` without awaiting. Catches both sync throws and async rejections, logs without breaking check-in. `backend/src/modules/asistencia/application/check-in-attendance.use-case.ts`
- [x] 3.4 [GREEN] Register `LateArrivalNovedadService` in `jornada.module.ts` under `LATE_ARRIVAL_NOVEDAD_PORT`, export it. Import `NovedadesModule` (forwardRef) for `NOVEDAD_REPOSITORY_PORT`. Inject `LATE_ARRIVAL_NOVEDAD_PORT` into `CheckInAttendanceUseCase` factory in `asistencia.module.ts`. Export `NOVEDAD_REPOSITORY_PORT` from `novedades.module.ts`.
- [x] 3.5 [RED→GREEN] Integration test: `late-arrival-novedad.int-spec.ts` — seeds operario policy (06:00, tol=5), creates attendance at 06:06 (late) → asserts LLEGADA_TARDE novedad (minutosTarde=6, autoGenerada=true); repeat call → idempotent (no duplicate). Creates attendance at 06:03 (within tolerance) → asserts no novedad. `backend/src/modules/jornada/application/late-arrival-novedad.int-spec.ts`
- [x] 3.6 Full regression: `pnpm turbo run test --filter=api` unit tests — 80 suites, 660 tests, ALL GREEN. `tsc --noEmit` clean.

## Phase 4: Enhanced Compensation (PR 4, F3)

- [x] 4.1 [GREEN] Update `CalculatePeriodBalanceUseCase`: read `AttendanceBreakdown` per attendance, aggregate by category (horasOrdinariasDiurnas, nocturnas, extraDiurnas, extraNocturnas, dominicalesFestivas). Fallback to legacy if breakdown null. `backend/src/modules/compensacion/application/calculate-period-balance.use-case.ts`
- [x] 4.2 [GREEN] Update `Payout` calculation: use `SurchargeValueCalculator` (T4.1) + `valorHoraOrdinaria` to compute `valorRecargos`. Persist `tasaDominicalAplicada` snapshot. `backend/src/modules/compensacion/domain/payout.vo.ts`
- [x] 4.3 [GREEN] Implement `CompensatoryRest` generation: on classification detect dominical/festivo → upsert `CompensatoryRest{type: OCCASIONAL}`. Recalculate monthly: ≥3 → all reclassify to `HABITUAL`. Feature-flag: `COMPENSATORY_REST_ENABLED`. `backend/src/modules/jornada/application/classify-attendance.use-case.ts` (extend)
- [x] 4.4 [GREEN] Add `PATCH /compensatorio/:id` endpoint (TALENTO_HUMANO, SYSTEM_ADMIN): schedule, resolve, add notes. `backend/src/modules/compensacion/interface/compensacion.controller.ts`
- [x] 4.5 [RED→GREEN] Integration test: period with 3 Sundays → HABITUAL; period with 1 Sunday → OCCASIONAL. Payout with 90% dominical rate → correct valorRecargos.

## Phase 5: Frontend Web (PR 5, F4)

- [ ] 5.1 [RED] Write failing Vitest test: Jornada config page does not exist. `frontend_web/src/`
- [ ] 5.2 [GREEN] Create `ConfigJornada` page: CRUD JornadaPolicy (operario scope, zone, global), timeline visual. `frontend_web/src/pages/config/jornada/`
- [ ] 5.3 [GREEN] Create `ConfigRecargos` page: table of SurchargeRate by category + date, add new rate form. `frontend_web/src/pages/config/recargos/`
- [ ] 5.4 [GREEN] Modify `AsistenciaDetalle` drawer: show breakdown stacked bars (diurna/nocturna/extra), dominical/festivo flags, lunch deduction note. `frontend_web/src/pages/asistencia/`
- [ ] 5.5 [GREEN] Modify `CompensacionBalance` page: breakdown table by category with hours + monetary value. `frontend_web/src/pages/compensacion/`
- [ ] 5.6 [GREEN] Create `Compensatorios` page: list pending/scheduled/taken, filter by operario/month, schedule/take actions. `frontend_web/src/pages/compensacion/compensatorios/`

## Phase 6: Flutter Multi-Rol (PR 6, F4.5)

- [x] 6.1 [RED] Write failing widget test: supervisor overtime request screen not present. `frontend_flutter/test/`
- [x] 6.2 [GREEN] Add `SolicitarHorasExtra` screen: operario selector, hours input, motivo field → POST `/asistencia/:id/novedades` with `tipoNovedad=HORAS_EXTRA`. `frontend_flutter/lib/screens/supervisor/`
- [x] 6.3 [GREEN] Remove check-out button from supervisor flow. Add "Jornada cerrada: X.Xh" status on auto-complete. `frontend_flutter/lib/screens/supervisor/`
- [x] 6.4 [GREEN] Add push notification handler: on overtime request received → open detail. Register FCM token via DeviceSession. `frontend_flutter/lib/services/`
- [x] 6.5 [GREEN] Create Líder/Coordinador approval screen: request detail (operario, supervisor, hours, motive, history), "Aprobar"/"Rechazar" buttons with biometric dialog → PATCH `/novedades/:id/approve|reject`. `frontend_flutter/lib/screens/lider/`
- [x] 6.6 [GREEN] Create "Llegadas tarde" tab: list `LLEGADA_TARDE` PENDING with accept-as-justified / reject actions (biometric). `frontend_flutter/lib/screens/lider/`
- [x] 6.7 [GREEN] Implement role-based navigation: SUPERVISOR sees check-in + overtime request; LIDER/COORD sees approval queue + late arrivals + history. `frontend_flutter/lib/navigation/`

---

## Dependency Graph

```
PR 1 (F1: Schema) ──► PR 2 (F2: Engine) ──► PR 3 (F2.5: LateArrival) ──► PR 4 (F3: Compensation)
                                                                                │
                                                    PR 5 (F4: Web) ◄───────────┤ (depends on API)
                                                    PR 6 (F4.5: Flutter) ◄─────┘ (depends on API)
```

PR 5 and PR 6 depend on PR 4's API endpoints being available but can be developed in parallel with mocked APIs.

## Spec Coverage Map

| REQ | Phases | Tests |
|-----|--------|-------|
| REQ-001 (Policy scope) | PR 1: 1.4-1.8 | S1-S5 |
| REQ-002 (Engine v2) | PR 2: 2.1-2.3 | L1-L5 |
| REQ-003 (Virtual check-out) | PR 2: 2.4-2.6 | V1-V4 |
| REQ-004 (Late arrival) | PR 3: 3.1-3.5 | A1-A8 |
| REQ-005 (Overtime pre-auth) | PR 2 + PR 6 | via 2.4 + 6.5 |
| REQ-006 (CompensatoryRest) | PR 4: 4.3-4.5 | 3 tests |
| REQ-007 (SurchargeRate) | PR 1: 1.6 + PR 4: 4.2 | 4 tests |
| REQ-008 (Novedad TipoNovedad) | PR 1: 1.2-1.3 + PR 3 | A1-A8 |
| REQ-009 (Compensation breakdown) | PR 4: 4.1-4.5 | via 4.5 |
| REQ-010 (Virtualized checkout) | PR 2: 2.4-2.5 | V1-V4 |
