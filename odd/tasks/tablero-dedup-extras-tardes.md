# Feature: tablero-dedup-extras-tardes

## Objective
Eliminar duplicados del tablero, visibilizar llegadas tarde y sincerar horas extras (pedidas vs autorizadas vs validadas vs pagables) sin romper usos existentes.

## Problem
- Cobertura vs Sin-ingreso son complementos exactos del mismo `attendanceCoverageToday()`, mismo modal.
- Promedio-autorizadas vs Validadas comparten un solo loop `collectApprovedOvertime`, mismo modal.
- Mayor-carga es el max del mismo set. Footer del chart repite el total.
- `lateArrivalsCount()` existe y esta testeada pero nunca se renderiza.
- Dashboard suma `horasExtra` pedida como credito, `?? hours` borra distincion, PENDIENTES/SIN_AUTORIZACION invisibles.
- DTO Swagger omite Fase 4; `—/sin datos` ambiguo entre no-desplegado y cero.
- Badges mezclan hoy vs periodo.

## Why
Usuario pidio propuesta para tablero (extras + tardes) y autorizo implementarla. Recuperable tras interrupcion.

## Scope
- `frontend_web/src/features/dashboard/DashboardPage.tsx`
- `frontend_web/src/features/dashboard/dashboard-metrics.ts`
- `frontend_web/src/features/dashboard/*.test.ts(x)`
- `frontend_web/src/lib/ui/time.ts` (solo si timezone lo exige)
- Backend DTO Fase 4: `backend/src/modules/novedades/interface/response-dtos.ts` + controller serializacion (solo P4, alcance minimo)
- Excluido: nomina/payout, migraciones nuevas, BFF nuevo, cambios en mobile.

## Constraints
- Sin BFF nuevo; todo agregacion cliente como hoy.
- No romper callers/tests existentes; fachadas finas.
- RDD off (default); checks ordinarios por tarea.
- Push/PR/merge los decide el usuario.

## Authorized scope
User: "procede con esta propuesta" (2026-09-17). Incluye P1-P4 arriba. No incluye deploy ni cambios fuera de Scope.

## TDD resolution
- Mode: off (ordinary functional checks, no RED/GREEN ceremony)
- Source: default — no explicit user choice, no session config; test files present do NOT enable TDD
- Runner: `npm test` (vitest run) + `npm run typecheck` + `npm run lint` in `frontend_web`; backend P4 usa su runner si toca backend

## Delivery strategy
- Strategy: `ask-on-risk` (default)
- Forecast: ~610 authored lines (P1 ~150, P2 ~200, P3 ~180, P4 ~80) > 400 budget -> se preguntara chain strategy una vez antes del slice que exceda
- Chain strategy: `stacked-to-main` (elegida por usuario 2026-09-17; cada PR mergea a main en orden)
- Slices/PR boundaries: pending

## Tasks
- [x] ODD-1 P1 Dedup tablero (fusion cobertura, fusion extras con `novedadExecutionHoursLabel`, mayor-carga derivado, quitar footer repetido, badges Hoy vs Periodo) — checks: vitest dashboard-metrics + Page 181/181, typecheck clean, lint clean en files tocados. Commits: 107e0fd5 + fix a6a227c (submodule; super-repo pointer bump pendiente).
- [x] ODD-2 P2 Tardes visibles (card hoy con `lateArrivalsCount` + modal propio con `novedadTardanzaLabel`, timezone IANA via `toWorkDate`, `0` vs `—` en error) — checks: dashboard 186/186, typecheck clean, lint clean en files tocados. Commit: d752a56 (submodule).
- [x] ODD-3 P3 Extras honestos (4 numeros solicitadas/autorizadas/validadas/pagables-snapshot, sin `?? hours`, PENDIENTES/SIN_AUTORIZACION con filtro) — checks: dashboard 207 + novedades 39 verdes, typecheck clean, lint clean en 5 files. Commit: a94350b (submodule).
- [x] ODD-4 P4 Contrato Fase 4 (6 campos en DTO con Swagger, ausente sigue ausente, tests de contrato) — checks: spec 21/21, typecheck clean. Commit: 0fa05a2 (backend submodule).
- [x] ODD-5 Tarjeta Horas extra ancha (prop `wide` + `.fg-insight-card-wide` span 2, fallback 1 col en móvil, test de regresión) — checks: dashboard 208/208, typecheck clean, eslint clean. Commit: 135d498 (frontend_web).

## Acceptance criteria
- Una sola card Cobertura hoy; una sola card Extras con `X autorizadas · Y validadas` y estado sin-datos vs 0.
- Card Tardes hoy visible con modal propio; cero `lateArrivalsCount` sin render.
- Extras nunca muestra pedidas como credito; PENDIENTES visibles.
- DTO incluye Fase 4; `—` solo para sin-datos, `0` para cero real.
- Tests verdes + typecheck + lint por tarea.

## Applicable checks
- `npm test -- --run` (frontend_web), `npm run typecheck`, `npm run lint`
- Estructura: readback de archivos tocados

## Progress
- 2026-09-17: ODD-1..ODD-5 DONE, verificados y pusheados. Commits: frontend_web 107e0fd5, a6a227c, d752a56, a94350b, 135d498; backend 0fa05a2; super-repo 360f29e, 1df4c59 en `feat/tablero-dedup-extras-tardes`.

## Verification evidence
- ODD-1/ODD-2/ODD-3: verificado (ver entradas anteriores).
- ODD-4 writer: spec 21/21 (18 + 3 nuevos), typecheck clean; novedades 1310 pass con 2 preexistentes probados via stash (scope-meta-guard + flake T30); eslint config roto por dep faltante (preexistente, ambiente).
- ODD-4 parent: assess acotado `HEAD~1 --committed-only` = medium (2 paths/150 lines); spot checks: spec 21/21 + typecheck clean. Sin verificador separado (tier medium).
- Slices stacked-to-main: #1 ODD-1 (107e0fd5+a6a227c, frontend), #2 ODD-2 (d752a56), #3 ODD-3 (a94350b), #4 ODD-4 (0fa05a2, backend), #5 ODD-5 (135d498, frontend). PRs los crea el usuario.

## Next step
- Push ODD-5 + PRs los decide el usuario bajo policy ordinaria (RDD off).

## Locator
- File: `odd/tasks/tablero-dedup-extras-tardes.md`
- Mirror: Engram topic `odd/tablero-dedup-extras-tardes/tasks` (project `futuragest-backend-frontend`)
