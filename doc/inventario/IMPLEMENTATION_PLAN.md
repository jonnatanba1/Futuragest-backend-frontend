# Plan de implementación y cierre de Inventario

Estado: U1 y consulta U3 completadas; U2, importación U4, U5 y U6 pendientes. Fecha: 8 de septiembre de 2026.

## Objetivo

Cerrar las brechas verificadas del módulo existente y habilitar el control diario de la planilla FT-OPE-02, conservando trazabilidad, restricciones territoriales e integridad del inventario sin conexión. No reconstruir las capacidades que ya existen.

## Orden de ejecución

1. Corregir sincronización del coordinador y estabilizar las pruebas.
2. Acordar las reglas pendientes y unificar documentación.
3. Entregar consulta diaria y exportación de la planilla.
4. Incorporar importación validada de archivos de referencia.
5. Incorporar trazabilidad de entregas y devoluciones por operario, si se confirma ese alcance.
6. Ejecutar aceptación integral y preparar despliegue controlado.

La etapa 1 puede comenzar sin resolver las decisiones de la etapa 2. Las demás deben respetar sus dependencias. Este documento no autoriza importaciones reales, migraciones productivas ni despliegues, y no inicia un flujo SDD.

### Progreso registrado

- ✅ **U1 — Sincronización del coordinador:** backend `60a3fe3` permite `COORDINADOR` en `/inventario/sync` y `/inventario/events/status`; se agregó cobertura del evento zonal y se hicieron deterministas los fixtures de asignación y reloj. Suite focalizada: 12 suites, 96 pruebas pasando.
- ✅ **U3 — Consulta diaria y exportación:** backend `0e55424`/`a4a3743` reconstruye desde `InventoryMovement`, expone JSON y XLSX, y la web `86f4079` agrega filtros por fecha/ubicación/producto, tabla y descarga. Suite backend: 13 suites, 99 pruebas; web: typecheck, build y 12 pruebas pasando. El cierre formal sigue pendiente.
- 🔲 **U2, importación U4, U5 y U6:** sin iniciar. Las decisiones de GPS, despacho municipal, cierre diario formal, histórico y control por operario siguen requiriendo aprobación antes de implementar sus partes dependientes.

## Punto de partida verificado

| Área | Evidencia de la revisión anterior |
| --- | --- |
| Backend | 92/95 pruebas focalizadas pasan. Tres fallan por un fixture sin tipo de ubicación; además utiliza fecha fija sensible a la política temporal. |
| Web | 12/12 pruebas focalizadas de utilidades pasan; no equivalen a aceptación E2E. |
| Flutter | 24/24 pruebas focalizadas pasan, incluyendo reservas, sincronización y cifrado local. |
| Planillas | San Juan, San Pedro y Mutatá: nueve saldos aritméticamente correctos, mínimos en cero y sin validaciones nativas de datos. |
| Producción | No se verificaron versión desplegada, saldos, migraciones ni operación en dispositivos reales. |

Ya existen catálogo, entradas, saldos, mínimos, movimientos, reversos, envíos zonales, recepción, discrepancias, conteos y conciliación. Deben extenderse, no duplicarse.

## Etapa 1 — Restablecer el flujo móvil del coordinador ✅

Prioridad: P0. Dependencias: ninguna decisión de negocio pendiente.

- [x] Habilitar coherentemente `COORDINADOR` en sincronización y consulta de estado, verificando controlador, aplicación, repositorio y consumidores.
- [x] Mantener el alcance por zona, la titularidad de asignaciones y el aislamiento de comandos entre usuarios. No limitar el cambio a agregar un rol al decorador.
- [x] Probar recuperación de comandos del coordinador bloqueados por el rechazo anterior, sin descartar cola ni regenerar identificadores de eventos.
- [x] Actualizar fixtures con el tipo de bodega y usar reloj controlado. Mantener casos explícitos para captura antigua, unidad vencida y asignación inválida.

Aceptación: coordinador registra salida zonal, pierde conexión, reinicia y sincroniza exactamente una vez; no puede afectar otra zona ni leer comandos ajenos. Supervisor municipal mantiene su funcionamiento. Las tres pruebas fallidas quedan resueltas sin debilitar validaciones y las nuevas regresiones pasan.

## Etapa 2 — Cerrar las reglas pendientes

Prioridad: P0 para las funcionalidades afectadas. Entregable: reglas aprobadas y documentos consistentes.

| Decisión pendiente | Propuesta para validar | Consecuencia |
| --- | --- | --- |
| GPS de recepción | Exigirlo en API y móvil, con precisión aceptable definida por negocio; si se necesita excepción, registrarla con motivo y autorización explícita. | Mayor evidencia, pero puede impedir recepción donde no haya señal GPS. No cambiar obligatoriedad sin acuerdo. |
| Despacho municipal | Coordinador de la zona como regla; decidir expresamente si Compras/Administrador conserva una excepción auditada. | Exclusividad refuerza custodia; excepción facilita contingencias. |
| Reporte frente a cierre | Entregar primero una consulta diaria recalculable; confirmar si también se necesita cierre aprobado e inmutable. | Un cierre formal requiere reglas para movimientos offline tardíos y correcciones. |
| Historia importada | Mantener planillas históricas como referencias separadas y usar un corte aprobado para inicializar saldos. | Evita duplicar inventario; reconstruir movimientos históricos requiere evidencia adicional. |
| Control por operario | Confirmar identificación individual, alcance de entregas/devoluciones y tratamiento de pérdidas. | La planilla agrega cantidades: no permite inventar destinatarios históricos. |

- [ ] Consolidar reglas aprobadas en `INVENTARIO_PLAN.md` y alinear `doc/PROJECT_AGENT_HANDOFF.md`.
- [ ] Mantener el mapa propio vigente; no reintroducir Google Maps como parte de este cierre.
- [ ] Traducir cada regla aprobada a validación de servidor y prueba negativa, además del control visual.

## Etapa 3 — Consulta diaria equivalente a la planilla ✅

Prioridad: P1. Dependencias: definición de fecha, corte y clasificación de movimientos en etapa 2.

- [x] Crear una consulta por fecha de operación, municipio/bodega y producto, con permisos territoriales aplicados en servidor.
- [x] Calcular existencia inicial, entradas, salidas, saldo final y mínimo. Las devoluciones, pérdidas, reversos y ajustes se agregan desde el ledger y se exponen en `breakdown`.
- [x] Mantener separados los saldos por ubicación, incluyendo bodegas zonales, municipales y tránsito. Un despacho no aumenta el destino antes de su recepción.
- [x] Usar la fecha de negocio de Colombia, no la fecha de creación técnica del registro, e informar hora de actualización y comandos pendientes.
- [x] Mostrar la consulta en web y exportar un XLSX con las columnas de FT-OPE-02.
- [ ] Si se aprueba cierre formal, añadir aprobación/versionado y tratamiento de movimientos tardíos como una unidad posterior; no congelar silenciosamente una consulta dinámica.

Aceptación: por ubicación/producto, apertura + entradas - salidas, incluyendo ajustes correctamente clasificados, coincide con cierre; el cierre de un día explica la apertura siguiente. Pruebas cubren zona horaria, reversos, recepción parcial, ajustes, día sin movimientos y sincronización tardía. La exportación y la consulta muestran los mismos resultados.

## Etapa 4 — Importación segura de referencias y saldos iniciales

Prioridad: P1. Dependencias: política histórica/corte aprobada; reutilizar la consulta de etapa 3 para conciliación.

- [ ] Detectar formato por contenido: los tres archivos `.xls` suministrados son realmente OOXML. No prometer soporte de XLS binario sin implementarlo y probarlo.
- [ ] Leer fecha, municipio, producto, existencia, ingresos, salidas, saldo y mínimo; ignorar encabezados y filas vacías de plantilla mediante reglas verificables.
- [ ] Mapear nombres a ubicaciones y SKU existentes mediante confirmación explícita. Rechazar referencias desconocidas, inactivas o no habilitadas.
- [ ] Previsualizar filas válidas, errores y diferencias antes de aplicar. Validar cantidades, precisión, fechas, duplicados normalizados y la ecuación del saldo.
- [ ] Recalcular independientemente las cantidades del formato. No ejecutar macros, fórmulas arbitrarias ni enlaces externos; limitar tamaño y filas del archivo.
- [ ] Conservar archivo/hash, fecha fuente, actor, momento de importación y resultado. No sustituir la fecha histórica por la fecha de carga.
- [ ] Separar guardar una referencia histórica de aplicar inventario inicial. No cargar cada planilla diaria como una nueva apertura.
- [ ] Para una apertura autorizada: corte explícito, confirmación de cantidades, transacción atómica, reintentos idempotentes y bloqueo si ya existe historia incompatible. Registrar mínimos por separado según la política aprobada.

Aceptación: los tres archivos se previsualizan correctamente; los nueve saldos coinciden con el cálculo independiente. Reimportar no duplica cantidades. Un error no deja aplicación parcial. Una planilla histórica nunca modifica por sí sola el inventario operativo. Mínimos cero se señalan para revisión, sin inventar umbrales.

## Etapa 5 — Entregas y devoluciones por operario

Prioridad: P1 condicionada a aprobación del alcance. Dependencias: etapas 1 y 2.

- [ ] Extender contratos y modelo para identificar operario y entrega original en eventos nuevos, preservando compatibilidad de registros y aplicaciones anteriores.
- [ ] Vincular devoluciones parciales a la entrega correspondiente, acumulando lo ya devuelto y rechazando excesos en servidor bajo concurrencia.
- [ ] Diferenciar existencia de bodega, material entregado y consumo/pérdida confirmado. No declarar consumo definitivo solo porque existe una salida de bodega.
- [ ] Definir vigencia territorial del operario y quién puede corregir una entrega, sin modificar destructivamente el ledger.
- [ ] Adaptar captura móvil, contexto cifrado y sincronización para operarios y entregas pendientes. Garantizar orden causal cuando entrega y devolución se capturen sin conexión.
- [ ] Mostrar entregado, devuelto y pendiente en web; integrar el resumen diario sin contar dos veces las devoluciones.
- [ ] Conservar los movimientos históricos sin operario como tales; no asignarlos artificialmente durante la migración.

Aceptación: entrega y devolución parcial, múltiples devoluciones, exceso, duplicado, usuario fuera de territorio y entrega aún no sincronizada tienen resultados explícitos y auditables. Reinicio/reconexión no pierden datos ni alteran saldos dos veces.

## Etapa 6 — Aceptación integral y despliegue

Prioridad: puerta obligatoria de salida. Dependencias: etapas acordadas completadas.

- [ ] Ejecutar pruebas focalizadas, análisis estático y compilación de cada aplicación afectada; separar fallos propios de fallos globales preexistentes con evidencia.
- [ ] Ejecutar integración sobre PostgreSQL aislado: concurrencia de salidas, recepción, devoluciones e importación; idempotencia y conciliación ledger/balance.
- [ ] Validar con roles reales de prueba: Compras crea distribución, coordinador recibe, despacha al municipio, supervisor recibe, entrega y devuelve material.
- [ ] Cubrir recepción parcial, faltantes, usuario incorrecto, GPS según política aprobada, saldo insuficiente, pérdida de red, reinicio y reintento después de respuesta perdida.
- [ ] Probar en dispositivo real cifrado, biometría, GPS, actualización de aplicación con cola pendiente y recuperación tras cierre forzado.
- [ ] Inventariar cambios locales existentes antes de integrar. Mantener compatibilidad de contratos y migraciones aditivas cuando corresponda.
- [ ] Antes de publicar: verificar versiones, preparar respaldo y comprobar restauración en entorno aislado. Definir rollback de código y tratamiento de movimientos ya registrados, sin borrar auditoría.
- [ ] Desplegar backend compatible, web y móvil en orden controlado; publicar submódulos antes de actualizar referencias del repositorio raíz. Requiere autorización de ejecución.
- [ ] Realizar piloto en una zona y municipio acordados; verificar migraciones, roles, cola pendiente y conciliación antes de ampliar el uso.

Aceptación final: flujo completo sin pérdida ni duplicación, sin saldos negativos, permisos efectivos en API, referencias y reporte conciliados, pruebas críticas pasando y responsables de operación conformes. La aprobación no se obtiene únicamente contando pruebas unitarias.

## Unidades de entrega

Cada unidad debe incluir comportamiento, pruebas y documentación asociada. Si requiere varios repositorios, mantener contratos compatibles y documentar el orden de integración. No agrupar commits solo por tipo de archivo.

| Unidad | Resultado | Límite de reversión |
| --- | --- | --- |
| U1 | Sincronización coordinador + fixtures deterministas | Revertir autorización/cliente sin eliminar outbox ni eventos existentes. |
| U2 | Políticas aprobadas y validaciones consistentes | Revertir la política versionada sin borrar evidencia capturada. |
| U3 | Consulta diaria y exportación | Retirar interfaz/consulta sin modificar ledger. |
| U4 | Importación previsualizada e idempotente | Deshabilitar nuevas importaciones; corregir efectos aplicados mediante proceso auditable, no borrado. |
| U5 | Trazabilidad por operario | Mantener lectura de datos y compatibilidad de eventos nuevos; detener captura nueva si fuera necesario. |
| U6 | Evidencia de aceptación y piloto | Detener ampliación y usar versiones compatibles con datos ya persistidos. |

Registrar por unidad los comandos ejecutados, sus resultados, escenario funcional, limitaciones y rollback. Usar Conventional Commits, sin atribución de IA. No activar ni cambiar el modo de revisión del usuario.

## Siguiente paso

Comenzar por U1. Antes de U2, resolver las decisiones de negocio una por una; no asumir que este plan constituye su aprobación.
