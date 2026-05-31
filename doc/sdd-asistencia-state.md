# SDD State Backup — `asistencia`

> Local backup of SDD progress in case Engram is unavailable. Source of truth is Engram
> (project `futuragest-backend-frontend`); this file is a self-contained snapshot.
> Last updated: 2026-05-31. **Nothing is committed yet** — all work is in the working tree.

---

## Current status

- **Change**: `asistencia` (Attendance Core — check-in/check-out with operario signature + GPS)
- **SDD phase reached**: `archive` **COMPLETE** — cycle closed (archive-report Engram obs#75)
- **Verify verdict**: **PASS WITH WARNINGS** (0 CRITICAL) → WARNING-1 (fresh-CI migrate unproven, reasoned LOW) + WARNING-2 (port specs type-only, legit) + WARNING-3 (idempotent 200 contract, RESOLVED this session)
- **Tests**: 202 unit + 112 integration = **314 passing, 0 failures**, `tsc --noEmit` clean, contracts build clean
- **Mode**: Automatic · Artifact store: Engram · Delivery: stacked-to-main (3 PR chain)

---

## Domain context (brief)

FuturaGest = workforce/attendance management for waste-collection (aseo) operations in Colombia.
Stack: NestJS (hexagonal) + Prisma 7/Postgres + MinIO (signature storage); React web; Flutter mobile (offline-first). Deploy via Dokploy on a VPS.

- **Zones**: Urabá, Bajo Cauca. Montería = head office (outside zones, sees all → modeled as `LIDER_OPERATIVO` ∈ GLOBAL_ROLES).
- **Role hierarchy**: `SYSTEM_ADMIN > GERENCIA > TALENTO_HUMANO > LIDER_OPERATIVO > COORDINADOR > SUPERVISOR` → Operarios.
- **Attendance** (this change): immutable check-in/out records; operario supervised by SUPERVISOR; signature (biometric local on Flutter, backend-stored in MinIO) + GPS + timestamps (client + server).

---

## Scope of `asistencia`

The **Attendance Core MVP**. Six deliverables:

1. Prisma `Attendance` model (check-in + check-out + signature in one jornada record).
2. Fail-closed scope isolation (`SUPERVISOR` sees own operarios; `COORDINADOR` sees zone; global roles see all).
3. Check-in endpoint: POST /asistencia/check-in (supervisorId + zoneId from JWT scope, NOT body; idempotent clientRef).
4. Check-out endpoint: POST /asistencia/:id/check-out (immutable after completedAt; requires signature uploaded).
5. Signature upload/serve: POST /asistencia/:id/signature (multipart → MinIO), GET /asistencia/:id/signature (presigned GET ~300s TTL).
6. List + detail: GET /asistencia (scoped), GET /asistencia/:id (scoped).

**Out of scope (deferred to later changes)**:
- Overtime Novedad + Líder Operativo approval workflow
- Push / FCM notifications
- Offline sync / delta endpoints
- Excel bulk import
- Reports / dashboards
- Attendance correction / admin override (deliberately out — immutability is hard boundary)

---

## Key decisions

- **Single scoped repository** (`ScopedAttendanceRepository`) — all Attendance Prisma access (reads + writes) in one sanctioned file. No separate `PrismaAttendanceRepository`. Enforces no-raw-writes meta-guard.
- **Immutability**: app-layer guard (application throws before DB write when `completedAt != null`). No DB constraint for MVP. Backed by meta-guard raw-call scan (all writes go through ScopedAttendanceRepository).
- **Signature flow**: multipart upload to backend (backend mediates MinIO access). NOT presigned-direct-to-client. Deterministic key: `signatures/{supervisorId}/{attendanceId}.png`. Serve via presigned GET.
- **Idempotency via clientRef @unique**: duplicate `clientRef` returns existing record (HTTP 200). Different clientRef for same (operarioId, date) → 409 (AttendanceAlreadyExistsError). Protects against field-app retries on flaky connectivity.
- **Timezone**: date stored as String 'YYYY-MM-DD' (client-computed Colombia local, never server math). Server trusts client date for `@@unique([operarioId,date])`. Documented MVP limitation.
- **No biometric server-side**: supervisor identity from JWT (biometric unlock on Flutter device). Backend records supervisorId + server timestamp only. No biometric template/image reaches the server.
- **Fail-closed scope**: out-of-scope records return 404 (not 403). Does not leak operario existence to cross-supervisor/zone callers.

---

## Implementation (3 PR slices, all in working tree, not committed)

**PR-1 (foundation ~190 lines)**
- Prisma Attendance model + migration SQL (manually created; `migrate dev` blocked by dev DB state)
- SCOPE_MAPS['Attendance'] entry (zonePath + supervisorPath, denormalized zoneId)
- ScopedAttendanceRepository (reads via findManyScoped/findFirstScoped, writes via this.delegate inside sanctioned file)
- meta-guard implementedModels += 'Attendance' (atomic with SCOPE_MAPS + repo file)
- AttendanceRepositoryPort + Attendance domain entity
- Contracts asistencia.ts DTO skeleton + index export
- jest-global-setup update (FK-safe cleanup: Attendance before Assignments)
- **Gate**: meta-guard GREEN, contracts build PASS, typecheck clean

**PR-2 (core use-cases ~430 lines; exceeds 400 budget — orchestrator approved exception)**
- 6 domain error classes (AttendanceAlreadyExistsError, SignatureRequiredError, ImmutableAttendanceError, InvalidGpsError, OperarioNotInScopeError, AttendanceNotFoundError)
- CheckInAttendanceUseCase (GPS validation, idempotency via clientRef, scope from JWT, P2002 → 409)
- CheckOutAttendanceUseCase (signature required, immutability check, GPS validation, server timestamp)
- ListAttendanceUseCase + GetAttendanceUseCase (scoped)
- UploadSignatureUseCase + GetSignatureUrlUseCase (multipart, deterministic key, presigned GET ~300s)
- AttendanceController (error→HTTP mapping: 404/409/422/400 gates, auth scopes)
- AsistenciaModule DI (all providers REQUEST-scoped, LazyRequestScopeContextHolder pattern, StoragePort injected)
- app.module.ts += AsistenciaModule
- Integration tests (AT-01..AT-42, StoragePort MOCKED, no real MinIO)
- **Gate**: all 4 commands GREEN (202 unit, 112 int)

**PR-3 (signature I/O ~240 lines)**
- UploadSignatureUseCase detail (mime+size validation, deterministic key, DB update signatureKey)
- GetSignatureUrlUseCase detail (presigned GET, 300s TTL, null-key → 404)
- AttendanceController signature routes (FileInterceptor, multipart body)
- Full integration signature scenarios (AT-11..AT-17 upload, AT-13..AT-14 GET, check-out validation)
- Module complete with StorageModule wired
- **Gate**: full suite GREEN (202 unit + 112 int)

### Files created
- `backend/prisma/migrations/20260531102224_add_attendance/migration.sql`
- `backend/src/modules/asistencia/domain/attendance.entity.ts`
- `backend/src/modules/asistencia/domain/ports/attendance-repository.port.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/domain/asistencia.errors.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/application/check-in-attendance.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/application/check-out-attendance.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/application/list-attendance.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/application/get-attendance.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/application/upload-signature.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/application/get-signature-url.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/infrastructure/scoped-attendance.repository.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/interface/attendance.controller.ts` (+ `.spec.ts`)
- `backend/src/modules/asistencia/asistencia.module.ts`
- `backend/src/modules/asistencia/asistencia.int-spec.ts`
- `packages/contracts/src/shared/asistencia.ts`

### Files modified
- `backend/prisma/schema.prisma` (Attendance model + back-relations to Supervisor/Operario)
- `backend/src/modules/iam/domain/scope-filter.ts` (SCOPE_MAPS['Attendance'])
- `backend/src/modules/iam/infrastructure/scope-meta-guard.spec.ts` (implementedModels += 'Attendance')
- `backend/src/modules/iam/infrastructure/scoped-attendance.repository.ts` (created PR-1; full reads+writes)
- `backend/src/database/jest-global-setup.ts` (FK-safe cleanup order)
- `packages/contracts/src/index.ts` (export * from ./shared/asistencia)
- `backend/src/app.module.ts` (AsistenciaModule import)
- `backend/package.json` (@types/multer added to devDependencies)

---

## Test evidence

**Unit** (202 tests, 26 suites):
- error classes, port shape, use-case logic (GPS, idempotency, scope, immutability)
- controller error→HTTP mapping, permission gates
- All prior suites (auth, scope-isolation, device-mgmt, org-mgmt, auth-completeness) still GREEN (+45 unit tests vs baseline)

**Integration** (112 tests, 6 suites):
- 42 scenarios (AT-01..AT-42): check-in, signature, check-out, reads, unit-level use-cases, meta-guard, scope-filter fail-closed
- StoragePort MOCKED (no real MinIO)
- +31 integration tests vs baseline; all prior suites still GREEN

**Migration**:
- migration.sql FULL MATCH vs schema.prisma Attendance model (21 cols, types, nullability, indexes, FKs, back-relations)
- `prisma migrate status` = up to date, no drift
- Applied correctly to test DB via `migrate deploy` (after manual _prisma_migrations baseline one-time)

---

## Open WARNINGs (non-blocking)

1. **WARNING-1: Fresh-CI `migrate deploy` unproven**
   - Issue: Local test DB required manual `_prisma_migrations` baseline because it came from `db push` (no migration history). Tried ephemeral DB but futuragest Postgres role lacks CREATEDB.
   - Reasoning: Fresh CI environment starts EMPTY → `migrate deploy` applies baseline, then add_attendance → no P3005 drift. Manual baseline was ONLY for pre-populated test DB. Migration.sql never edited after apply (status = no drift).
   - Recommendation: CI will run on clean ephemeral DB with correct role privs (no residual risk). If CI fails CREATEDB, grant role: `ALTER ROLE futuragest CREATEDB;`
   - Status: ACCEPTED (LOW risk, migration SQL verified exact).

2. **WARNING-2: port.spec.ts type-only assertions (weak but legit)**
   - Type-only structural checks (typeof symbol, typeof function). Valid for port contracts.
   - Status: ACCEPTED (structural checks valid).

3. **WARNING-3: AT-04 idempotent check-in assertion too lenient — RESOLVED THIS SESSION**
   - Original: test accepted [200, 201] for idempotent clientRef. Spec OQ2 LOCKED 200 (resource exists, no new creation).
   - Root: Controller @HttpCode(CREATED), idempotent path should return 200.
   - Fix: Controller now @HttpCode(OK); idempotent path explicitly 200; fresh check-in 201. AT-04 tightened: expects exactly 200 on idempotent.
   - Status: RESOLVED (200 on idempotent, 201 on fresh, test enforces contract).

---

## Invariants verified

- INV-01 (Fail-closed scope): SUPERVISOR missing supervisorId → DENY_PREDICATE → zero rows ✓
- INV-02 (Body isolation): supervisorId/zoneId from JWT, not body ✓
- INV-03 (No biometric): zero biometric fields ✓
- INV-04 (Signature in MinIO only): signatureKey = string key; binary via StoragePort ✓
- INV-05 (Immutability): completedAt != null → ImmutableAttendanceError before write ✓
- INV-06 (Additive): all existing tests still PASS; no change to existing SCOPE_MAPS/endpoints/contracts ✓
- INV-07 (meta-guard atomicity): SCOPE_MAPS + ScopedAttendanceRepository + implementedModels in PR-1 ✓
- INV-08 (clientRef required): missing → 400 (ValidationPipe) ✓

---

## Engram topic keys (recovery pointers)

- `sdd/asistencia/{explore(#67), proposal(#68), spec(#69), design(#70), tasks(#71), apply-progress(#72), verify-report(#74), archive-report(#75)}`
- `sdd-init/futuragest-backend-frontend` (Strict TDD mode active)
- `infra/contracts-resolution` (contracts-dist gotcha)

---

## Next steps

1. Orchestrator creates 3 commits + PRs (or user manually commits per slice/work-unit).
2. `git push` to GitHub (no push performed in this session; user controls commit timing).
3. Change is CLOSED — no post-archive SDD work for asistencia.
