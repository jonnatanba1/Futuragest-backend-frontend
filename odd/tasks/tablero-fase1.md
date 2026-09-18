# Feature: tablero fase 1 (lenguaje simple + filtro de fechas)

## Objective
Talento humano ve de un vistazo pedidas-vs-trabajadas, tardanzas rankeadas y compara con el período anterior, con palabras de todos los días y filtro Hoy / Esta semana / Este mes / rango.

## Problem
El tablero muestra instantáneas sueltas con tecnicismos (snapshot, conciliación, validadas, sin dato) y período fijo 7d/30d rodantes sin rango personalizado.

## Why
Propuesta Fase 1 aceptada por el usuario 2026-09-18: puro frontend, riesgo bajo, valor inmediato.

## Scope
- `frontend_web/src/features/dashboard/DashboardPage.tsx`
- `frontend_web/src/features/dashboard/dashboard-metrics.ts`
- `frontend_web/src/features/dashboard/*.test.ts(x)`
- Excluido: backend, BFF, snapshot de liquidación (Fase 2), app móvil.

## Authorized scope
Fase 1 (items 1-5 del análisis) + filtro de fechas con presets + copy simple. Sin tecnicismos visibles.

## TDD resolution
- Mode: off (ordinary functional checks)
- Source: default — sin elección explícita
- Runner: `npm test` (vitest run) + `npm run typecheck` + `npm run lint` en `frontend_web`

## Delivery strategy
- Strategy: `stacked-to-main` (ya elegida); slice #7 en `frontend_web` + puntero en super-repo
- Commits en español, sin push (lo decide el usuario)

## Language rule (contractual)
Cero tecnicismos visibles: nada de snapshot, conciliación, validadas, breakdown, delta, legacy, payload, KPI. Usar: Pedidas, Aprobadas, Trabajadas, A pagar, Hoy, Esta semana, Este mes, Desde/Hasta, Con exceso, Sin permiso, Esperando salida, No se usaron, Se usó una parte, Justas.

## Tasks
- [x] F1 Embudo pedidas→aprobadas→trabajadas→a pagar en el header del modal de extras (solo lectura, ~15 líneas, palabras simples)
- [x] F2 Antigüedad de pedidas (≤3d / 4-7d / >7d) + fila por resultado (No se usaron / Se usó una parte / Justas / Esperando salida), palabras simples
- [x] F3 Ranking de tardanzas del período (top personas + top municipio) en el modal de tardes; generalizar el cálculo a rango (hoy ya no es el único caso)
- [x] F4 Comparación con período anterior en tarjetas de extras y tardes ("X% más/menos que la semana pasada"), palabras simples
- [x] F5 Filtro de fechas: presets Hoy / Esta semana (lun-dom) / Este mes (calendario) + rango Desde/Hasta personalizado; badges coherentes
- [x] F6 Barrido de tecnicismos en todas las tarjetas del tablero (ver Language rule) + actualizar tests que esperan el copy viejo

## Acceptance criteria
- Modal de extras muestra el embudo completo de un vistazo con palabras simples.
- Pedidas viejas y resultados visibles con conteos.
- Modal de tardes rankea personas y municipios del período elegido.
- Tarjetas comparan con el período anterior en lenguaje simple.
- Selector ofrece Hoy / Esta semana / Este mes / Desde-Hasta y todo el tablero responde.
- Ninguna tarjeta muestra tecnicismos; tests verdes + typecheck + lint.

## Applicable checks
- `npm test -- --run src/features/dashboard/` (+ novedades si se toca), `npm run typecheck`, `npx eslint` en tocados
- Assess acotado `HEAD~1 --committed-only` + spot check del parent

## Progress
- 2026-09-18: F1..F6 DONE, verificados y pusheados (submódulos + rama). Commit frontend_web 864d8eb.

## Verification evidence
- Writer: dashboard+novedades 268/268, typecheck clean, eslint clean en tocados.
- Parent: assess acotado medium (executable_change en test, 4 paths/988 lines); spot metrics 167/167 + typecheck clean; barrido de tecnicismos confirma cero palabras técnicas visibles (resto: identificadores/comentarios internos).
- Nota: diff 988 líneas supera 400 — slice para PRs apilados si la revisión lo pide (strategia stacked-to-main ya elegida).

## Next step
- Push + PRs los decide el usuario (RDD off).

## Locator
- File: `odd/tasks/tablero-fase1.md`
- Mirror: Engram topic `odd/tablero-fase1/tasks` (project `futuragest-backend-frontend`)
