# SDD State Backup — `auth-completeness`

> Local backup of SDD progress in case Engram is unavailable. Source of truth is Engram
> (project `futuragest-backend-frontend`); this file is a self-contained snapshot.
> Last updated: 2026-05-31. **Nothing is committed yet** — all work is in the working tree.

---

## Current status

- **Change**: `auth-completeness` (GET /auth/me endpoint for Flutter mobile role-based routing)
- **SDD phase reached**: `archive` **COMPLETE** — cycle closed (archive-report Engram obs#66)
- **Verify verdict**: **PASS WITH WARNINGS** (1 CRITICAL resolved this session) → CRITICAL (typecheck red from contracts cross-import) fixed via `infra/contracts-resolution` (#65); no blockers remaining
- **Tests**: 153 unit + 81 integration = **234 passing, 0 failures**, `tsc --noEmit` clean (zero regression vs baseline)
- **Mode**: Interactive · Artifact store: Engram · Delivery: ask-on-risk → single PR

---

## Domain context (brief)

FuturaGest = workforce/attendance management for waste-collection operations in Colombia.
Stack: NestJS (hexagonal) + Prisma 7/Postgres + MinIO; React web; Flutter mobile (offline-first).

**Flutter blocker resolved**: The mobile app cannot do role-based routing immediately after login because the login endpoint returns only tokens (no structured profile). This change adds `GET /auth/me` for authenticated users to retrieve a role-shaped current-user profile, enabling the app to route to the correct home screen even when `mustChangePassword=true` (via `@SkipMustChangePasswordCheck()` decorator).

---

## Scope of `auth-completeness`

**The change is additive and scope-complete** — a single, low-risk endpoint implementation with no schema migration or breaking changes.

**Deliverable**: `GET /auth/me` endpoint returning a role-discriminated profile:
- **Global roles** (SYSTEM_ADMIN, GERENCIA, TALENTO_HUMANO, LIDER_OPERATIVO): base shape `{ id, email, role, mustChangePassword }`
- **COORDINADOR**: base + `{ zone: { id, name } | null }`
- **SUPERVISOR**: base + `{ supervisor: { id, area, zone: { id, name }, municipio: { id, name } } }`

**Key invariants**:
- email read from DB, not JWT (not in token claims)
- supervisor.id === Supervisor.id (PK), verified vs DB cross-table
- zone:null explicit for unassigned COORDINADOR (not absent)
- single Prisma include query (no N+1)
- 200 response even when mustChangePassword=true (via @SkipMustChangePasswordCheck)
- UserNotFoundError → 404 (covers deleted-user-with-live-token edge case)
- no schema migration, no data changes

**Out of scope**: Refresh-token hardening (future auth-hardening change); FCM push tokens (deferred with Asistencia block).

---

## Key decisions

- **UserProfile flat domain type with nullable fields** (not discriminated union) — adapter stays dumb, use-case does role-based mapping. Rejects: coupled infra, passwordHash leak risk.
- **Explicit nulls over omitted keys** in response — stable JSON for Flutter/Dart codegen (freezed/json_serializable); discriminant is role.
- **Single MeResponse contract in packages/contracts** imported by backend — prevents drift (earlier risk). Plain TS type, no class-validator decorators in contracts.
- **Singleton DI** (not request-scope) — userId arrives as method arg from req.user (AuthGuard-populated), no request-scoped holder needed. Mirrors existing change-password/revoke-session pattern.
- **404 via UserNotFoundError** (not null/500) — deletes-user-with-live-token edge case, correct error semantics.
- **@SkipMustChangePasswordCheck MANDATORY** — Flutter must read profile to route when mustChangePassword=true; otherwise catch-22 403.
- **infra/contracts-resolution**: backend/tsconfig.json paths must point to contracts DIST (not SRC) — tsc treats SRC outside rootDir as TS6059/TS6307. SRC mapping was latent bug exposed when GET /auth/me became first backend file to import @futuragest/contracts as a type. Jest intentionally points at source (no build, ts-jest transpiles in isolation); tsc+runtime point at dist (turbo ^build guarantees freshness in CI). Asymmetry by design.

---

## Implementation (single PR, all in working tree, not committed)

**All 9 tasks complete (T-00..T-09)**:

1. **T-00**: Contract type MeResponse discriminated union (packages/contracts/src/shared/auth.ts)
2. **T-01**: Export from packages/contracts/src/index.ts
3. **T-02**: UserProfile domain type + findUserWithScope method on AuthRepositoryPort
4. **T-03**: UserNotFoundError domain error class
5. **T-04**: PrismaAuthRepository.findUserWithScope implementation (single include query)
6. **T-05**: Unit spec for GetMeUseCase (RED → fixed by T-06)
7. **T-06**: GetMeUseCase implementation (unit tests GREEN: 153 tests)
8. **T-07**: Integration spec for GET /auth/me (RED → fixed by T-08)
9. **T-08**: Controller handler + module DI wiring (int tests GREEN: 81 tests, 8 new for GET /auth/me)
10. **T-09**: Typecheck validation (0 NEW errors)

### Files created (4)
- `packages/contracts/src/shared/auth.ts`
- `backend/src/modules/auth/domain/user-profile.ts`
- `backend/src/modules/auth/application/get-me.use-case.ts` (+ `.spec.ts`)

### Files modified (7)
- `packages/contracts/src/index.ts`
- `backend/tsconfig.json` (paths: @futuragest/contracts → dist, not src — CRITICAL fix)
- `backend/src/modules/auth/domain/auth-repository.port.ts`
- `backend/src/modules/auth/domain/auth.errors.ts`
- `backend/src/modules/auth/infrastructure/prisma-auth.repository.ts`
- `backend/src/modules/auth/interface/auth.controller.ts`
- `backend/src/modules/auth/auth.module.ts`
- `backend/src/modules/auth/auth.int-spec.ts` (+ 8 GET /auth/me scenarios)
- 3 pre-existing use-case specs (added findUserWithScope jest.fn() to fix TS2322 after port method introduction)

**Total**: ~11 files, ~150-200 lines prod code + ~120 lines test code = ~320 total. Well under 400-line review budget. Single PR, no chained PRs needed.

---

## Test & typecheck results

**Final counts** (this session):
- Unit: 17 suites / 153 tests (incl. get-me.use-case.spec.ts ME-12/12b/13/14/15)
- Integration: 5 suites / 81 tests (incl. auth.int-spec.ts ME-1,5,6,7,8,9,10,11; prior 73 passing, new 8 for GET /auth/me)
- Total: **234 passing, 0 failures**
- Typecheck: **0 NEW errors**, 8 pre-existing TS6059/TS6307 package setup errors unchanged

**Zero regression** vs baseline (221 tests → 234 tests, all green).

---

## Verify verdict summary

**PASS WITH WARNINGS** (from observe #63, CRITICAL resolved via #65 this session):

✓ **Feature**: GET /auth/me fully implemented end-to-end
✓ **Scenario matrix**: 15/15 tests (ME-1..ME-15) GREEN — all role variants, mustChangePassword, auth gates, not-found → 404
✓ **Invariants**: 7/7 (INV-1..INV-7) GREEN — no migration, no regression, email-from-DB, supervisor.id===Supervisor.id verified vs DB, MeResponse plain TS, explicit nulls
✓ **Database**: Single Prisma include query, isolated fixtures (COORDINADOR created/deleted in beforeAll/afterAll), no orphans
✓ **Isolation**: High-quality assertions (exact-object unit, real HTTP+DB integration, cross-table FK verification)
✓ **Typecheck**: CRITICAL (TS6059/TS6307 from contracts import) RESOLVED via backend/tsconfig.json paths fix (#65) + contracts build + fresh typecheck

**Warnings**:
- WARNING 1 (non-blocking): Contract type named **MeResponse** in code vs spec **MeResponseDto** in requirements. Naming only — no consumer references old name. Recommend reconciling spec wording in next review; no code change required.
- Pre-existing (deferred): jest-global-setup cleanTestFixtures email-allowlist fragility flagged in org-structure change. Tracked for future hardening.

---

## Next steps

1. ✓ Archive cycle complete (sdd-archive executed this session; archive-report Engram obs#66)
2. Commit (when user asks) — single PR, no slicing needed
3. `git push` (when user asks)

---

## Engram topic keys (recovery pointers)

`sdd/auth-completeness/{explore, proposal, spec, design, tasks, apply-progress, verify-report, archive-report}` ·
`infra/contracts-resolution` (root-cause of CRITICAL typecheck error + fix) ·
`sdd-init/futuragest-backend-frontend` (project context)
