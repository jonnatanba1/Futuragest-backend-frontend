# Feature: minimapa en detalle de asistencia

## Objective
Aprovechar el mapa existente (Leaflet + CARTO del inventario) en el detalle de los registros, usando las coordenadas GPS que ya se capturan.

## Problem
El detalle mostraba las coordenadas como texto + link externo; el mapa del repo estaba sin usar fuera de inventario.

## Why
Pedido del usuario 2026-09-18.

## Scope
- `frontend_web/src/features/asistencia/AttendanceMiniMap.tsx` (+ CSS + test)
- `AttendanceDetailDrawer.tsx` (sección Ubicación) + su test
- Excluido: app móvil, cambios de tiles/proveedor.

## Tasks
- [x] Minimapa con pins ingreso (teal) / salida (naranja), fitBounds o zoom 15, respeta tema claro/oscuro. Sin iconos-imagen (circle markers).
- [x] Sección Ubicación en el drawer (solo si hay coords válidas; (0,0) y fuera de rango se ignoran).
- [x] Tests: helpers puros + componente con leaflet mockeado + drawer. Checks: 10/10 asistencia, typecheck, lint.

## Verification evidence
- `npm test -- --run src/features/asistencia/`: 10/10.
- `npm run typecheck`: clean. `npx eslint` en tocados: clean.
- Commit: 78b3acd (frontend_web, sin push).

## Next step
- Push + despliegue web los decide el usuario.
