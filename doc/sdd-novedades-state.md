# SDD State Backup — `novedades`

> Local backup of SDD progress in case Engram is unavailable. Source of truth is Engram
> (project `futuragest-backend-frontend`); this file is a self-contained snapshot.
> Last updated: 2026-05-31. **Nothing is committed yet** — all work is in the working tree.

---

## Current status

- **Change**: `novedades` (Overtime Novelty + Approval — horas extra with multi-role workflow)
- **SDD phase reached**: `archive` **COMPLETE** — cycle closed (archive-report Engram obs#85)
- **Verify verdict**: **PASS** (0 CRITICAL, 0 WARNING, 1 SUGGESTION cosmetic) → open-handle warnings (jest teardown, exit 0, non-blocking)
- **Tests**: 266 unit + 149 integration = **415 passing, 0 failures**, `tsc --noEmit` clean, contracts build clean
- **Mode**: Automatic · Artifact store: Engram · Delivery: stacked-to-main (3 PR chain)

---

## Domain context (brief)

FuturaGest = workforce/attendance management for waste-collection (aseo) operations in Colombia.
Stack: NestJS (hexagonal) + Prisma 7/Postgres; React web; Flutter mobile (offline-first). Deploy via Dokploy on a VPS.

- **Zones**: Urabá, Bajo Cauca. Montería = head office (LIDER_OPERATIVO).
- **Role hierarchy**: `SYSTEM_ADMIN > GERENCIA > TALENTO_HUMANO > LIDER_OPERATIVO > COORDINADOR > SUPERVISOR` → Operarios.
- **Attendance** (prior change): immutable check-in/out records; operario supervised by SUPERVISOR.
- **Overtime Novedad** (this change): horas extra recorded against completed attendance; multi-role approval (LIDER_OPERATIVO/SYSTEM_ADMIN).

---

## Scope of `novedades`

The **Overtime Novelty + Approval** feature. Six deliverables:

1. Prisma `Novedad` model + `NovedadStatus` enum (PENDING/APPROVED/REJECTED) with partial unique index (DB-enforced one ACTIVE per attendance).
2. Fail-closed scope isolation (`SUPERVISOR` creates + sees own; `COORDINADOR` sees zone; `LIDER_OPERATIVO` global for approval).
3. Create endpoint: POST /asistencia/:attendanceId/novedades (SUPERVISOR, own completed attendance, idempotency via partial-unique 409).
4. Approve + reject endpoints: PATCH /novedades/:id/approve | reject (LIDER_OPERATIVO/SYSTEM_ADMIN, immutable once decided).
5. Cancel endpoint: DELETE /novedades/:id (SUPERVISOR owner, PENDING only).
6. List + detail: GET /novedades (scoped), GET /novedades/:id (scoped).

**Out of scope (deferred to later changes)**:
- FCM/push notification to LIDER on novedad creation (requires notifications block)
- Reporting/export of approved overtime for nomina payroll
- Edit horasExtra while PENDING (currently cancel+recreate)
- CANCELLED status (v1 uses hard delete)

---

## Key decisions

- **Single scoped repository** (`ScopedNovedadRepository`) — all Novedad Prisma access (reads + writes) in one sanctioned file. Enforces no-raw-writes meta-guard.
- **Partial unique index (DB-enforced)**: `CREATE UNIQUE INDEX "Novedad_attendanceId_active_key" ON "Novedad"("attendanceId") WHERE status IN ('PENDING', 'APPROVED')` — allows exactly one ACTIVE (PENDING or APPROVED) per attendance; REJECTED rows don't block recreation. App catches P2002 → 409 NovedadAlreadyExistsError for clean error message.
- **horasExtra as Decimal(5,2)**: Fixed-precision payroll correctness. Prisma serializes to JSON as STRING (Flutter must parse decimal, not double).
- **Attendance immutability preserved**: Novedad is separate INSERT; no Attendance row mutation on create/approve/reject/cancel.
- **Only on COMPLETED attendance**: 409 AttendanceNotCompletedError (state conflict, not malformed payload).
- **Cancel = hard DELETE**: No CANCELLED status in v1. PENDING → DELETE when supervispr cancels; frees partial-unique slot. Decided (APPROVED/REJECTED) → immutable 409.
- **Approval identity server-derived**: `approvedByUserId` from JWT `ctx.userId`, `decidedAt` from server clock (never from body). Audit integrity.
- **Fail-closed scope**: out-of-scope records return 404 (not 403). Does not leak novedad existence to cross-supervisor/zone callers.

---

## Implementation (3 PR slices, all in working tree, not committed)

**PR-1 (foundation ~250 lines)**
- Prisma Novedad model + NovedadStatus enum + migration SQL with hand-authored partial unique index
- SCOPE_MAPS['Novedad'] entry (zonePath + supervisorPath, denormalized zoneId)
- ScopedNovedadRepository (reads via findManyScoped/findFirstScoped, writes via this.delegate inside sanctioned file)
- meta-guard implementedModels += 'Novedad' (atomic with SCOPE_MAPS + repo file)
- NovedadRepositoryPort + Novedad domain entity
- novedad.errors.ts (6 domain error classes)
- Contracts novedad.ts DTO skeleton + index export
- jest-global-setup update (FK-safe cleanup: Novedad before Attendance)
- **Gate**: meta-guard GREEN, contracts build PASS, typecheck clean, 233 unit tests

**PR-2a (use-cases ~350 lines)**
- 6 use-cases: CreateNovedadUseCase, ApproveNovedadUseCase, RejectNovedadUseCase, CancelNovedadUseCase, GetNovedadUseCase, ListNovedadesUseCase
- All REQUEST-scoped, inject SCOPE_CONTEXT_HOLDER
- CreateNovedadUseCase: validates horasExtra (>0, <=24, 2dp), checks attendance scoped+completed, derives supervisorId/zoneId from JWT, creates PENDING, catches P2002 → 409
- Approve/reject: reads scoped, checks status=PENDING, updates to APPROVED/REJECTED + approvedByUserId(JWT) + decidedAt(server clock)
- Cancel: reads scoped + ownership, checks status=PENDING, hard deletes
- Get/list: scoped reads via ScopedNovedadRepository
- Unit tests (NV-38..NV-50): mocked ports, error flows
- **Gate**: 260 unit tests green

**PR-2b (interface + DI + integration ~350 lines)**
- NovedadController: 6 routes, CreateNovedadBody DTO with @IsNumberString(), mapDomainError helper (409/404/400 codes)
- NovedadesModule DI: all providers REQUEST-scoped, imports PrismaModule+AuthModule+IamModule+AsistenciaModule
- app.module.ts registration
- Integration suite novedades.int-spec.ts: fixture setup (S1/S2/L1/C1/C2/O1/A1), 55 scenarios (NV-01..NV-55)
- Integration tests: create, approve/reject, cancel, scoped reads, immutability, LIDER global, fail-closed
- **Gate**: 266 unit (34 suites) + 149 int (7 suites) all green

### Files created
- `backend/prisma/migrations/20260531180000_add_novedad/migration.sql`
- `backend/src/modules/novedades/domain/novedad.entity.ts`
- `backend/src/modules/novedades/domain/ports/novedad-repository.port.ts`
- `backend/src/modules/novedades/domain/novedad.errors.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/application/create-novedad.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/application/approve-novedad.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/application/reject-novedad.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/application/cancel-novedad.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/application/get-novedad.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/application/list-novedades.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/infrastructure/scoped-novedad.repository.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/interface/novedad.controller.ts` (+ `.spec.ts`)
- `backend/src/modules/novedades/novedades.module.ts`
- `backend/src/modules/novedades/novedades.int-spec.ts`
- `packages/contracts/src/shared/novedad.ts`

### Files modified
- `backend/prisma/schema.prisma` (Novedad model + NovedadStatus enum + back-relations to Attendance/Supervisor/User)
- `backend/src/modules/iam/domain/scope-filter.ts` (SCOPE_MAPS['Novedad'])
- `backend/src/modules/iam/infrastructure/scope-meta-guard.spec.ts` (implementedModels += 'Novedad')
- `backend/src/database/jest-global-setup.ts` (FK-safe cleanup: Novedad before Attendance)
- `packages/contracts/src/index.ts` (export * from ./shared/novedad)
- `backend/src/app.module.ts` (NovedadesModule import)

---

## Test evidence

**Unit** (266 tests, 34 suites):
- error classes, port shape, use-case logic (horasExtra validation, scoped reads, state machine: PENDING → APPROVED/REJECTED, immutability)
- controller error→HTTP mapping (201/200/204/400/404/409 codes), permission gates (SUPERVISOR create, LIDER approve, owner cancel)
- scope-filter fail-closed (NV-53/54/55), meta-guard sanctioned-repo enforcement
- All 6 prior suites still GREEN (zero regression)

**Integration** (149 tests, 7 suites including novedades):
- 55 scenarios (NV-01..NV-55): create (happy + body isolation + state checks + validation + scope miss + token miss), approve/reject (LIDER global, immutability, role gates), cancel (ownership + state), scoped reads (SUPERVISOR/COORDINADOR/LIDER visibility)
- Cross-zone novedad (LIDER approves genuinely different zone) — tests global visibility
- Attendance immutability snapshots (before/after novedad create)
- +42 integration tests vs baseline; all prior suites still GREEN

**Migration**:
- migration.sql FULL MATCH vs schema.prisma Novedad model (12 cols, types, nullability, indexes, FKs, back-relations)
- Partial unique index syntax verified identical to Assignment precedent (`WHERE "endDate" IS NULL` → `WHERE status IN ('PENDING', 'APPROVED')`)
- `prisma migrate status` = up to date, no drift
- Applied correctly to test DB via `migrate deploy` (after manual _prisma_migrations baseline one-time for test DB — fresh CI unaffected)

---

## Deviations (all acceptable)

1. **horasExtra string representation**: Prisma Decimal.toString() strips trailing zero ("2.5" not "2.50"). Tests assert `typeof === 'string'` + `parseFloat(...).toBeCloseTo(2.5, 2)` — robust. Flutter parses decimal from string regardless.

2. **Test DB _prisma_migrations bootstrap**: Test DB lacked migration tracking; manually inserted baseline records. Fresh CI deploy (`prisma migrate deploy` on clean DB) applies all migrations in order — unaffected.

3. **@IsNumberString() on DTO**: Client sends horasExtra as numeric string; range validation (>0, <=24) in use-case via parseFloat. Business rules all enforced (NV-10..NV-13 green).

---

## Findings (non-blocking)

1. **SUGGESTION-1: Jest open-handle warnings** (cosmetic, exit 0, non-blocking)
   - Issue: Both test:unit and test:int show "worker failed to exit gracefully" / "Jest did not exit" warnings
   - Cause: Likely lingering Prisma client or NestJS app resource not fully closed in one suite
   - Recommendation: Future `--detectOpenHandles` pass for CI cleanliness

2. **Pre-existing fragility** (out of scope, deferred from org-structure)
   - jest-global-setup cleanTestFixtures email-allowlist: non-deterministic fixture filtering

---

## Invariants verified

- INV-01 (Fail-closed scope): SUPERVISOR missing supervisorId → DENY_PREDICATE → zero rows ✓
- INV-02 (Body isolation): supervisorId/zoneId/approvedByUserId/decidedAt from JWT+server, not body ✓
- INV-03 (No biometric): zero biometric fields ✓
- INV-04 (Attendance immutability): snapshots before/after novedad ops confirm Attendance row unchanged ✓
- INV-05 (State machine): PENDING → APPROVED/REJECTED only valid transition; already-decided → 409 ImmutableNovedadError ✓
- INV-06 (Partial unique — active): One ACTIVE (PENDING or APPROVED) per attendanceId; REJECTED + new creation after rejection allowed ✓
- INV-07 (Single sanctioned repo): ALL Novedad Prisma calls in scoped-novedad.repository.ts; meta-guard GREEN ✓
- INV-08 (LIDER global): NV-25 genuine cross-zone novedad (S2 in Z2) approved by LIDER → 200 + approvedByUserId = lider ✓
- INV-09 (Additive): All 6 prior test suites still PASS; zero regression ✓
- INV-10 (W4 — no scoped includes): No `include: { attendance: true }` on novedad queries; uses separate AttendanceRepositoryPort ✓

---

## Engram topic keys (recovery pointers)

- `sdd/novedades/{explore(#77), proposal(#78), spec(#80), design(#79), tasks(#81), apply-progress(#83), verify-report(#82), archive-report(#85)}`
- `sdd-init/futuragest-backend-frontend` (Strict TDD mode active)
- `infra/contracts-resolution` (contracts-dist gotcha)

---

## Next steps

1. Orchestrator creates 3 commits + PRs (or user manually commits per slice/work-unit).
2. `git push` to GitHub (no push performed in this session; user controls commit timing).
3. Change is CLOSED — no post-archive SDD work for novedades.
