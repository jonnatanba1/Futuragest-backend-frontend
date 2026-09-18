# Fix: foto al instante + notificaciones de llegada tarde

## Objective
Foto de ingreso disponible sin recargar la app; notificaciones de llegada tarde llegando siempre en la web.

## Problem
- La foto se sube en un paso posterior al check-in. Si ese paso fallaba (transitorio/servidor), no había más reintentos hasta acción manual o reinicio — por eso "llegó al recargar".
- Archivo de foto ilegible → reintento silencioso infinito.
- SSE web leía el token una vez al montar; al rotar, reconexión en 401 eterno y notificaciones muertas en silencio.

## Why
Reportes del usuario 2026-09-18 con evidencia en base (registro sin checkInPhotoKey).

## Scope
- `frontend_web/src/hooks/use-web-notifications.ts`, `use-novedad-sse.ts`
- `frontend_flutter/.../fichaje_sync_service.dart` + `test/fichaje_photo_recovery_test.dart`
- Excluido: alertas de decisión/aprobación en web (nunca existieron; posible follow-up).

## Tasks
- [x] FIX-1 Web SSE token fresco por intento (hooks 5/5, typecheck, lint). Commit: b7739b2.
- [x] FIX-2 App reintento auto 30s + foto ilegible visible (69 tests sync, analyze clean). Commit: 0a616cd.

## Verification evidence
- Web: hooks 5/5, `tsc` clean, eslint clean en tocados.
- App: sync suites 69/69 (incl. 2 nuevos), analyze clean.
- Base: último registro sin foto confirma causa (paso posterior, no bug de display).

## Next step
- Push + despliegue web/app los decide el usuario. Validar en campo: foto visible en segundos, campana con llegada tarde.
