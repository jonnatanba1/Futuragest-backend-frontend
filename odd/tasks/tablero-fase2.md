# Feature: tablero fase 2 (conciliacion automatica, buzon tardanzas y snapshot liquidacion)

## Objective
Conectar la salida del operario con la conciliacion automatica de horas extra, activar notificaciones push y acuse de recibo de llegadas tarde para Talento Humano, y cablear el snapshot de liquidacion "A pagar" en el tablero de control.

## Problem
- Las horas extras aprobadas no se concilian automaticamente al dar salida ni al confirmar ejecucion (quedan desacopladas a menos que se llame un endpoint manual).
- Las tardanzas no envian push a Talento Humano y quedan en PENDING perpetuo sin registro de acuse o revision.
- La tarjeta "A pagar" del tablero muestra "todavia no disponible" porque no existe un endpoint de resumen de snapshot de liquidacion.

## Scope
- `backend/src/modules/jornada/application/classify-attendance.use-case.ts`
- `backend/src/modules/novedades/application/confirm-execution.use-case.ts`
- `backend/src/modules/novedades/application/acknowledge-tardiness.use-case.ts`
- `backend/src/modules/novedades/interface/novedad.controller.ts`
- `backend/src/modules/notifications/infrastructure/fcm-notification.adapter.ts`
- `backend/src/modules/compensacion/interface/compensacion.controller.ts`
- `frontend_web/src/features/dashboard/dashboard-metrics.ts`
- `frontend_web/src/features/dashboard/DashboardPage.tsx`
- Specs backend y frontend asociados.

## Constraints
- Cero tecnicismos visibles en el UI (regla contractual de Fase 1).
- No romper esquemas ni agregar migraciones Prisma innecesarias: acuse de recibo usa `decidedAt` y `approvedByUserId`.
- RDD off (default).
- Commits convencionales en espanol, sin atribucion IA.

## TDD resolution
- Mode: off (ordinary functional checks)
- Runner: `npm test` en backend y `pnpm test -- --run` en frontend_web.

## Delivery strategy
- Strategy: `stacked-to-main`
- Commits por unidad de trabajo atómica.

## Tasks
- [x] F2-1 Backend: Conciliacion automatica de horas extra al clasificar salida (`classify-attendance.use-case.ts`) y re-conciliacion al confirmar ejecucion (`confirm-execution.use-case.ts`).
- [x] F2-2 Backend: Notificaciones push de tardanzas dirigidas a Talento Humano y Líder Operativo (`fcm-notification.adapter.ts`).
- [x] F2-3 Backend: Caso de uso y endpoint `PATCH /novedades/:id/acknowledge` para acuse de recibo de llegadas tarde por Talento Humano.
- [x] F2-4 Backend: Endpoint `GET /compensacion/payout-summary?desde&hasta` que totalice las horas pagables liquidadas del periodo.
- [x] F2-5 Frontend Web: Integracion del snapshot de liquidacion en `DashboardPage.tsx` y `dashboard-metrics.ts` para mostrar la cifra real de "A pagar".
- [x] F2-6 Frontend Web: Buzon y accion de acuse de recibo ("Marcar como revisado") en el modal de tardanzas para Talento Humano.

## Acceptance criteria
- Check-out de un operario con horas extra aprobadas genera automaticamente la conciliacion con outcome y horas validadas.
- Creacion de llegada tarde despacha push a dispositivos de Talento Humano.
- Talento Humano puede registrar acuse de recibo en llegadas tarde sin cambiar el tipo ni violar restricciones.
- El tablero consume el snapshot de liquidacion y muestra el total "A pagar" en lenguaje simple.
- Tests verdes, typecheck y linter limpios en backend y web.

## Applicable checks
- Backend: `npm test` en novedades, jornada, compensacion y notifications.
- Frontend: `pnpm test -- --run src/features/dashboard/`, `pnpm run typecheck`.

## Progress
- 2026-09-18: Feature inicializada con 6 tareas.
- 2026-09-18: F2-1 completada (adapter de conciliacion e integracion en checkout y confirmacion de ejecucion; 33/33 tests OK).
- 2026-09-18: F2-2 completada (resolucion de destinatarios TH, LIDER_OPERATIVO y COORDINADOR para LLEGADA_TARDE; 22/22 tests OK).
- 2026-09-18: F2-3 completada (caso de uso y endpoint PATCH /novedades/:id/acknowledge; 24/24 tests controller OK, 4/4 tests use-case OK).
- 2026-09-18: F2-4 completada (metodo findClosedInRange y endpoint GET /compensacion/payout-summary; 29/29 tests controller OK, 9/9 repo OK).
- 2026-09-18: F2-5 completada (contrato PayoutSummaryDto, query hook, integracion en overtime card detail; 63/63 tests DashboardPage OK).
- 2026-09-18: F2-6 completada (accion de acuse de recibo en modal de tardanzas, badges 'Revisado por TH' y 'Pendiente de revisión', typecheck limpio; 169/169 metrics tests OK, 33/33 client tests OK).
- 2026-09-18: Commits generados:
  - Backend: `2d31c54` (`feat(backend): conciliacion automatica, acuse de tardanzas y resumen de liquidacion`)
  - Frontend Web: `a0071e2` (`feat(tablero): snapshot de liquidacion y acuse de llegadas tarde`)

## Locator
- File: `odd/tasks/tablero-fase2.md`
- Mirror: Engram topic `odd/tablero-fase2/tasks` (project `futuragest-backend-frontend`)
