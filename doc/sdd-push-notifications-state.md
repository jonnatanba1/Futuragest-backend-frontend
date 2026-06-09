# SDD State: push-notifications

**Phase**: Archive (complete)  
**Status**: CLOSED — ready for production  
**Date**: 2026-05-31  
**Verification Verdict**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 1 SUGGESTION)

---

## Summary

Push notification seam fully implemented and integrated:
- **NotificationPort** + adapters (NoOp default, FCM skeleton)
- **RecipientResolver** (LIDER_OPERATIVO + configurable SYSTEM_ADMIN)
- **DeviceSession schema** extension (pushToken/pushPlatform columns)
- **Token registration endpoint** (PUT /auth/devices/me/push-token)
- **Fire-and-forget integration** into CreateNovedadUseCase
- **Strict TDD verification**: 384 unit / 221 integration tests passing

All gates green: contracts build, typecheck clean, migration deployed, firebase-admin NOT a dependency, fire-and-forget isolation proven.

---

## IMPORTANT — Flutter Team API Note

### Token Registration Route (CORRECTED)

**Endpoint**: `PUT /auth/devices/me/push-token` (NOT `POST /auth/push-token`)

Route resolves the device from JWT claims (`userId` + `deviceId`), NOT from request body.

```
PUT /auth/devices/me/push-token
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "pushToken": "fcm_token_abc123...",
  "pushPlatform": "android"  // optional; can be "ios", "web", or omitted
}
```

**Response**:
- `204 No Content` — success
- `400 Bad Request` — missing `pushToken` field
- `401 Unauthorized` — no JWT, unauthenticated, or session revoked

The `pushPlatform` field is optional and stored for future APNs/platform-specific routing.

### To Activate Real FCM (Production)

1. Set `FIREBASE_ENABLED=true` in the environment
2. Provide Firebase service-account JSON credentials (backend/secrets/firebase-service-account.json, not committed)
3. Add `firebase-admin` to backend dependencies: `pnpm add firebase-admin`
4. The FcmNotificationAdapter's dynamic-import send path will light up automatically
5. No backend code changes required — NotificationsModule selects FcmAdapter at runtime

---

## Implementation Details

### Architecture

**Port/Adapter Seam** (hexagonal pattern, mirrors StorageModule):
- `NotificationPort` — domain interface (pure, no Firebase imports)
- `NoOpNotificationAdapter` — default (always succeeds, logs intent)
- `FcmNotificationAdapter` — import-safe skeleton (dynamic `firebase-admin` import inside send path only)
- `RecipientResolver` — sanctioned system-level DB query (all active LIDER_OPERATIVO tokens)
- `NotificationsModule` — config-driven adapter selection (FIREBASE_ENABLED env var)

**No Circular Dependencies**:
- NovedadesModule → NotificationsModule → PrismaModule ✓
- NotificationsModule never imports novedades or auth

**Fire-and-Forget Isolation** (DEFINING INVARIANT):
- Notification call wrapped in try/catch inside CreateNovedadUseCase.execute()
- Fires AFTER novedad persisted and committed
- Never blocks response or rolls back transaction
- Failures logged but never propagated to caller
- Only fires when `created === true` (skipped on idempotent replays)

### Schema

`DeviceSession` model gains two nullable columns:
```prisma
pushToken    String?   // FCM registration token
pushPlatform String?   // "android" | "ios" | "web"
```

Migration: `prisma/migrations/20260531220000_add_device_push_token/migration.sql`

### Recipients

Push notifications sent to all active LIDER_OPERATIVO users with registered tokens:
- User role = `LIDER_OPERATIVO`
- DeviceSession.revokedAt = null
- DeviceSession.pushToken ≠ null

Optional: include SYSTEM_ADMIN via `NOTIFY_SYSTEM_ADMIN=true` (default off)

System-level query (no zone filtering; LIDER_OPERATIVO is globally scoped)

### Contracts

**DTO**: `PushTokenRequest` (packages/contracts/src/shared/push-token.ts)
```typescript
export interface PushTokenRequest {
  pushToken: string;
  pushPlatform?: string;
}
```

Exported from `@futuragest/contracts` package.

---

## Verification Gates (All Green)

| Gate | Result | Notes |
|------|--------|-------|
| Contracts build | ✅ PASS | PushTokenRequest exports OK |
| Typecheck | ✅ PASS | No TypeScript errors |
| Unit tests | ✅ PASS (384/51) | 384 passing, 51 skipped; NoOp + FCM + resolvers GREEN |
| Integration tests | ✅ PASS (221/9) | 221 passing, 9 skipped; fire-and-forget isolation verified |
| Migration drift | ✅ PASS | 20260531220000_add_device_push_token sorts correctly, no conflict |
| Firebase-admin dep | ✅ PASS | NOT in package.json (FcmAdapter uses dynamic import) |
| Fire-and-forget proof | ✅ PASS | PN-12 integration test: novedad 201 even when adapter rejects |

---

## Warnings (Non-Critical)

1. **Route naming discrepancy** (doc level only)
   - Earlier spec/design text mentioned `POST /auth/push-token`
   - Implementation deployed as `PUT /auth/devices/me/push-token`
   - Implementation is correct and tested; documentation needs sync

2. **Migration timestamp hand-authored**
   - `20260531220000` chosen to sort after `20260531210000_add_reference_updatedat`
   - Fragile naming convention; future migrations must respect sort order
   - Acceptable for MVP

---

## Suggestion (Non-Critical)

**RegisterPushTokenUseCase lacks dedicated unit spec**
- Covered transitively by integration tests (PN-19..PN-22)
- Low priority; integration coverage is sufficient for MVP

---

## Artifacts (Engram Only)

Specifications and design live in persistent engram memory (no file-based openspec):

| Artifact | Observation ID | Content |
|----------|---|---------|
| Exploration | #110 | Baseline state, key decisions, reuse map, gotchas |
| Proposal | #111 | Intent, scope LOCKED, fire-and-forget invariant, size estimate |
| Spec | #113 | 36 numbered scenarios (PN-1..PN-36), HTTP codes, all requirements locked |
| Design | #112 | Architecture grounded in real source, file change set, FINAL |
| Tasks | #114 | 25 work units (T-00..T-25) with RED/GREEN gates, coverage map to PN |
| Verify Report | #119 | PASS WITH WARNINGS verdict, gates green, fire-and-forget proven |
| Archive Report | (current) | Traceability, API note, next steps |

---

## Non-Blocking Items (Deferred)

- Real firebase-admin SDK send call (skeleton in FcmAdapter; activate with FIREBASE_ENABLED + creds)
- iOS APNs routing (platform field stored; no platform-specific send logic in MVP)
- Notification history/audit table
- Read receipts / delivery tracking
- Future triggers (approval, rejection, assignment changes)

---

## Change is Ready for Production

✓ Implementation complete and tested under strict TDD  
✓ All verification gates green (0 CRITICAL issues)  
✓ Fire-and-forget isolation proven real (PN-12 integration test)  
✓ Backward compatible (additive schema, no existing endpoint changes)  
✓ Configuration-gated (NoOp default; real FCM activates on explicit env + creds)  
✓ No external dependencies added (firebase-admin optional via dynamic import)

**Next action**: Commit, review, merge to main.
