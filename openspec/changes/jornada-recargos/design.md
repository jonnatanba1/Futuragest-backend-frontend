# Design: Jornada, Horas Extras, Recargos y Compensatorios

## Technical Approach

Enhance the existing hexagonal `JornadaModule`. The `TimeClassificationEngine` (already pure, minute-iterating) gets schedule-window awareness + lunch-skip. `JornadaPolicy` gains `operarioId`, `almuerzoInicio/Fin`, `toleranciaMin`. A new scheduler auto-completes `Attendance` when the virtual check-out timestamp arrives. All risky paths gated behind feature flags defaulting `false`.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| **Engine granularity** | Minute-by-minute vs pre-computed blocks | Minute = natural midnight/Franja crossing, no special-casing, simple to test; block = fewer loop iterations | **Minute-by-minute**. Simplicity trumps micro-optimization for 8-12h shifts (~480-720 iterations). |
| **Lunch skip logic** | Skip entire 30-min window vs skip only within schedule | Window-skip = correct for all shift shapes; schedule-bounded = breaks for midnight-crossing shifts | **Skip entire window** unconditionally. The 30 min are never work time regardless of when they fall. |
| **JornadaPolicy resolution** | OperarioId → zoneId → global with effective dating | 3-level hierarchy covers all current needs; adding a 4th level later requires only a nullable column + case in resolver | **OperarioId → zoneId → global**. Exclusive: exactly one of operarioId/zoneId non-null (or both null for global). |
| **Virtual check-out trigger** | Cron scheduler vs event-driven (delayed message) | Cron = simple, idempotent, batch-friendly; event-driven = sub-second precision but needs infra | **Cron scheduler** polling `completedAt IS NULL` + `checkOutVirtual <= now`. Idempotent via guard clause. Precision of ~1 minute is acceptable. |
| **Late-arrival novedad idempotency** | Partial unique index vs application check-then-insert | DB unique index = zero race conditions, no distributed lock; app check = simpler but racy under concurrency | **Partial unique index** `WHERE "tipoNovedad" = 'LLEGADA_TARDE' AND "autoGenerada" = true`. |
| **Composite surcharge rates** | Precompute + store all combinations vs runtime composition | Runtime = zero combinatorial explosion, automatic adjustment when base rate changes; precompute = faster lookup | **Runtime composition** (e.g. `dominical+nocturno = RECARGO_DOMINICAL_FESTIVO + RECARGO_NOCTURNO`). Only 4 base categories stored. |
| **Flutter route gating** | Role-based navigation tree vs conditional UI elements | Separate nav trees = simpler per-role code, no leaking; conditional = single codebase but complex | **Role-based navigation tree**. Supervisor sees check-in + overtime request; Líder/Coordinador sees approval queue + push notifications. |

## Data Flow (Check-in → Classification)

```
Supervisor Flutter          Backend                        Scheduler (cron)
    │                          │                                │
    │ POST /check-in           │                                │
    │ (foto+huella+GPS)        │                                │
    ├─────────────────────────►│                                │
    │                          │ create Attendance              │
    │                          │ fire-and-forget:               │
    │                          │  LateArrivalNovedadPort        │
    │                          │   → resolvePolicy(operario)    │
    │                          │   → checkIn > inicio+tol?      │
    │                          │   → upsert LLEGADA_TARDE       │
    │  201 Created             │                                │
    │◄─────────────────────────┤                                │
    │                          │                                │
    │    ... Supervisor can request overtime ...                │
    │ POST /novedades          │                                │
    ├─────────────────────────►│ create Novedad PENDING         │
    │                          │                                │
    │    ... Líder approves (Flutter+huella) ...                │
    │ PATCH /novedades/:id     │                                │
    ├─────────────────────────►│ status → APPROVED              │
    │                          │                                │
    │                          │         ┌─── cron tick ────────┤
    │                          │         │  WHERE completedAt   │
    │                          │         │    IS NULL           │
    │                          │         │  AND checkOutVirtual │
    │                          │         │    <= now()          │
    │                          │         │                      │
    │                          │         │ ClassifyAttendance   │
    │                          │         │  resolvePolicy(3-lvl)│
    │                          │         │  resolveHolidays     │
    │                          │         │  computeCheckoutVirt │
    │                          │         │  TCE.classifyShift() │
    │                          │         │  upsert Breakdown    │
    │                          │         │  set completedAt     │
    │                          │         │  gen CompensatoryRest│
    │                          │         └──────────────────────┤
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Add `operarioId`, `almuerzoInicio`, `almuerzoFin`, `toleranciaMin` to JornadaPolicy; add `TipoNovedad` enum + `tipoNovedad`, `minutosTarde`, `autoGenerada` to Novedad; change JornadaPolicy `@@unique([operarioId, zoneId, vigenteDesde])` |
| `domain/time-classification-engine.ts` | Refactor | Signature: add `horaInicio`, `horaFin`, `almuerzoInicio`, `almuerzoFin`, `diasLaborales`; add lunch-skip step; add schedule-window ordinary/extra logic |
| `domain/ports/jornada-policy-repository.port.ts` | Modify | `findLatest` → `resolvePolicy(operarioId, zoneId, date)` with 3-level fallback |
| `application/classify-attendance.use-case.ts` | Modify | Accept `operarioId`; pass schedule window to engine; compute `esDiaLaboral` from `diasLaborales` |
| `application/resolve-policy.use-case.ts` | Create | Orchestrates 3-level resolution: operario→zona→global |
| `infrastructure/virtual-checkout.scheduler.ts` | Create | Cron job: polls pending attendances, sets `completedAt`, triggers classification |
| `domain/ports/late-arrival-novedad.port.ts` | Create | Interface for async late-arrival check |
| `application/late-arrival.service.ts` | Create | Compares checkIn vs resolved policy's `horaInicio + toleranciaMin` |
| `interface/late-arrival-novedad.controller.ts` | Create | (or integrate into existing check-in pipeline) fire-and-forget call |
| `jornada.module.ts` | Modify | Register new providers, import scheduler module if needed |

## Key Interfaces

```typescript
// Refactored engine input — schedule-aware
interface ShiftClassificationInput {
  checkIn: Date;                // UTC-5 adjusted
  checkOut: Date;               // UTC-5 adjusted
  schedule: {
    horaInicio: string;         // "06:00"
    horaFin: string;            // "14:00"
    horasDiarias: Decimal;      // 7.50 (net after lunch)
    diasLaborales: number[];    // [1,2,3,4,5]
    almuerzoInicio: string;     // resolved: explicit or auto-midpoint
    almuerzoFin: string;        // resolved
  };
  holidays: Set<string>;        // "YYYY-MM-DD"
}

// 3-level policy resolution port
interface JornadaPolicyRepositoryPort {
  resolvePolicy(operarioId: string, zoneId: string, date: Date): Promise<JornadaPolicy>;
  // Falls back: operario→zona→global. Throws NoPolicyForDateError if none.
}

// Late arrival port — fire-and-forget
interface LateArrivalNovedadPort {
  checkAndCreate(attendanceId: string): Promise<void>;
}
```

## Testing Strategy

| Layer | What | Count |
|-------|------|-------|
| Unit — TCE v2 | 12 core scenarios + 5 lunch scenarios + 4 scope resolution | 21 |
| Unit — HolidayCalculator | 18 holidays/2026, Easter date, Emiliani Monday rule | 3 |
| Unit — SurchargeResolver | Effective-date resolution, composite runtime calc | 4 |
| Unit — CompensatoryRest | Occasional (≤2) vs Habitual (≥3), reclassification | 3 |
| Unit — LateArrival | Within tolerance, at edge, outside, idempotent, early arrival | 5 |
| Integration | Full pipeline: check-in → late arrival → overtime pre-auth → virtual checkout → classification → breakdown persisted | 2 |
| Integration | 3-level policy resolution with effective dating | 3 |

## Migration / Rollout

1. Prisma migration: all new fields nullable with defaults → **zero-downtime**
2. Deploy code with all feature flags `false` → **zero impact**
3. Seed: surcharge rates (80/90/100% dominical), global policy (6:00-14:00, lunch auto), 2026 holidays
4. Enable `CHECK_OUT_VIRTUAL_ENABLED` → virtual checkout starts
5. Enable `ATTENDANCE_CLASSIFICATION_ENABLED` → new attendances classified
6. Enable `LATE_ARRIVAL_NOVEDAD_ENABLED` → auto late-arrival generation
7. Enable `COMPENSATORY_REST_ENABLED` + `PER_OPERARIO_POLICY_ENABLED`
8. Rollback: disable any flag → instant. Migrations are additive only.

## Open Questions

- [ ] Scheduler cron interval: 1 min (acceptable precision vs DB load)?
- [ ] `checkOutVirtual` computed as `MAX(horaFin, horaFin + Σ approved overtime)` — what if operario leaves early without notice?
- [ ] `almuerzoInicio/Fin` as `String?` (HH:mm) — should this be a `time without timezone` PostgreSQL type via Prisma native type mapping?
