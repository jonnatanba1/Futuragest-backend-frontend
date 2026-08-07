# Progreso y Resumen de Despliegue en Producción - FuturaGest

Este documento detalla todas las configuraciones, bugs descubiertos, soluciones técnicas aplicadas y el estado final del entorno de producción de FuturaGest, desplegado en un servidor Dokploy el 12 de Junio de 2026.

## 1. Contexto y Entorno

- **Plataforma:** Dokploy (host de producción administrado; la IP no se documenta en Git).
- **Protocolo Base:** HTTPS obligatorio. HTTP solo redirige a HTTPS; los servicios de datos permanecen en red privada.
- **Componentes de la Arquitectura:** Base de Datos (PostgreSQL), Almacenamiento de Objetos (MinIO), Backend API (NestJS), Aplicación Web Administrativa (React/Vite), Aplicación Móvil de Campo (Flutter).

## 2. Inicialización de Base de Datos (PostgreSQL)

- **Problema Inicial:** Al desplegar el backend, la base de datos PostgreSQL estaba limpia. No existían las tablas dictadas por el esquema de Prisma y no había datos para iniciar sesión.
- **Desafío Técnico:** Intentar ejecutar la sincronización desde la terminal del contenedor del backend en Dokploy arrojaba errores. Esto se debía a que Dokploy iniciaba la sesión en el directorio raíz (`/`) y el comando no tenía acceso automático a las variables del archivo `.env`.
- **Solución Aplicada:**
  1. Navegar a la carpeta de la aplicación dentro del contenedor: `cd /app`
  2. Ejecutar la migración usando `DATABASE_URL` inyectada por el gestor de secretos, nunca escrita en la terminal ni en Git:
     `pnpm exec prisma migrate deploy`
  3. Ejecutar el llenado de datos base con la misma variable inyectada:
     `pnpm exec prisma db seed`
- **Credenciales iniciales:** se rotan fuera de banda y no se documentan. Las cuentas temporales deben exigir cambio de contraseña.

## 3. Resolución de Errores en Frontend Web (React/Vite)

- **Desafío 1: Variables de entorno en compilación.** Vite incrusta estáticamente las variables de entorno dentro del código JavaScript minimizado al momento del empaquetado (`build`). Como Dokploy inyecta estas variables dinámicamente en tiempo de ejecución (runtime), el frontend en producción seguía apuntando erróneamente a `http://localhost`.
  - **Solución inicial:** Se fijó `VITE_API_BASE_URL` como `ENV` en la etapa builder del `Dockerfile`, horneando la URL de producción en el bundle.
  - **Mejora (config en runtime):** El origen del backend ya **no** se hornea en el bundle. Ahora `nginx` sirve dinámicamente `/config.js` con `window.__APP_CONFIG__.apiBaseUrl` inyectado desde la variable de entorno `API_ORIGIN` en el arranque del contenedor (misma variable que alimenta el `connect-src` del CSP, así nunca se desincronizan). `src/config.ts` lee ese valor de runtime con prioridad y solo cae al `VITE_API_BASE_URL` horneado como red de seguridad. **Resultado:** repuntar el backend (p. ej. la migración a HTTPS) es cambiar una sola env var y redeplegar, sin reconstruir la imagen.
- **Desafío 2: Falla silenciosa en el inicio de sesión ("Algo salió mal").** Al ingresar credenciales, la web fallaba inmediatamente sin emitir peticiones de red hacia el servidor.
  - **Causa Raíz (Bug Crítico):** El frontend utiliza la función nativa del navegador `crypto.randomUUID()` para generar identificadores de dispositivo únicos en cada sesión. Por reglas estrictas de seguridad de Google Chrome y derivados, **esta función es bloqueada por completo si el sitio no opera sobre HTTPS**. La función colapsaba de forma sincrónica e invisible, y React atrapaba el error devolviendo el mensaje genérico de falla antes de siquiera llamar al servidor.
  - **Solución:** Se implementó un parche en `src/lib/auth/device.ts` añadiendo un _fallback_ clásico basado en matemáticas (`Math.random()`) capaz de operar correctamente en dominios sobre `http://`.

## 4. Ajustes Críticos en el Backend (NestJS)

- **Problema de CORS:** El navegador bloqueaba las llamadas recibidas de parte del servidor debido a que se emitían desde un subdominio diferente.
  - **Solución:** Modificación directa del archivo `backend/src/main.ts` añadiendo el origen exacto del frontend de producción al arreglo global `CORS_ORIGINS`.
- **Registro de Errores (Logging):** Se parcharon manejadores de errores en el adaptador de almacenamiento de MinIO que se "tragaban" mensajes nativos no tipados (errores lanzados sin estructura de instancia de Error), usando en su lugar un `JSON.stringify(err)` de contención para diagnósticos limpios en la consola.

## 5. El Desafío de Almacenamiento S3 (MinIO)

- **Problema Principal:** NestJS no lograba sincronizarse con MinIO, emitiendo el log de error continuo: `S3 API Requests must be made to API port`.
- **Análisis de Red:** MinIO dispone del puerto `9001` (Consola Web GUI) y el puerto `9000` (API Nativa S3). El primer dominio asignado en Dokploy llevaba exclusivamente al puerto visual. Al intentar configurar el Traefik de Dokploy para abrir un puente hacia el 9000, el enrutador bloqueaba con un `404 page not found`.
- **Solución segura:** MinIO no publica puertos directos del host. La API se expone únicamente mediante HTTPS cuando los enlaces prefirmados lo requieren; la consola queda privada.
- **Variables configuradas en Backend:**
  ```env
  MINIO_ENDPOINT=api-minio.example.invalid
  MINIO_PORT=443
  MINIO_USE_SSL=true
  ```
- **Resultado:** el backend accede mediante TLS y credenciales inyectadas por el gestor de secretos.

## 6. Sincronización del Aplicativo Móvil (Flutter)

- **Alineación productiva:** la URL del API se inyecta por configuración de release y siempre usa HTTPS.
- La aplicación móvil no permite tráfico HTTP claro en builds de producción.

---

### Checklist de Mejoras para Escalabilidad Productiva

Cuando se adquiera el dominio oficial y corporativo para la plataforma (ej. `gestion.futuraseo.com`):

- [ ] Habilitar y certificar con la tecnología Let's Encrypt dentro del panel de dominios de Dokploy.
- [ ] **Frontend Web:** ya no requiere refactor ni rebuild. Basta con setear la env var `API_ORIGIN=https://api.futuragest.co` (o el dominio que aplique) en el panel Environment del contenedor frontend y redeplegar; eso actualiza simultáneamente el `apiBaseUrl` de la SPA (vía `/config.js`) y el `connect-src` del CSP en `nginx`.
- [ ] En el panel Environment del Backend, reajustar las llaves de almacenamiento: cambiar la configuración de MinIO a `MINIO_PORT=443` y `MINIO_USE_SSL=true`.
- [ ] Al poseer encriptado, el fallback matemático desarrollado para generar UUIDs en el Frontend Web dejará de utilizarse de forma automática, activándose nuevamente las APIs modernas nativas de criptografía del navegador Chrome.
