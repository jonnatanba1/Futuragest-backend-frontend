# Feature: exceso-horas-extra

## Objective
Exceso de horas extra visible y justificado: si lo trabajado supera lo autorizado, el supervisor explica el motivo al dar salida y se alerta a talento humano, líder operativo y coordinadores. Las trabajadas se cuentan al momento de la salida.

## Problem
- `reconcileOvertime` ya detecta EXCESO_REVISABLE con `requiresIncidence`, pero nadie pide el motivo, nadie guarda la justificación y nadie avisa a nadie.
- `Novedad.motivo` es el motivo del pedido, no de la salida; no existe campo de justificación de exceso.
- `RecipientResolver` solo resuelve LIDER_OPERATIVO (+opt SYSTEM_ADMIN) y al supervisor solicitante; no hay resolución por roles para alertas.
- El tablero muestra validadas sin marca de exceso y con copy técnico (snapshot, pagables).

## Why
Usuario corrigió la lógica: solo valen las trabajadas (al dar salida); el exceso se muestra, se justifica y se alerta. Sin subagentes disponibles (tier gratuito), implementación inline por slices.

## Scope
- `backend/prisma/schema.prisma` + migración (campo `motivoExceso` en Novedad)
- `backend/src/modules/novedades` (confirm-execution, reconcile, DTOs request/response, execution port)
- `backend/src/modules/notifications` (port, FCM/SSE/NoOp/composite adapters, recipient-resolver)
- `frontend_flutter` (UI de salida/confirm con motivo obligatorio si hay exceso)
- `frontend_web/src/features/dashboard` (copy simple + marca de exceso)
- Excluido: liquidación/nómina, cambios de roles, BFF nuevo.

## Constraints
- Sin BFF nuevo; exceso no recorta en silencio (validadas = evidencia completa, liquidables capado — diseño existente).
- Motivo obligatorio SOLO cuando trabajadas > autorizadas; flujo normal sin fricción extra.
- Alerta fire-and-forget (nunca bloquea la salida).
- Tests + docs junto al comportamiento. Push/PR los decide el usuario.

## Authorized scope
Usuario 2026-09-17/18: exceso visible + motivo obligatorio al dar salida + alerta a talento humano, líder operativo y coordinadores + copy simple (Pedidas/Aprobadas/Trabajadas/A pagar).

## TDD resolution
- Mode: off (ordinary functional checks)
- Source: default — sin elección explícita; los tests existentes no habilitan TDD
- Runner: backend `npx jest` + `npm run typecheck`; frontend_web `npm test` + `npm run typecheck` + `npm run lint`; flutter `flutter test` si aplica

## Delivery strategy
- Strategy: `single-pr`-equivalente local por slice (commits por unidad en cada submódulo + puntero en super-repo); PRs los crea el usuario
- Slices: 7a motivo backend, 7b alerta backend, 7c app, 7d tablero

## Tasks
- [x] ODD-7a Backend motivo exceso (migración `motivoExceso`, confirm exige motivo si ejecutadas > autorizadas, DTOs, tests) — checks: phase4+controller 31/31, typecheck clean. Commit: 545809a (backend).
- [x] ODD-7b Backend alerta exceso (port `notifyOvertimeExcess`, FCM/SSE/NoOp/composite, `getActivePushTokensForRoles`, disparo non-blocking en confirm) — checks: notifications+novedades 92/92 + controller 21/21, typecheck clean. Commit: 1c15b40 (backend).
- [x] ODD-7c App motivo al dar salida (botón Confirmar salida en Mis novedades, motivo obligatorio si exceso, repo+DTO+tests) — checks: 56 tests app, analyze clean. Commit: 0f7cafe (flutter, sin push).
- [x] ODD-7d Tablero copy simple + marca exceso (Pedidas/Aprobadas/Trabajadas/A pagar, `hasOvertimeExcess` + badge Con exceso + conteo, tests) — checks: dashboard+novedades 250/250, typecheck clean, eslint clean. Commit: ad6c517 (frontend_web, sin push).

## Acceptance criteria
- Exceso sin motivo → 422; con motivo → 200 y motivo persistido visible en detalle.
- Exceso dispara alerta a TALENTO_HUMANO + LIDER_OPERATIVO + COORDINADOR (push donde haya token, SSE en web).
- Flujo sin exceso idéntico a hoy (cero fricción extra).
- Tablero: copy simple sin "snapshot"; exceso marcado; tests verdes + typecheck por slice.

## Applicable checks
- Backend: `npx jest <scope>` + `npm run typecheck`
- Web: `npm test -- --run src/features/dashboard/` + `npm run typecheck` (+ lint en tocados)
- App: `flutter test` del scope si aplica

## Progress
- 2026-09-18: ODD-7a..7d DONE y verificados. Commits: backend 545809a, 1c15b40; flutter 0f7cafe; frontend_web ad6c517. Todo sin push (lo decide el usuario).

## Verification evidence
- ODD-7a: phase4 + controller 31/31 (2 tests motivo nuevos), typecheck clean (requirió `prisma generate` por el campo nuevo).
- ODD-7b: notifications + use-cases 92/92, controller 21/21, typecheck clean. Contaminación env/mocks entre describes aislada con beforeEach propio.
- ODD-7c: 56 tests app verdes, flutter analyze clean (fakes actualizados al puerto nuevo).
- ODD-7d: dashboard + novedades 250/250, typecheck clean, eslint clean en tocados.
- Preexistentes intactos (scope-meta-guard, flake T30, eslint config backend, App.test login, dirt .claude/.agents ajeno).

## Next step
- Cierre: push + `prisma migrate deploy` (motivoExceso) + PRs los decide el usuario.

## Locator
- File: `odd/tasks/exceso-horas-extra.md`
- Mirror: Engram topic `odd/exceso-horas-extra/tasks` (project `futuragest-backend-frontend`)
