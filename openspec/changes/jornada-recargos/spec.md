# Delta Spec: Jornada, Horas Extras, Recargos y Compensatorios

## ADDED Requirements

### REQ-001: JornadaPolicy 3-Level Scope + Lunch + Tolerance

| Scenario | Result |
|---|---|
| Operario policy 05:00–13:00 set | Uses operario-level over zone/global |
| Operario policy `vigenteDesde` > date | Fallback zone→global |
| `operarioId`+`zoneId` both non-null | Rejected (CHECK) |
| No policy at any level for date | `NoPolicyForDateError` |
| Lunch auto: 6:00–14:00, almuerzo=null | 9:45–10:15 (midpoint-centered) |
| Lunch explicit: `almuerzoInicio="12:00"`, fin=null | 12:00–12:30 |
| `almuerzoFin` < `almuerzoInicio` | Validation error |
| `toleranciaMin=10`, `horasDiarias=7.50` | Persisted (NET hours) |

### REQ-002: TimeClassificationEngine v2 — Schedule-Window + Lunch-Skip

| Scenario | Result |
|---|---|
| 6:00–14:00, L-V, 7.5h/d, lunch auto | 7.5h ord.diurna, 0h extra (lunch skipped) |
| Same, checkOut=15:00 (9h gross) | 7.5h ord.diurna + 1.0h extra diurna (8.5h net) |
| 14:00–22:00, crosses 19:00 boundary | 5h ord.diurna + 3h ord.nocturna |
| 22:00–06:00 midnight, non-labor | 8h extra nocturna |
| checkIn=10:00 inside lunch 9:45–10:15 | 15min skipped; starts at 10:15 |
| Sunday/festival, 6:00–14:00 | esDominical/esFestivo=true |
| 16:00–20:00 Sat, crosses 19:00 | 3h extra diurna + 1h extra nocturna |
| Turno ≤0h or >20h | Error (invalid range) |

### REQ-003: Virtual Check-Out

| Scenario | Result |
|---|---|
| No approved overtime | checkoutVirtual=horaFin; 7.5h |
| 2h APPROVED overtime | checkoutVirtual=horaFin+2h; 9.5h |
| 2h PENDING overtime | checkoutVirtual=horaFin (ignored) |
| Manual `POST /check-out` with flag ON | 410 Gone |
| Scheduler runs before horaFin | Deferred; fires at horaFin |
| Multiple APPROVED novedades | checkoutVirtual=horaFin+ΣapprovedHours |

### REQ-004: Auto Late-Arrival Novedad

| Scenario | Result |
|---|---|
| 6:00, tol=5, checkIn=6:06 | Novedad{LLEGADA_TARDE, minutosTarde=6, PENDING} |
| 6:00, tol=5, checkIn=6:05 | Not created (inclusive tolerance) |
| 6:00, tol=5, checkIn=5:55 | Not created (early = no fault) |
| Already has active LLEGADA_TARDE → retry | No duplicate (idempotent) |
| Operario policy: 05:00, tol=10, checkIn=05:07 | Not created (7min < 10) |
| Attendance creation fails | Novedad not created; error propagated |

### REQ-005: Overtime Pre-Auth + Biometric Approval

| Scenario | Result |
|---|---|
| Líder approves 2h extra with huella | APPROVED, verification=BIOMETRIC, checkout+2h |
| Líder rejects with huella | REJECTED, checkout unchanged |
| Second PENDING on same attendance | Rejected (unique active) |
| No biometric → approve | DEVICE_CREDENTIAL fallback (non-blocking) |
| Push notification tap → Flutter | Detail: operario, supervisor, hours, motive, history |

### REQ-006: CompensatoryRest Tracking

| Scenario | Result |
|---|---|
| 1 Sunday worked in month | OCCASIONAL — pay OR rest at worker choice |
| 3 Sundays | All → HABITUAL — pay AND mandatory rest |
| 2 Sundays + 1 holiday = 3 | HABITUAL |
| Flag OFF, Sunday attendance | None generated |
| HABITUAL; one attendance deleted | Remaining re-evaluated (may → OCCASIONAL) |

### REQ-007: Effective-Dated SurchargeRate

| Scenario | Result |
|---|---|
| Date=2026-07-01, DOMINICAL_FESTIVO | 90% |
| Date=2026-06-30 23:59 | 80% |
| Date=2027-07-01 | 100% |
| Date before earliest `vigenteDesde` | `NoSurchargeRateForDateError` |
| Dominical+nocturno 2026-07-15 | 90%+35%=125% (runtime sum) |

## MODIFIED Requirements

### REQ-008: Novedad — TipoNovedad + Auto Generación
(Previously: `horasExtra` + `tipoHoraExtra` only; no late-arrival concept.)

| Scenario | Result |
|---|---|
| Auto llegada tarde | tipoNovedad=LLEGADA_TARDE, autoGenerada=true, minutosTarde=N |
| Supervisor overtime | tipoNovedad=HORAS_EXTRA, autoGenerada=false |
| HORAS_EXTRA with minutosTarde set | Validation error |

### REQ-009: CompensationPeriod — Category Breakdown
(Previously: flat `creditos`/`debitos`/`saldo` only.)

| Scenario | Result |
|---|---|
| Period with Sunday (90% rate) | horasDominicalesFestivas=7.5h, tasaDominicalAplicada=90.00 |
| 2h nocturna + 1h extra diurna, $10k/h | valorRecargos = 2×10k×0.35 + 1×10k×0.25 = $9.5k |
| Zero classified attendances | Breakdown null; legacy saldo |
| Negative breakdown sum | InvalidBreakdownError |

### REQ-010: Attendance — Virtualized Check-Out
(Previously: human-performed check-out; `POST /check-out` populated all fields.)

| Scenario | Result |
|---|---|
| Scheduler at virtual horaFin | completedAt set; breakdown persisted; immutable |
| checkOutCapturedAt=null, completedAt set | Valid virtual state |
| checkOutVerification=null | Audit distinction from check-in |
