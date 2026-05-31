# SDD Change: sync-idempotency — ARCHIVED

**Status**: COMPLETE — Archived 2026-05-31 21:30 UTC  
**Verdict**: PASS WITH WARNINGS (0 CRITICAL, 2 non-blocking WARNINGs, 3 SUGGESTIONs)  
**Phase**: archive complete

---

## Summary

First of 3 sub-changes split from `sync-offline`. Implements idempotent replay for offline-createable mutations:
- **Novedad clientRef idempotency**: add `clientRef String? @unique` to Novedad. Replay with same clientRef → 200 existing record, no new row.
- **Check-out checkOutClientRef idempotency**: add `checkOutClientRef String?` to Attendance. Replay with same token on completed record → 200, no DB write (immutability preserved).
- **Check-out by check-in clientRef**: new route `POST /asistencia/by-client-ref/:clientRef/check-out` to locate attendance by check-IN clientRef, then proceed with idempotent check-out logic.
- **Structured 409 conflicts**: ConflictResponseDto for check-in duplicate operarioId+date and check-out real double-checkout, carrying the conflicting record for client reconciliation.

---

## Artifacts & Traceability

| Artifact | Observation ID | Status |
|----------|----------------|--------|
| Proposal | #96 | decision |
| Spec | #99 | architecture |
| Design | #98 | architecture |
| Tasks | #100 | architecture |
| Apply Progress | #101 | architecture |
| Verify Report | #102 (archive report) | PASS WITH WARNINGS |
| Parent Explore | #97 (sdd/sync-offline/explore) | — |

All observations persisted in engram project `futuragest-backend-frontend`.

---

## Implementation Details

**Files Changed** (~300–380 LOC, single PR):
- Migration: `backend/prisma/migrations/20260531200000_add_sync_idempotency/`
- Schema: `backend/prisma/schema.prisma`
- Use-cases: `asistencia/application/check-out-attendance.use-case.ts`; `novedades/application/create-novedad.use-case.ts`
- Repos: `iam/infrastructure/scoped-attendance.repository.ts`; `iam/infrastructure/scoped-novedad.repository.ts`
- Ports: `asistencia/domain/ports/attendance-repository.port.ts`; `novedades/domain/ports/novedad-repository.port.ts`
- Controllers: `asistencia/interface/attendance.controller.ts`; `novedades/interface/novedad.controller.ts`
- Errors: `asistencia/domain/attendance.errors.ts`
- Contracts: `packages/contracts/src/shared/asistencia.ts`; `packages/contracts/src/shared/novedad.ts`
- Tests: 27 new scenarios (SI-01..SI-31), all green

**Test Results**:
- Unit: 362 PASS (+24 over baseline)
- Integration: 199 PASS (+19 over baseline)
- Typecheck: PASS
- Contracts build: PASS
- Migration drift: PASS (no drift)
- Meta-guard: PASS (no regression)

---

## Key Design Decisions

1. **checkOutClientRef non-unique**: Per-record token comparison (same value may exist across multiple attendances by coincidence). Safe and symmetric with check-in pattern.
2. **Explicit by-clientRef route**: Separate POST endpoint; reuses existing `findByClientRef` on attendance; keeps id route untouched (zero risk to online clients).
3. **Enriched domain errors**: AttendanceAlreadyExistsError and ImmutableAttendanceError carry the conflicting record; mapped to structured ConflictResponseDto in each controller.
4. **Scope-enforced repos**: All new `findByClientRef` / `findByCheckOutClientRef` access via sanctioned scoped repos; no raw Prisma outside those files.

---

## Verification Warnings & Suggestions

**Non-Blocking Warnings**:
1. Novedad clientRef global uniqueness: cross-supervisor UUID reuse (astronomically unlikely) would hit DB constraint instead of idempotent 200. Fail-safe, document only.
2. Check-in conflict 409 returns conflicting record: verified same-scope (requester owns it); no cross-scope data leak.

**Suggestions** (for future work):
1. Add unit spy asserting idempotent replay does NOT call repo.update (currently proven via integration).
2. Document ConflictResponseDto.completedAt null case (check-in conflict with not-yet-completed attendance).
3. Consider per-supervisor partial unique for novedad clientRef if multi-tenant reuse becomes real.

---

## Backward Compatibility

✓ Fully backward compatible:
- Clients without `clientRef` / `checkOutClientRef` continue to work (fields optional).
- Existing online check-out and novedad-create endpoints unchanged modulo new optional fields.
- New by-clientRef route is additive (no URL collision with id route).
- All existing tests continue to pass.

---

## Next Steps

This change is closed. Recommended next work: `sync-delta-pull` (independent sibling, pull-side delta with `updatedAt` cursors).

---

**Engram project**: `futuragest-backend-frontend`  
**Archive report observation**: #102 (sdd/sync-idempotency/archive-report)
