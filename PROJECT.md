# FuturaGest

Gestión de fuerza laboral de campo para equipos de aseo en Colombia (zonas Urabá y Bajo Cauca). El sistema permite a los **supervisores** registrar la asistencia diaria de los **operarios** (ingreso/salida con GPS, firma y biometría), reportar **horas extra (novedades)** y notificar al **líder operativo** para aprobación — todo con soporte **offline-first** en campo.

---

## Tabla de contenido

1. [Visión general](#1-visión-general)
2. [Arquitectura](#2-arquitectura)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Estructura del repositorio](#4-estructura-del-repositorio)
5. [Roles y control de acceso (RBAC)](#5-roles-y-control-de-acceso-rbac)
6. [Modelo de datos](#6-modelo-de-datos)
7. [Backend — módulos](#7-backend--módulos)
8. [API REST](#8-api-rest)
9. [App Flutter — features](#9-app-flutter--features)
10. [Flujos funcionales clave](#10-flujos-funcionales-clave)
11. [Seguridad](#11-seguridad)
12. [Configuración](#12-configuración)
13. [Cómo correr el proyecto](#13-cómo-correr-el-proyecto)
14. [Testing](#14-testing)
15. [Estado del proyecto y pendientes](#15-estado-del-proyecto-y-pendientes)
16. [Notas operativas y gotchas](#16-notas-operativas-y-gotchas)

---

## 1. Visión general

| | |
|---|---|
| **Backend** | API REST en NestJS (TypeScript) + PostgreSQL + MinIO (firmas) + Firebase Admin (push). Corre en el puerto **3001**. |
| **App de campo** | App móvil Flutter (Android) para supervisores y líderes operativos. Offline-first. |
| **Panel web** | Reportes, gráficas, carga masiva y gestión. **No iniciado** (bloque futuro). |
| **Dominio** | Asistencia diaria, horas extra con flujo de aprobación, gestión de operarios por zona. |

El **alcance de la app móvil** es el trabajo de campo:
- **SUPERVISOR**: registra fichaje (ingreso/salida) y crea novedades de hora extra.
- **LIDER_OPERATIVO**: recibe push al instante y aprueba/rechaza novedades desde el móvil.

Los reportes, carga masiva y gestión administrativa van en el panel web (futuro), no en la app.

---

## 2. Arquitectura

Ambos lados siguen **arquitectura hexagonal** (puertos y adaptadores) con organización **screaming** por feature/módulo.

### Backend (NestJS) — capas por módulo
```
modules/<feature>/
  domain/          → entidades, puertos (interfaces), errores de dominio
  application/     → casos de uso (lógica de negocio)
  infrastructure/  → adaptadores (Prisma, MinIO, FCM)
  interface/       → controllers, DTOs, guards
```

### Flutter — capas por feature
```
lib/features/<feature>/
  domain/          → modelos, puertos (abstract interface), excepciones
  data/            → implementaciones de puertos (dio, sqflite, mappers/DTOs)
  application/     → controllers (StateNotifier), providers (Riverpod), estados
  presentation/    → screens y widgets
lib/core/          → config, network (dio), storage, push, location, biometric, connectivity
```

**Principio clave:** la capa de aplicación depende solo de interfaces (puertos); las implementaciones concretas (HTTP, DB, FCM, GPS) viven en `data`/`infrastructure` y se inyectan.

---

## 3. Stack tecnológico

### Backend
- **NestJS 10** + **TypeScript 5.8**
- **Prisma 7** sobre **PostgreSQL** (adaptador `@prisma/adapter-pg`)
- **argon2** — hashing de contraseñas y refresh tokens
- **@nestjs/jwt** — access tokens (15 min) + refresh tokens opacos
- **class-validator / class-transformer** — validación de DTOs
- **MinIO** (`minio`) — almacenamiento de objetos para las firmas (PNG)
- **firebase-admin 13** — envío de push notifications (FCM)
- **exceljs / csv-parse** — importación masiva de operarios (CSV/XLSX)
- **@nestjs/swagger** — documentación OpenAPI
- **Jest + supertest** — tests unitarios e integración

### App Flutter
- **Flutter 3.x / Dart 3.12**
- **flutter_riverpod** — gestión de estado
- **dio** — cliente HTTP (con interceptor de auth + refresh automático)
- **flutter_secure_storage** — tokens y deviceId en keystore
- **sqflite** — cola offline persistente (fichajes)
- **geolocator** — captura de GPS en ingreso/salida
- **local_auth** — biometría (huella/rostro) como gate on-device
- **signature** — pad de firma → bytes PNG
- **connectivity_plus** — detección de red para replay de la cola
- **firebase_core / firebase_messaging** — recepción de push (Android)
- **uuid** — generación de `deviceId` y `clientRef`

---

## 4. Estructura del repositorio

Es un **monorepo** con **tres repos git separados**:

| Ruta | Repo git | Contenido |
|---|---|---|
| `C:/DEV/Futuragest` (raíz) | monorepo | `packages/contracts` (tipos compartidos), `pnpm-lock.yaml`, deploy |
| `backend/` | `futuragest-backend` | API NestJS |
| `frontend_flutter/` | `futuragest-frontend-flutter` | App móvil |
| `frontend_web/` | (futuro) | Panel web — no creado |

```
Futuragest/
├── backend/
│   ├── src/
│   │   ├── modules/        → auth, iam, asistencia, novedades, notifications, storage
│   │   ├── database/       → PrismaService (patrón adapter Prisma 7)
│   │   └── main.ts         → bootstrap (PORT 3001)
│   ├── prisma/
│   │   ├── schema.prisma   → modelo de datos
│   │   ├── migrations/     → migraciones SQL
│   │   ├── seed.ts         → seed autoritativo (zonas, municipios, supervisores, admin)
│   │   └── seed-operarios.ts → seed de operarios de prueba (dev)
│   └── secrets/            → firebase-service-account.json (gitignored)
├── frontend_flutter/
│   ├── lib/
│   │   ├── core/           → config, network, storage, push, location, biometric, connectivity
│   │   ├── features/       → auth, attendance, novedades
│   │   └── main.dart
│   └── android/            → manifest, MainActivity.kt, google-services.json, gradle
└── packages/
    └── contracts/          → DTOs/tipos TypeScript compartidos (@futuragest/contracts)
```

---

## 5. Roles y control de acceso (RBAC)

Seis roles (`enum Role`):

| Rol | Scope | Responsabilidad |
|---|---|---|
| `SYSTEM_ADMIN` | Global | Administración total del sistema |
| `GERENCIA` | Global (lectura) | Reportes y visión gerencial |
| `TALENTO_HUMANO` | Global | Alta/baja/importación de operarios |
| `LIDER_OPERATIVO` | Global | Recibe push y aprueba/rechaza novedades |
| `COORDINADOR` | Una zona | Supervisa una zona (1 coordinador por zona) |
| `SUPERVISOR` | Municipio + zona | Fichaje de sus operarios + creación de novedades |

### Dos capas de autorización
1. **Capa gruesa — `RolesGuard` + `@Roles(...)`**: ¿este rol puede llamar a este endpoint?
2. **Capa fina — repositorios "scoped"**: filtrado a nivel de fila por `supervisorId`/`zoneId`, tomados del `ScopeContext` del JWT (nunca del body). Ej: `ScopedOperarioRepository` solo devuelve los operarios del supervisor logueado; los roles globales ven todo.

El `ScopeContext` (userId, role, zoneId, supervisorId, deviceId) se construye en `AuthGuard` a partir de los claims verificados del JWT.

---

## 6. Modelo de datos

Entidades principales (Prisma / PostgreSQL):

```
Zone 1──* Municipio 1──* Supervisor 1──* Operario
                              │              │
                              │              ├──* Attendance ──* Novedad
                              │              └──* Assignment
User 1──1 Supervisor          │
User 1──* DeviceSession       │
User 1──1 Zone (coordinador)  │
```

| Entidad | Notas clave |
|---|---|
| **Zone** | Zona geográfica (Urabá, Bajo Cauca). 1 coordinador por zona. |
| **Municipio** | Pertenece a una zona. Único por `(zoneId, name)`. |
| **User** | Actor humano. `email` único, `passwordHash` (argon2), `role`, `mustChangePassword`. |
| **Supervisor** | Ligado a un `User`; tiene `municipioId`, `zoneId` (denormalizado), `area` (BARRIDO/RECOLECCION/SUPERNUMERARIO). |
| **Operario** | Trabajador de campo. `documento` único. `deactivatedAt` = baja blanda. |
| **Assignment** | Histórico operario↔supervisor (reasignable, con `endDate`). |
| **Attendance** | **Un registro por operario por día Colombia** (`@@unique([operarioId, date])`). Ingreso + salida, GPS de ambos, **dos firmas** (`signatureKey` ingreso, `checkOutSignatureKey` salida), `clientRef` (idempotencia), `completedAt` (bloqueo/inmutable). |
| **Novedad** | Hora extra sobre una asistencia. `horasExtra` (Decimal 5,2), `status` (PENDING/APPROVED/REJECTED). **Una activa por asistencia** (índice parcial único sobre PENDING\|APPROVED). |
| **DeviceSession** | Sesión por dispositivo: `refreshTokenHash` (argon2), `revokedAt` (revocación blanda), `pushToken` + `pushPlatform` (FCM). Único por `(userId, deviceId)`. |

**Patrón de scope**: `zoneId` está denormalizado en `Supervisor`, `Operario`(vía supervisor), `Assignment`, `Attendance` y `Novedad` para filtrado O(1) por zona (COORDINADOR) sin joins.

---

## 7. Backend — módulos

| Módulo | Responsabilidad |
|---|---|
| **auth** | Login, refresh de token, cambio de contraseña, sesiones por dispositivo, registro/baja de push token, guards (`AuthGuard`, `RolesGuard`, `MustChangePasswordGuard`). |
| **iam** | Lectura scoped (supervisores, operarios, asignaciones), escritura de operarios (`OperarioController`: crear, importar CSV/XLSX, desactivar/reactivar), gestión org (`OrgController`: zonas, municipios, asignar coordinador, crear usuarios). |
| **asistencia** | Fichaje: check-in, check-out (por id o por clientRef), subida de firma (`?phase=checkin\|checkout`), URL prefirmada de firma, listado/detalle scoped. |
| **novedades** | Creación de novedad sobre asistencia (dispara push fire-and-forget), listado/detalle scoped, aprobar/rechazar (líder). |
| **notifications** | Puerto `NotificationPort` + adaptadores (`NoOpNotificationAdapter` por defecto, `FcmNotificationAdapter` real detrás de `FIREBASE_ENABLED`), `RecipientResolver` (tokens de líderes activos), purga de tokens muertos. |
| **storage** | Adaptador MinIO (`StoragePort`) para subir/leer firmas. |

---

## 8. API REST

Base: `http://<host>:3001`

### Auth — `/auth`
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | `{email, password, deviceId}` → `{accessToken, refreshToken, passwordChangeRequired}` |
| POST | `/auth/refresh` | `{userId, deviceId, refreshToken}` → `{accessToken}` (público; no rota el refresh) |
| POST | `/auth/change-password` | `{oldPassword, newPassword}` (limpia `mustChangePassword`) |
| GET | `/auth/me` | Perfil del usuario (ruteo por rol; supervisor trae zona/municipio) |
| POST | `/auth/push-token` | `{pushToken, pushPlatform?}` → 204 (registra FCM token del device) |
| DELETE | `/auth/push-token` | 204 (baja del token del device en logout) |
| DELETE | `/auth/sessions/:deviceId` | Revoca sesión de un dispositivo |

### IAM — `/iam`
| Método | Ruta |
|---|---|
| GET | `/iam/supervisors`, `/iam/supervisors/:id` |
| GET | `/iam/operarios`, `/iam/operarios/:id` (scoped) |
| GET | `/iam/assignments`, `/iam/assignments/:id` |
| POST | `/iam/operarios` (crear) · `/iam/operarios/import` (CSV/XLSX) |
| PATCH | `/iam/operarios/:id/deactivate` · `/iam/operarios/:id/reactivate` |

> Lectura: `SYSTEM_ADMIN, GERENCIA, TALENTO_HUMANO, COORDINADOR, SUPERVISOR`. Escritura de operarios: `SYSTEM_ADMIN, TALENTO_HUMANO`.

### Org — `/org`
| Método | Ruta |
|---|---|
| GET | `/org/zones`, `/org/municipios` |
| POST | `/org/coordinadores/assign`, `/org/users` |

### Asistencia — `/asistencia` (rol `SUPERVISOR` para escritura)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/asistencia/check-in` | Crea la asistencia (201) / idempotente por `clientRef` (200) |
| POST | `/asistencia/:id/signature?phase=checkin\|checkout` | Sube la firma de ingreso o salida a MinIO |
| POST | `/asistencia/:id/check-out` | Cierra la asistencia (exige firma de salida → 422 si falta) |
| POST | `/asistencia/by-client-ref/:clientRef/check-out` | Check-out por clientRef de ingreso |
| GET | `/asistencia` | Listado scoped (`?since=ISO` delta, `?clientRef=` recuperación) |
| GET | `/asistencia/:id` · `/asistencia/:id/signature` | Detalle / URL prefirmada de firma |

### Novedades
| Método | Ruta | Rol |
|---|---|---|
| POST | `/asistencia/:attendanceId/novedades` | SUPERVISOR (crea hora extra → dispara push) |
| GET | `/novedades`, `/novedades/:id` | scoped |
| PATCH | `/novedades/:id/approve` · `/reject` | LIDER_OPERATIVO |
| DELETE | `/novedades/:id` | |

### Health
`GET /health` → `{status, postgres, minio}`

---

## 9. App Flutter — features

| Feature | Pantallas | Función |
|---|---|---|
| **auth** | `login_screen`, `change_password_screen`, `home_screen` | Login real, cambio de contraseña forzado en primer ingreso, home con ruteo por rol e init de push. |
| **attendance** (fichaje) | `operario_list_screen`, `fichaje_screen` | Lista de operarios scoped con estado del día; flujo de ingreso/salida en dos fases. |
| **novedades** | `novedades_list_screen`, `novedad_form_screen`, `lider_novedades_screen` | Crear hora extra (supervisor), "Mis novedades", y aprobar/rechazar (líder). |

**Core** (`lib/core`): `config` (AppConfig), `network` (dio + interceptor de refresh), `storage` (tokens), `push` (FCM), `location` (GPS), `biometric` (local_auth), `connectivity`.

---

## 10. Flujos funcionales clave

### 10.1 Autenticación
1. `POST /auth/login` con `deviceId` estable → access token (JWT, 15 min) + refresh token opaco (hash argon2 en DB).
2. Si `mustChangePassword` → la app fuerza `ChangePasswordScreen`; tras cambiarla, **re-loguea** para obtener un token fresco (el guard lee `mustChangePassword` del claim del JWT, no de la DB).
3. **Refresh automático**: el interceptor dio detecta 401, llama a `/auth/refresh` (single-flight) y reintenta el request original. Si el refresh falla → limpia sesión y vuelve a login.
4. Logout: da de baja el push token (`deleteToken()` + `DELETE /auth/push-token`) y limpia el storage.

### 10.2 Fichaje en dos fases (offline-first)
La asistencia se toma en **dos momentos separados** del turno (ej. ingreso 6:00, salida 18:00), cada uno con **biometría + GPS + firma del operario**:

- **INGRESO**: biometría → GPS → `check-in` → firma de entrada (`?phase=checkin`).
- **SALIDA**: biometría → GPS → firma de salida (`?phase=checkout`) → `check-out`.

**Regla de negocio**: **un registro por operario por día** (`@@unique([operarioId, date])`, fecha Colombia UTC-5). La lista de operarios refleja el estado: sin registro → *Registrar ingreso*; ingreso hecho → *Registrar salida*; completo (ingreso+salida) → bloqueado + acción *Horas extra*.

### 10.3 Cola offline (sqflite) — máquina de estados
Cada asistencia es una fila local que se sincroniza por pasos, con replay idempotente:
```
pendingCheckIn → checkedIn → ingresoComplete → salidaSigned → completed
                                   ↑ en reposo hasta capturar la salida
```
- Escritura **local primero**, POST después. El replay reintenta al recuperar conectividad.
- Idempotencia por `clientRef` (ingreso) y `checkOutClientRef` (salida); respuestas perdidas se recuperan vía `GET /asistencia?clientRef=`.
- Funciona **totalmente offline**: si se capturan ingreso y salida sin señal, al reconectar el replay ejecuta los 4 pasos en orden.
- *Limitación actual*: la salida debe registrarse en el **mismo dispositivo** que el ingreso (la cola persiste en el teléfono).

### 10.4 Novedades (horas extra → aprobación)
1. El supervisor crea una novedad sobre una asistencia completa (`POST /asistencia/:id/novedades`).
2. El backend dispara un **push fire-and-forget** (no bloquea la creación) a todos los líderes operativos activos.
3. El líder recibe el push, hace deep-link a la pantalla de novedades pendientes y **aprueba/rechaza** (`PATCH .../approve|reject`).

### 10.5 Notificaciones push (FCM)
- **Backend**: `CreateNovedadUseCase` → `NotificationPort.notifyNovedadCreated` → `RecipientResolver` (tokens de líderes activos vía ORM) → `FcmNotificationAdapter.sendEachForMulticast`. Los tokens muertos (`registration-token-not-registered`, etc.) se **purgan** automáticamente.
- **Flutter**: `PushMessagingService` maneja foreground (SnackBar), background y terminated (deep-link). Canal Android nativo `fcm_default_channel` (importancia alta) + ícono/color de marca. Token registrado en cada login y re-registrado en `onTokenRefresh`.
- Payload: `{ type: 'NOVEDAD_CREATED', novedadId }`.

---

## 11. Seguridad

- **Access token JWT de 15 min** + **refresh token opaco** (hash argon2, almacenado por dispositivo). Refresh transparente en el cliente.
- **RBAC en dos capas**: `RolesGuard` (endpoint/rol) + repositorios scoped (fila/zona). El scope sale **siempre del JWT**, nunca del body.
- **Contraseñas** con argon2; `mustChangePassword` fuerza cambio en primer ingreso.
- **Sesiones por dispositivo** con revocación blanda; el `AuthGuard` valida que la sesión no esté revocada.
- **Firmas** en MinIO con keys deterministas (`signatures/{supervisorId}/{attendanceId}[-checkout].png`).
- **Secretos** (`.env`, `firebase-service-account.json`) gitignored. La app móvil **no** lleva secretos (config por `--dart-define`).

---

## 12. Configuración

### Backend (`backend/.env`)
| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL |
| `PORT` | `3001` (Dokploy ocupa 3000) |
| `JWT_SECRET` | Secreto de firma (obligatorio en prod) |
| `MINIO_*` | Endpoint, credenciales, bucket, SSL para MinIO |
| `FIREBASE_ENABLED` | `true` activa el envío FCM real (default: NoOp) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Ruta al service-account JSON (en `backend/secrets/`) |
| `PUSH_NOTIFY_SYSTEM_ADMIN` | Opcional: también notificar a SYSTEM_ADMIN |

### Flutter (`--dart-define`, sin `.env`)
| Variable | Default | Notas |
|---|---|---|
| `API_BASE_URL` | `http://localhost:3001` | Emulador → `http://10.0.2.2:3001`; teléfono físico → `http://<IP-LAN>:3001` |

La app **no usa `.env`** (un secreto empaquetado en el APK es extraíble). La config va por `--dart-define` con default en `AppConfig`.

---

## 13. Cómo correr el proyecto

### Backend
```bash
cd backend
pnpm install
pnpm exec prisma migrate dev        # aplica migraciones
pnpm exec prisma db seed            # zonas, municipios, 23 supervisores, 1 admin
pnpm exec tsx prisma/seed-operarios.ts   # (dev) operarios de prueba
PORT=3001 pnpm start:dev
# health: http://localhost:3001/health → {status:ok, postgres:up, minio:up}
```

### App Flutter (emulador Android)
```bash
cd frontend_flutter
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

### APK para teléfono físico (misma red WiFi)
```bash
# 1. Compilar apuntando a la IP LAN de la PC
flutter build apk --release --dart-define=API_BASE_URL=http://<IP-LAN>:3001
# 2. Abrir el puerto en el firewall (PowerShell como admin)
New-NetFirewallRule -DisplayName "FuturaGest Backend 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
# 3. Instalar
adb install build/app/outputs/flutter-apk/app-release.apk
# Verificar desde el teléfono: http://<IP-LAN>:3001/health
```
El manifest declara `INTERNET` y `usesCleartextTraffic` (HTTP en claro para LAN). El release firma con la debug key (instalable para pruebas).

### Credenciales de seed
- Todos los usuarios sembrados: contraseña inicial `ChangeMe@2024!` con `mustChangePassword=true`.
- Admin: `admin@futuragest.co` (rol SYSTEM_ADMIN). Supervisores: `supervisor-1..23@futuragest.co`.
- Para el flujo de campo usar un **SUPERVISOR** (el admin rutea a otro lado).

---

## 14. Testing

### Backend (Jest)
```bash
cd backend
pnpm test           # todo
pnpm test:unit      # solo *.spec.ts (unitarios)
pnpm test:int       # solo *.int-spec.ts (integración, requiere Postgres + MinIO)
pnpm typecheck      # tsc --noEmit
```
Cobertura: ~414 tests unitarios + suites de integración (supertest contra la DB de test). TDD estricto.

### Flutter
```bash
cd frontend_flutter
flutter analyze     # objetivo: 0 issues
flutter test        # widget/unit tests
```

---

## 15. Estado del proyecto y pendientes

### Implementado y verificado
- ✅ Backend completo (auth, IAM, org, asistencia, novedades, notificaciones, storage) con RBAC en dos capas.
- ✅ Fichaje en dos fases (ingreso/salida) con doble firma, offline-first.
- ✅ Notificaciones push FCM (envío real detrás de `FIREBASE_ENABLED`) + ciclo de vida de tokens reparado.
- ✅ Refresh automático de token en la app (sesión sobrevive turnos largos).
- ✅ App de campo: login, cambio de contraseña, fichaje, novedades, aprobación de líder, push.

### Pendiente / futuro
- ⏳ **Prueba de envío FCM real punta a punta** (requiere `FIREBASE_ENABLED=true` + service account + dispositivo).
- ⏳ **Panel web** (`frontend_web`): reportes, gráficas, carga masiva, gestión. No iniciado.
- ⏳ **Novedades offline**: crear/listar novedades sin señal (hoy requiere conexión).
- ⏳ **Salida cross-device**: registrar la salida en un teléfono distinto al del ingreso.
- ⏳ **iOS / APNs**: fuera de alcance actual (Android-only).
- ⏳ **Infra**: migrar MinIO de Dokploy local a VPS con dominio público + SSL.

---

## 16. Notas operativas y gotchas

- **Puerto**: backend en `:3001` (Dokploy usa `:3000`). En Windows, si `start:dev` reinicia tras editar archivos, a veces queda un `node` huérfano en 3001 (`EADDRINUSE`) → liberar con `netstat -ano | findstr :3001` + `taskkill /PID <pid> /F`.
- **Emulador vs localhost**: en el emulador Android, `localhost` es el propio emulador. Usar `10.0.2.2` para la PC.
- **JWT y estado de DB**: los claims (rol, `zoneId`, `mustChangePassword`) están congelados en el token. Un cambio en DB requiere token nuevo (re-login o refresh) para reflejarse.
- **Prisma client**: regenerar el cliente (o guardar archivos) tira abajo el `start:dev` — reiniciar el backend.
- **Fecha del día**: el límite del día de asistencia es la fecha Colombia (UTC-5) computada por el cliente, consistente entre ingreso y salida.
- **Firmas**: el check-out exige la firma de **salida** (`checkOutSignatureKey`); 422 si falta.

---

*Documento de referencia del proyecto FuturaGest. Mantener actualizado al evolucionar la arquitectura.*
