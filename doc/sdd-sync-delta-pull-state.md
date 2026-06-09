# SDD Change: sync-delta-pull — ARCHIVED

**Status**: COMPLETE — Archived 2026-05-31 22:30 UTC  
**Verdict**: PASS (0 CRITICAL, 0 WARNING, 2 non-blocking SUGGESTIONs)  
**Phase**: archive complete

---

## Summary

Second of 2 sub-changes split from `sync-offline` (sibling: `sync-idempotency`, ARCHIVED). Implements incremental down-sync for the Flutter app to pull only changed records since a cursor timestamp, enabling efficient offline sync on poor connectivity:
- **updatedAt columns** on Operario, Zone, Municipio (Prisma `@updatedAt`); Attendance and Novedad already have these.
- **Delta filter `?since=<ISO8601>`** on GET /iam/operarios, GET /asistencia, GET /novedades. Returns rows with `updatedAt ≥ since` within scope. Invalid ISO → 400. Missing → full list (backward compatible).
- **Tombstone inclusion** for Operario: when `?since=` present, deactivated operarios appear in delta (client reconciles deactivations).
- **ClientRef recovery `?clientRef=<ref>`** on GET /asistencia: locates attendance by check-in clientRef; returns 200 [record] or 200 [] (scope-enforced, no 404). Reuses existing `findByClientRef`.
- **Inclusive cursor semantics**: `updatedAt ≥ since` (gte, not gt) — never misses boundary-millisecond edits.

---

## Artifacts & Traceability

| Artifact | Observation ID | Status |
|----------|----------------|--------|
| Proposal | #104 | decision |
| Spec | #106 | architecture |
| Design | #105 | architecture |
| Tasks | #107 | architecture |
| Apply Progress | #108 | architecture |
| Verify Report | (user-reported PASS) | PASS (0 CRITICAL, 0 WARNING, 2 SUGGESTIONs) |
| Archive Report | #109 | ARCHIVED |
| Parent Explore | #97 (sdd/sync-offline/explore) | — |

All observations persisted in engram project `futuragest-backend-frontend`.

---

## Implementation Details

**Files Changed** (~270–340 LOC, single PR):
- Migration: `backend/prisma/migrations/20260531210000_add_reference_updatedat/migration.sql`
- Schema: `backend/prisma/schema.prisma` (+updatedAt Operario/Zone/Municipio; +@@index([updatedAt]) Operario/Attendance/Novedad)
- Controllers: `iam/interface/iam.controller.ts` (?since= delta + tombstone bypass); `asistencia/interface/attendance.controller.ts` (?since= + ?clientRef=); `novedades/interface/novedad.controller.ts` (?since=)
- Use-cases: `asistencia/application/list-attendance.use-case.ts` (execute(since?: Date)); `novedades/application/list-novedades.use-case.ts` (execute(since?: Date))
- Repos: `iam/infrastructure/scoped-attendance.repository.ts` (findMany(since?)); `iam/infrastructure/scoped-novedad.repository.ts` (delta filtering)
- Ports: `asistencia/domain/ports/attendance-repository.port.ts` (findMany(since?)); `novedades/domain/ports/novedad-repository.port.ts` (findManyScoped delta)
- Contracts: `packages/contracts/src/shared/operario.ts` (+updatedAt); `packages/contracts/src/index.ts` (exports)
- Tests: 24 new integration scenarios (SD-01..SD-24) in sync-delta-pull.int-spec.ts, all green

**Test Results**:
- Unit: 368 PASS (+6 over baseline 362)
- Integration: 221 PASS (+22 over baseline 199)
- Typecheck: PASS (zero errors)
- Contracts build: PASS
- Migration drift: PASS (no drift, single migration, no orphans/duplicates)
- Meta-guard: PASS (no regression, no new scoped models)
- Scope enforcement: PASS (all delta queries through sanctioned scoped repos)

---

## Key Design Decisions

1. **Backfill updatedAt with DB DEFAULT CURRENT_TIMESTAMP**: Existing rows backfilled in-place during ALTER TABLE; Prisma schema uses @default(now()) @updatedAt to match (zero drift). First post-migration delta returns all rows (documented consequence — Flutter team aware).
2. **Inclusive cursor (gte)**: Boundary-millisecond edits never missed; client dedupes by id (cheap, deterministic).
3. **Tombstone bypass on delta**: When `?since=` present, deactivatedAt:null filter is entirely ABSENT — no parallel deactivatedAt clause. Clean delegation to controller for mode selection.
4. **ClientRef response shape**: 200 [record] or 200 [] (list shape) rather than 404. Consistent with list endpoint semantics; scope-enforced (cross-tenant returns []). Flutter app checks `array.length > 0`.
5. **Zone/Municipio columns without endpoints**: Added now for future-proofing; endpoints deferred to Change 3. Rationale: columns are cheap; separate endpoint change stays focused.
6. **No new scoped models**: All filtering rides existing sanctioned scoped repos via findManyScoped (merges {updatedAt:{gte}} into args.where then applies scopeWhere). Zero SCOPE_MAPS changes, zero meta-guard changes.

---

## Verification Findings

**Verdict**: PASS

**Critical Issues**: 0

**Warnings**: 0

**Suggestions** (non-blocking, for future enhancement):
1. **Zone/Municipio delta endpoints**: Proposal D5 justifies deferring endpoints to Change 3. Columns added now unblock future work. No blocker.
2. **clientRef + since mutual exclusivity**: When both present, clientRef wins silently. Recommend documenting in API docs or hardening with 400 validation (future enhancement).

**Gates** (all green):
- Contracts build OK ✓
- Typecheck clean ✓
- Unit 368 PASS / 0 failures ✓
- Integration 221 PASS / 0 failures ✓
- 6 migrations (no dup/orphan/drift) ✓
- Zero .bak files ✓
- Scope-enforced delta ✓
- Tombstone-only-in-delta ✓

---

## Backward Compatibility

✓ Fully backward compatible:
- All three endpoints without `?since=` / `?clientRef=` return identical pre-change behavior.
- Query parameters optional with backward-compatible defaults.
- No response field removed or made required.
- Existing tests continue to pass (baseline tests unmodified, new delta tests additive).
- Pre-change behavior (deactivatedAt:null filter, full scoped lists) unchanged when delta params absent.

---

## Next Steps

This change is closed. The two-change sync MVP (sync-idempotency + sync-delta-pull) is COMPLETE and ARCHIVED.

Recommended future work (out of scope for this change):
- **Change 3 (sync-batch)**: Aggregate endpoint for efficient multi-entity sync (if needed).
- **Zone/Municipio delta endpoints**: Wire up GET /iam/zones?since= and GET /iam/municipios?since= (columns ready; design deferred).
- **clientRef validation hardening**: Reject 400 if both clientRef and since present, or document silent clientRef precedence.

---

**Engram project**: `futuragest-backend-frontend`  
**Archive report observation**: #109 (sdd/sync-delta-pull/archive-report)
