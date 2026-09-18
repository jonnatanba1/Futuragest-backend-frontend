# Feature: salida automática con firma

## Objective
Al dar salida desde la app: las horas trabajadas se calculan solas (hora de salida − hora de política) y la firma del operario es obligatoria.

## Problem
- El diálogo Confirmar salida pedía tipear las horas (redundante y propenso a error).
- Nadie pedía ni guardaba la firma del operario a la salida.

## Why
Corrección del usuario 2026-09-18: el sistema sabe la hora de política y la de salida; la firma es importante.

## Scope
- Backend: `Attendance.salidaSignatureKey` (migración), POST `/asistencia/:id/salida-signature`, firma requerida en confirm-execution (422), DTO.
- App: `policyCloseTime` en DTO, cálculo automático con fallback manual, pad de firma obligatorio en el diálogo, repo + tests.
- Excluido: visualización de la firma en web (follow-up), liquidación.

## Design decisions
- Trabajadas = max(0, salida − cierre de política) en la fecha de la jornada (soporta trasnoche por fechas, no por suma ingenua).
- Firma requerida SIEMPRE al confirmar (no solo con exceso); endpoint admite registro abierto o completado (la firma puede llegar después del checkout).
- Sin política conocida → fallback a carga manual (no se bloquea la salida).

## Tasks
- [x] SAL-1 Backend firma salida (columna `salidaSignatureKey`, endpoint PNG ≤2MB, requerida en primer confirm 422, DTO, tests) — checks: unit 1327+ (solo 2 preexistentes), typecheck clean. Commit: 00d923d. Migración desplegada en remoto.
- [x] SAL-2 App horas auto + firma (policyCloseTime en DTO, `workedExtrasHours` puro, diálogo con cálculo de solo lectura + fallback manual, pad de firma, repo, tests) — checks: flutter 274/274, analyze clean. Commit: 5d1d607 (sin push).

## Acceptance criteria
- Con política: horas de solo lectura calculadas; con exceso → motivo obligatorio (ya existe).
- Sin firma → 422 con mensaje claro; con firma → 200 y key persistida.
- Sin política: carga manual como antes.
- Tests verdes + typecheck/analyze por slice.

## Progress
- 2026-09-18: SAL-1 + SAL-2 DONE y verificados. Commits: backend 00d923d; flutter 5d1d607. Migración salidaSignatureKey desplegada. Sin push.

## Verification evidence
- Backend: unit 1327/1329 (solo preexistentes meta-guard + T30 flake), typecheck clean, `prisma generate` tras schema.
- App: flutter test 274/274, `flutter analyze` limpio (todo el proyecto).
- Diseño: firma siempre requerida al confirmar (se omite solo en re-confirm con executedAt); sin política → manual.

## Next step
- Push + despliegue backend/app + PRs los decide el usuario.
