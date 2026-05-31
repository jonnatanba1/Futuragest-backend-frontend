# SDD State Backup — `org-structure`

> Local backup of SDD progress in case Engram is unavailable. Source of truth is Engram
> (project `futuragest-backend-frontend`); this file is a self-contained snapshot.
> Last updated: 2026-05-29. **Nothing is committed yet** — all work is in the working tree.

---

## Current status

- **Change**: `org-structure` (Block 1 — Management API over the existing org data model)
- **SDD phase reached**: `archive` **COMPLETE** — cycle closed (archive-report Engram obs#51)
- **Verify verdict**: **PASS WITH WARNINGS** (0 CRITICAL) → WARNING 1 (`--runInBand`) + SUGGESTION 1 (`@IsIn`) applied; WARNING 2 (cleanTestFixtures) deferred to a separate commit
- **Tests**: 148 unit + 73 integration = **221 passing, 0 failures**, `tsc --noEmit` clean
- **Mode**: Interactive · Artifact store: Engram · Delivery: ask-on-risk → 3 incremental slices

---

## Domain context (brief)

FuturaGest = workforce/attendance management for waste-collection (aseo) operations in Colombia.
Stack: NestJS (hexagonal) + Prisma 7/Postgres + MinIO; React web; Flutter mobile (offline-first). Deploy via Dokploy on a VPS.

- **Zones**: Urabá, Bajo Cauca. Montería = head office (outside zones, sees all → modeled as `LIDER_OPERATIVO` ∈ GLOBAL_ROLES).
- **Role hierarchy**: `SYSTEM_ADMIN > GERENCIA > TALENTO_HUMANO > LIDER_OPERATIVO > COORDINADOR > SUPERVISOR (Barrido/Recolección/Supernumerario)` → Operarios.
- **Core module (future)**: Asistencia — immutable check-in/out records with operario signature + GPS + supervisor biometric confirmation; overtime novelty → Líder Operativo approves biometrically.

---

## Scope of `org-structure`

The **data model already existed** in the foundation commit (Zone, Municipio, User.coordinatedZoneId `@unique`, Supervisor w/ zoneId+municipioId+SupervisorArea, Role enum, full scope-isolation). This change adds the missing **management API layer**. Four deliverables:

1. Role-scoped `Zone`/`Municipio` read endpoints (COORDINADOR → own zone; GLOBAL_ROLES → all; SUPERVISOR excluded).
2. Assign/reassign COORDINADOR to a zone (transactional clear-then-set for the `@unique`).
3. Provision management-role users (GERENCIA / TALENTO_HUMANO / LIDER_OPERATIVO).
4. Close the W3 gap → `ScopedMunicipioRepository`.

**Out of scope**: Zone/Municipio mutations; supervisor/operario management + bulk load; attendance; signatures/MinIO.

---

## Key decisions

- **Authz**: both the coordinador-assignment and management-provisioning endpoints are `@Roles(SYSTEM_ADMIN, TALENTO_HUMANO)`.
- **Privilege-escalation guard** (business logic in `ProvisionManagementUserUseCase`, not a decorator): nobody provisions a role above their own. `SYSTEM_ADMIN` → any; `TALENTO_HUMANO` → only TH/LIDER_OPERATIVO; **TH → GERENCIA = 403**. Actor role read from `ScopeContextHolder.current().role` (verified JWT), never from the body. Confirmed end-to-end by an integration test.
- **Coordinador scope refresh**: the `zoneId` JWT claim refreshes on **next login** only — no live token re-issue. Assignment use-case updates the DB only.
- **Zone existence check** uses `zoneRepo.findById` (scoped repo), NOT raw `prisma.zone.findUnique` → keeps the security meta-guard intact (the prisma-org sanction was reverted).
- **Signatures (future Asistencia)**: backend mediates MinIO (uploads server-side, serves via its own endpoint), NOT presigned-direct-to-client, NOT blobs in Postgres/container FS. Biometric fingerprint is NOT stored (local_auth only authenticates on-device).
- **MinIO on local Dokploy is provisional** → moving to a VPS with public domain; only config changes (MINIO_ENDPOINT, USE_SSL=true), no code.

---

## Implementation (3 slices, all in working tree, not committed)

**Slice 1 (WU0-3)** — domain errors, `OrgRepositoryPort`, contract DTOs, `ScopedZoneRepository`, `ScopedMunicipioRepository`, W3 flip in `scope-meta-guard.spec.ts`.

**Slice 2 (WU4-6)** — `AssignCoordinadorToZoneUseCase`, `ProvisionManagementUserUseCase` (+ escalation guard), `PrismaOrgRepository` ($transaction clear-then-set). Security correction: zone check via scoped repo, meta-guard sanction reverted.

**Slice 3 (WU7-8)** — `OrgController` + DTOs + `IamModule` wiring (all org providers REQUEST-scoped; `LazyRequestScopeContextHolder` resolves the request-scoped DI timing; `PasswordHasherPort` imported from AuthModule); `org-management.int-spec.ts` covering D1-D4 incl. the TH→GERENCIA 403 case.

### Files
- `backend/src/modules/iam/interface/org.controller.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/application/assign-coordinador-to-zone.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/application/provision-management-user.use-case.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/infrastructure/scoped-zone.repository.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/infrastructure/scoped-municipio.repository.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/infrastructure/prisma-org.repository.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/domain/org.errors.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/domain/ports/org-repository.port.ts` (+ `.spec.ts`)
- `backend/src/modules/iam/org-management.int-spec.ts`
- `packages/contracts/src/shared/org.ts` (+ index export)
- Modified: `iam.module.ts`, `scope-filter.ts` (Zone in SCOPE_MAPS), `scope-meta-guard.spec.ts` (W3), `jest-global-setup.ts` (cleanTestFixtures)
- `backend/scripts/check-minio.ts` (MinIO connectivity diagnostic — separate from this change)

---

## Open WARNINGs (non-blocking)

1. **Integration test parallelism** — Jest has no `maxWorkers`; int suites share `futuragest_test`. `@unique coordinatedZoneId` is a collision point (scope-isolation writes seeded zones; org-management D2 assigns the same). Narrow race, not reproduced locally. **Fix: add `--runInBand` to the `test:int` script.**
2. **`cleanTestFixtures()` in `jest-global-setup.ts`** — identifies seed users by email pattern (`admin@`, `supervisor-*`) → fragile; modifies shared test infra in this change. Self-heals today. **Recommend: own commit; later identify seeds by id/tag.**

Suggestions: `@IsIn([...])` on `ProvisionUserBody.role` instead of `@IsString()`; worker-teardown warning is cosmetic.

---

## Next steps

1. Decide on WARNING 1 (`--runInBand`) and WARNING 2 (commit hygiene).
2. Run `sdd-archive` to close the SDD cycle.
3. Commit (when user asks) — suggested per slice/work-unit.
4. `git push` from the previous session is still pending (no GitHub remote pushed yet).

---

## Engram topic keys (recovery pointers)

`sdd/org-structure/{explore, proposal, spec, design, tasks, apply-progress, verify-report}` ·
`domain/product-vision` · `iam/management-authz` · `auth/scope-claim-refresh` ·
`infra/minio-connection` · `sdd-init/futuragest-backend-frontend`
