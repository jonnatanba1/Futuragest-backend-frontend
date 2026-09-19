# Feature: Operaciones, Horas Extras, Administración, Auditoría y Web Push

## Objetivo
Implementar los 6 pilares de mejora operativa y administrativa aprobados:
1. Trazabilidad completa del aprobador de horas extras (quién y a qué hora).
2. Auto-cierre de horas extras al vencer el plazo solicitado (+10 min de gracia) con trazabilidad de origen (`SISTEMA` vs `SUPERVISOR`).
3. Módulo "Mi Perfil" en frontend web con autogestión de contraseña y preferencias.
4. Expansión de administración de usuarios (gestión de credenciales, `mustChangePassword`, reseteo).
5. Captura y visualización de hardware/dispositivos en sesiones de usuario para prevención de fraude.
6. Kardex y registro de auditoría transversal del sistema (`AuditLog`).
7. Notificaciones Web Push en segundo plano vía Service Worker.

## Tareas

- [x] **TASK-1**: Trazabilidad del usuario aprobador de horas extras (backend join con `User`, DTOs con `approvedByName` y `approvedByRole`, visualización en web). *(Completado: backend `c53ccac`, frontend_web `0d46f78`)*
- [x] **TASK-2**: Auto-cierre de horas extras con tolerancia de 10 minutos, cómputo estricto de horas solicitadas y marca `cerradoPor: 'SISTEMA'`. *(Completado: backend `4c9e78d`, frontend_web `b619b5c`)*
- [x] **TASK-3**: Módulo "Mi Perfil" en frontend web (`/perfil`), cambio de contraseña propio y visualización de perfil. *(Completado: frontend_web `8c80e87`)*
- [x] **TASK-4**: Expansión de gestión de usuarios en administración (edición de email, reseteo de contraseña por admin, `mustChangePassword`). *(Completado: backend `49f6d94`, frontend_web `b1a72c3`)*
- [x] **TASK-5**: Extracción y reporte de hardware/UUID de dispositivos en sesiones (`device_info_plus` en mobile y user-agent en web) para detección de fraude. *(Completado: frontend_flutter `98d5fe0`, frontend_web `86e7d68`)*
- [x] **TASK-6**: Entidad `AuditLog`, servicio/interceptor de auditoría de operaciones críticas y vista Kardex en `/admin/auditoria`. *(Completado: backend `011133e`, frontend_web `3aa2cb4`)*
- [x] **TASK-7**: Web Push Notifications con Service Worker (`sw.js`), VAPID en backend y suscripciones en navegador. *(Completado: backend `3d12582`, frontend_web `370040f`)*

## Verificación Aplicable
- Pruebas unitarias e integración en backend (`pnpm test` en backend).
- Pruebas en frontend web (`pnpm test -- --run` y `tsc --noEmit`).
- Pruebas en Flutter (`flutter test`).
