# Plan de corrección de lógica: inventario, GPS y sincronización

**Estado: L0–L4 implementadas: backend `1bca0dd`, `9b889e6`, `1859731`, `b2d6a0e`, `b5fd9dc` y Flutter `6af27f2`; L5–L8 pendientes. Fecha: 8 de septiembre de 2026.**

**Conclusión:** no liberar el flujo como cerrado hasta corregir idempotencia, clasificación de errores, aprobaciones y reconciliación móvil. La captura nueva exige GPS, pero esa condición todavía no se conserva de extremo a extremo. Los cinco fallos iniciales comparten dependencias; corregirlos aisladamente dejaría vías de inconsistencia.

Este documento complementa el [plan general](D:/DEV/futuragest/doc/inventario/IMPLEMENTATION_PLAN.md). No autoriza cambios en producción, importaciones, reparación masiva de datos ni despliegues. No inicia SDD. Las reglas técnicas siguientes son la propuesta concreta de implementación; no se presentan como funcionalidades existentes.

## 1. Ruta rápida y alcance

Orden recomendado:

1. Preparar pruebas aisladas, inventariar versiones y proteger los datos existentes.
2. Separar reconocimiento de reintentos de validación de operaciones nuevas.
3. Corregir sincronización y recepción, incluyendo concurrencia y respuestas perdidas.
4. Cerrar las vías de aprobación sin GPS o fuera del territorio autorizado.
5. Recuperar la evidencia original y publicar el estado efectivo de cada comando.
6. Hacer converger cola, reservas y contexto del móvil.
7. Clasificar los registros afectados, ensayar recuperación y ejecutar aceptación integral.

### Avance de ejecución

- ✅ **L0 — Base segura:** el setup de integración aborta antes de limpiar, migrar o sembrar si `.env.test` no apunta exactamente a `futuragest_test`. La configuración actual apunta a `futuragest_dev`, por lo que la integración queda bloqueada hasta crear el entorno aislado. Se añadieron pruebas del guardrail.
- ✅ **L1 — Replay y contratos:** el sync conserva el resultado de replays v1 sin GPS solo cuando pertenecen al mismo actor y coinciden con el hash canónico original; no permite crear capturas nuevas sin GPS. Errores del repositorio se propagan para reintento y comandos incompletos ya no se confunden con nuevos.
- ✅ **L3 — Recepción atómica:** el reintento de una recepción parcial ya reproduce el resultado original antes de evaluar pendientes o alcance actual; exige coincidencia de actor, tipo, hash, comprobante y envío. GPS faltante solo puede reproducir un resultado histórico idéntico; nunca crear una recepción nueva.
- ✅ **L2 — Errores y lotes:** conflictos idempotentes se aíslan por evento; errores temporales conservan el reintento. El móvil mantiene resultados parciales válidos, cuarentena JSON local corrupto y separa 401 de 403.
- ✅ **L4 — Aprobación segura:** una aprobación exige GPS original válido y usa exclusivamente la ubicación/zona original, activa y autorizada; la resolución no admite reemplazo de ubicación.
- 🔶 **Siguiente:** L5 — proyectar evidencia GPS y estado efectivo para consultas/auditoría. L6–L8 siguen pendientes.

**Incluido:** los cinco fallos, sus dependencias verificadas y una estrategia de recuperación compatible con aplicaciones anteriores. **Fuera del cambio principal:** parser de planillas, entregas por operario, cierres diarios formales, reconstrucción histórica y cambios generales de permisos. La extensión de GPS a acciones administrativas se delimita en la sección 12; no debe quedar oculta bajo la afirmación «cada registro tiene GPS».

## 2. Evidencia y límites de la revisión

Base inspeccionada: backend `5fb5f2f`, Flutter `7168db1` y web `59a263d`, además de cambios móviles locales preexistentes. Esos cambios deben inventariarse antes de implementar, no sobrescribirse.

Pruebas ejecutadas en la revisión precedente sobre esta base: **105 unitarias backend, 24 de inventario Flutter y 12 utilitarias web, todas pasando**. No cubren todos los escenarios descritos. Los cinco fallos iniciales se reprodujeron ejecutando métodos reales con dependencias simuladas, sin conectar a una base real. No se verificaron ocurrencias ni cantidades afectadas en producción. No hubo pruebas en dispositivos reales.

### 2.1 Fallos iniciales

| ID / prioridad | Causa y reproducción | Efecto | Corrección principal |
| --- | --- | --- | --- |
| F1 / P1 | `SyncInventoryUseCase.execute` captura errores inesperados de repositorio y los transforma en `INVALID_EVENT`. Un error temporal simulado termina en `REJECTED_CLIENT_ACTION`. | Flutter conserva el archivo, pero deja de reintentar el registro; no equivale a borrado físico. | Separar errores de entrada, negocio, conflicto e infraestructura. |
| F2 / P1 | Una recepción de 6/10 ya aplicada se reenvía tras perder su respuesta. Se calcula 6 anteriores + 6 reenviados antes de consultar idempotencia. | Devuelve `RECEIPT_EXCEEDS_PENDING` aunque el reintento sea idéntico. | Reconocer el comando primero; validar pendientes solo en una operación nueva. |
| F3 / P2 | Al aprobar una captura con GPS, el movimiento queda vinculado al comando `RESOLUTION`, cuyo payload no contiene el GPS original. | La auditoría devuelve `gpsEvidence: null`; la evidencia existe, pero no se presenta. | Resolver la procedencia de la evidencia sin cambiar el autor de la aprobación. |
| F4 / P1 | Una captura histórica `NEEDS_REVIEW` sin GPS puede aprobarse; el flujo verifica producto/unidad/cantidad, no la evidencia. | Modifica existencias incumpliendo la política actual. | Clasificar impedimentos no subsanables por aprobación y bloquear el efecto contable. |
| F5 / P2 | GPS obligatorio se valida antes de consultar un resultado persistido. El reenvío antiguo sin GPS no llega al repositorio. | Resultado falso de rechazo; el estado local puede divergir del servidor. | Compatibilidad de lectura/replay histórica, sin permitir nuevas operaciones sin GPS. |

F1 y F2 preceden al último cambio GPS. F3 y F5 están relacionados con la nueva vista/política; F4 es una brecha en la adaptación de aprobaciones. Que un dato histórico fuera admisible antes no autoriza inventarle evidencia ahora.

### 2.2 Dependencias adicionales que deben resolverse en el mismo programa

| ID | Hallazgo y evidencia | Regla de solución |
| --- | --- | --- |
| C1 / P1 | `resolveCommand` filtra el comando original por territorio, pero acepta `input.locationId` sin verificar esa ubicación. Reproducción con repositorio real simulado: coordinador de zona A termina escribiendo en ubicación Z. | Autorizar también la ubicación efectiva, activa y habilitada, antes de modificar saldo. |
| C2 / P1 | La recepción de un envío cerrado devuelve `ShipmentReceipt.result` por ID del cliente sin comparar actor, payload y envío de ese recibo. Reproducción con repositorio real simulado: retorna el resultado de otro envío/actor aunque cambien cantidad y GPS. | Un único camino de replay autenticado para envíos abiertos y cerrados. |
| C3 / P2 | La resolución actualiza `original.status`, pero no el JSON `original.result`; `findStatuses` devuelve ese JSON anterior. Reproducción: persistencia `RESOLVED_APPLIED`, consulta `NEEDS_REVIEW`. | Separar respuesta inicial inmutable de estado efectivo y resolución vigente. |
| C4 / P1 | `reserveCommand` puede representar un duplicado sin resultado como `existingResult: undefined`; el consumidor lo interpreta como nuevo. | Resultado discriminado `NEW / REPLAY / INCOMPLETE`, nunca inferido por truthiness. |
| C5 / P2 | En Flutter, `_isQueued` excluye `REJECTED`, pero el estado real es `REJECTED_CLIENT_ACTION`; además `loadOutbox` conserva `ACKED`. Lectura de código: una recepción parcial confirmada puede mantener deshabilitada la siguiente. | Distinguir historial, operación aún no confirmada y contexto no actualizado. |
| C6 / P1 | Las reservas locales excluyen `ACKED` y `NEEDS_REVIEW`; actualizar el saldo cacheado es otra operación. El transporte mezcla solicitudes y puede perder respuestas ya recogidas cuando falla una posterior. | No liberar incertidumbre como stock disponible; confirmar estado y snapshot coherentes. |
| C7 / P1 | Finalizar/reliberar filas de outbox usa solo ID, sin comprobar el propietario vigente del lease. | Un worker vencido no puede sobrescribir el resultado de otro. Prueba concurrente obligatoria. |
| C8 / P1 de entorno | El setup de integración carga `.env.test` sin comprobar su error y luego limpia usuarios, migra y ejecuta seed. | No ejecutar integración hasta incorporar y verificar una barrera explícita de base aislada. |

C5–C8 se identificaron por lectura de rutas y estados; no se afirma que se hayan observado en un dispositivo o servidor productivo. Deben incorporarse pruebas que fallen antes de aplicar sus correcciones.

Referencias verificadas en la base inspeccionada:

- F1/F5: [clasificación de errores](D:/DEV/futuragest/backend/src/modules/inventario/application/sync-inventory.use-case.ts#L147) y [validación GPS previa al replay](D:/DEV/futuragest/backend/src/modules/inventario/application/sync-inventory.use-case.ts#L80).
- F2/C2: [validación del acumulado](D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/scoped-inventory-operations.repository.ts#L1616) y [atajo de envío cerrado](D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/scoped-inventory-operations.repository.ts#L1585).
- F3/F4/C1: [lectura GPS del comando inmediato](D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/scoped-inventory-operations.repository.ts#L792), [datos usados al aprobar](D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/scoped-inventory-operations.repository.ts#L893) y [ubicación efectiva](D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/scoped-inventory-operations.repository.ts#L897).
- C3/C4: [consulta del JSON de resultado](D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/prisma-inventory-command.repository.ts#L259) y [reserva con resultado opcional](D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/scoped-inventory-operations.repository.ts#L280).
- C5/C6/C7: [bloqueo de recepción móvil](D:/DEV/futuragest/frontend_flutter/lib/features/inventory/presentation/inventory_screen_widgets.dart#L162), [reservas](D:/DEV/futuragest/frontend_flutter/lib/features/inventory/data/inventory_database.dart#L318) y [finalización de filas](D:/DEV/futuragest/frontend_flutter/lib/features/inventory/data/inventory_database.dart#L479).
- C8: [setup de integración con limpieza y migraciones](D:/DEV/futuragest/backend/src/database/jest-global-setup.ts#L18). No se ejecutó durante esta revisión.

## 3. Reglas invariantes

Estas reglas son obligatorias para aceptar la corrección técnica:

### Identidad, permisos e idempotencia

- **R01.** Un evento conserva su ID, payload original, versión, hora, GPS y hash durante todos los reintentos. Reintentar no es volver a capturar.
- **R02.** Mismo ID + mismo actor + mismo tipo/recurso + mismo payload canónico compatible implica el mismo efecto, aplicado como máximo una vez.
- **R03.** Mismo ID con actor, envío, tipo, cantidad, GPS o payload diferente implica conflicto, cero escrituras adicionales y ninguna filtración del resultado ajeno.
- **R04.** Autenticación y comprobación de propiedad anteceden a devolver información persistida. Para una operación nueva se comprueban además permisos actuales y territorio del recurso efectivo.
- **R05.** Consultar el estado mínimo de un comando propio no depende de que la asignación original siga vigente. No concede acceso actual a otras bodegas ni a evidencia ajena.
- **R06.** La validación del estado mutable —saldo, pendiente, asignación, envío abierto— se ejecuta después de distinguir un replay de una operación nueva. No se omite para operaciones nuevas.
- **R07.** `INCOMPLETE` no es `NEW`, ni `APPLIED`, ni una aprobación pendiente inventada. Debe conservarse para recuperación controlada, sin repetir efectos a ciegas.

### GPS y auditoría

- **R08.** Una nueva captura operativa móvil o recepción requiere latitud, longitud y precisión finitas; latitud entre -90 y 90, longitud entre -180 y 180 y precisión no negativa. El control está en dominio/servidor además de DTO y UI.
- **R09.** No se sustituyen datos faltantes por cero, coordenadas de la bodega, ubicación del aprobador o ubicación del próximo reintento. Un cero real dentro del rango no se rechaza solo por ser cero.
- **R10.** No tener internet no equivale a no tener GPS. Se puede guardar cifrado sin red si existe una captura GPS válida; sin ella no se confirma la nueva operación.
- **R11.** GPS ausente o inválido es impedimento de aprobación. Una revisión humana no convierte ausencia de evidencia en presencia.
- **R12.** La evidencia pertenece al evento y al momento que la generaron. GPS de captura y GPS de una acción administrativa posterior, si se incorpora, son campos/conceptos distintos.
- **R13.** No se altera un movimiento histórico ni su payload para «corregir» una pantalla. La vista obtiene la evidencia mediante relaciones verificables y explicita su procedencia.
- **R14.** GPS aporta ubicación reportada y precisión; no prueba por sí solo identidad, entrega física ni ausencia absoluta de suplantación. No presentar validación numérica como certificación antifraude.

### Existencias, estados y recuperación

- **R15.** Comando, movimientos, saldo, acumulados de recepción y resolución se confirman atómicamente. Notificaciones u otros efectos externos no se ejecutan dentro de un retry transaccional susceptible de repetirse.
- **R16.** Saldo no negativo y cantidades exactas con seis decimales; no usar `double` como autoridad contable. Un reintento no incrementa versiones de saldo ni crea nuevos movimientos.
- **R17.** Un error temporal o resultado desconocido nunca se convierte en rechazo definitivo del registro. No borrar la cola ni regenerar IDs para desbloquearla.
- **R18.** Un conflicto permanente se aísla y muestra para acción humana; no bloquea indefinidamente los demás eventos del lote.
- **R19.** La cola separa «guardado local», «confirmado por servidor», «en revisión» y «resuelto». El éxito de transporte no equivale a aplicación contable.
- **R20.** Solo el worker con lease vigente puede finalizar, bloquear o reprogramar su fila. Una respuesta tardía no puede regresar `ACKED` a `PENDING`.
- **R21.** La recuperación de datos se clasifica y ensaya antes de ejecutarse; jamás se hace un `reset` masivo de rechazados, saldos o historial.

## 4. Contrato de procesamiento y errores

### 4.1 Orden común para escrituras idempotentes

1. Autenticar sesión y verificar el rol permitido por la ruta. Limitar tamaño del cuerpo/lote.
2. Leer un sobre estructural seguro: ID, versión conocida, tipo y recurso. No aplicar todavía políticas nuevas a una captura histórica.
3. Construir el payload con el canonicalizador de su versión. Mantener exactamente las reglas v1: decimales, fechas, campos omitidos, orden de arrays y defaults originales. No añadir GPS ni cambiar el hash almacenado.
4. Consultar el comando existente por clave única. Comparar actor, tipo, recurso y hash; si no coinciden, responder conflicto sin devolver datos ajenos.
5. Si existe y está completo: devolver la respuesta de la operación ya registrada. Si está incompleto: devolver indisponibilidad recuperable con código específico y alertar; no continuar como nuevo.
6. Si no existe: validar GPS y políticas vigentes de nueva operación. No usar `capturedAtUtc` suministrado por el cliente como prueba suficiente para eludir la política actual.
7. En transacción serializable, reservar el comando con unicidad y **volver a comprobar** el caso duplicado si otro proceso ganó la carrera.
8. Validar dentro de la transacción los datos mutables y autorizaciones efectivas; aplicar cambios y guardar resultado juntos.
9. Responder solo después del commit. Si se desconoce el resultado del commit, conservar el mismo ID y resolver mediante replay/consulta, no mediante recaptura.

Una lectura previa mejora el replay, pero no sustituye la restricción única ni el control dentro de la transacción. Los reintentos serializables repiten la transacción completa con límite; agotarlo produce un error recuperable, no `INVALID_EVENT`.

**Transporte histórico:** los DTO de recepción deben permitir que el sobre de replay antiguo llegue al dominio. Eso no significa declarar GPS opcional para capturas nuevas. Separar tipos de entrada histórica, captura nueva validada y resultado de lookup. Probar `/sync` y `/shipments/:id/receipts`; no resolver F5 solo en uno.

**Versiones:** conservar v1 y sus fixtures dorados. Cualquier futuro cambio de canonicalización o evidencia obligatoria nueva se versiona explícitamente y se publica primero en servidor. Versionar no permite aceptar nuevas operaciones sin GPS.

### 4.2 Clasificación propuesta de resultados

| Situación | Servidor | Cliente / recuperación |
| --- | --- | --- |
| Sobre/lote ilegible o fuera de límites | HTTP 400 `INVALID_BATCH` con detalle seguro. | No repetir el mismo lote infinito; aislar estructura defectuosa, conservar diagnóstico. |
| Evento legible con validación determinista fallida | Resultado por evento `REJECTED_CLIENT_ACTION` y código específico, por ejemplo `GPS_REQUIRED`, `GPS_INVALID`, `INVALID_QUANTITY`. | Conservar original; mostrar acción necesaria. No cambiar automáticamente payload/ID. |
| Operación válida aplicada | `APPLIED`, ID de comando, movimientos y hora original del servidor. | Confirmar exactamente esa fila; reconciliar saldo/contexto. |
| Captura válida que requiere revisión | `NEEDS_REVIEW`, comando persistido y razones explícitas. | No reenviar como nueva; consultar evolución del estado. |
| Clave reutilizada con contenido/actor diferente | En sync, rechazo identificado por evento con `IDEMPOTENCY_KEY_REUSED`; ruta individual, HTTP 409 con el mismo código. | Aislar ese evento como conflicto que exige atención; continuar otros. No revelar payload/resultado previo ni reasignar ID. |
| Desconexión, timeout, 429, indisponibilidad, conflicto serializable agotado | Respuesta transitoria; HTTP 503 para indisponibilidad conocida, 500 para error inesperado, sin disfrazarlo de entrada inválida. | Mismo payload/ID, backoff con jitter y `Retry-After` cuando proceda. |
| Resultado ausente, incompleto o mal formado | Nunca fabricar un resultado final. | Mantener incertidumbre/reintento; alerta tras umbral, sin purgar. |
| Sesión inválida/expirada | HTTP 401 o código de autenticación explícito. | `BLOCKED_AUTH`; reanudar solo con sesión del dueño. |
| Rechazo de negocio/autorización del recurso | HTTP 403/409 con código estable. | No tratar toda denegación como sesión expirada ni todos los 409 como el mismo fallo. |

La clasificación por evento del conflicto en `/sync` cambia deliberadamente el comportamiento actual de HTTP 409 global. Deben actualizarse pruebas de contrato y verificarse clientes anteriores: ya entienden `REJECTED_CLIENT_ACTION`, pero no se debe suponer compatibilidad sin probarla.

Para F1 se recomienda **no introducir un estado nuevo de sincronización solo para fallos temporales**: propagar 5xx conserva el mecanismo de retry existente. Un lote puede tener commits anteriores al error; todos los reenvíos deben ser seguros. El móvil mejorado conserva los resultados de solicitudes independientes ya recibidos en lugar de descartarlos si falla la siguiente.

## 5. Reglas específicas por flujo

### 5.1 Recepciones: F2, F5, C2 y C4

- Usar la clave del comando como autoridad idempotente también cuando el envío esté cerrado, devuelto o haya cambiado de estado. Eliminar el atajo que devuelve un recibo solo por `clientCommandId`.
- Comprobar que el recibo encontrado pertenece al mismo comando, envío y actor; comparar hash antes de responder.
- Mismo recibo ya aplicado: devolver resultado original sin volver a evaluar el pendiente ni volver a exigir GPS nuevo.
- Nuevo recibo: receptor autorizado, separación de funciones, destino autorizado/habilitado, envío abierto y ubicación de tránsito válida.
- Por línea: producto del envío correcto, IDs no duplicados, cantidades no negativas, suma enviada positiva y exacta.
- Invariante por ítem: `recibido acumulado + dañado acumulado + faltante acumulado <= despachado`. Evaluar en la misma transacción que incrementa acumulados y cambia saldos.
- Misma clave concurrente: un solo efecto. Claves diferentes contra el mismo pendiente: serialización/reintento completo; ninguna puede usar un pendiente desactualizado.
- Comando duplicado incompleto o relación recibo/comando inconsistente: detener efectos y derivar a recuperación; no inventar un recibo ni devolver éxito.
- No cambiar el orden canónico de líneas para registros v1. Una mejora para considerar equivalentes arrays reordenados requeriría una versión nueva.

### 5.2 Aprobaciones: F4, C1, C3 y C4

La aprobación no debe significar «omitir todas las validaciones que fallaron en captura».

| Condición | Resultado permitido |
| --- | --- |
| GPS original ausente, parcial, no finito o fuera de rango | Bloquear `APPROVE` con código específico; permitir descarte auditado. |
| GPS válido pero revisión por precisión, antigüedad o verificación local | Mantener pendiente; permitir solo la excepción expresamente definida para esa razón y registrar justificación. No autoaprobar. |
| Ubicación efectiva ajena, inactiva o no habilitada | Bloquear. Verificar con el scope del aprobador, aunque el comando original sea visible. |
| Cantidad/producto/unidad inválidos | Bloquear; una ubicación alternativa no corrige estos datos. Validar vigencia de la unidad en la fecha original, sin sustituir conversiones históricas. |
| Saldo insuficiente para una salida/pérdida | Mantener sin efecto contable; no crear saldo negativo. |
| `DISMISS` autorizado | Registrar motivo y resolución sin movimiento; no requiere inventar GPS de la captura descartada. |
| Mismo comando de resolución reenviado | Respuesta de esa resolución, sin reevaluar el original como si siguiera pendiente. |
| Nueva clave intenta otra resolución de un original ya resuelto | Conflicto `ALREADY_RESOLVED`; no devolver silenciosamente el resultado de otro comando. |

- Mantener la relación única de resolución y una transición condicional desde `NEEDS_REVIEW` dentro de transacción. Aprobar/aprobar o aprobar/descartar concurrentemente debe producir un solo ganador.
- El backend debe exponer motivos y `canApprove`/impedimentos derivados de reglas compartidas para la UI. Ocultar un botón no sustituye la protección del endpoint.
- Separar motivo de revisión original de motivo de resolución; no perder la razón por la cual el evento quedó pendiente.
- Revalidar territorio y ubicación bajo la transacción; no aceptar libremente `input.locationId` ni ampliar permisos de coordinador.

### 5.3 Evidencia y estado efectivo: F3 y C3

**Propuesta mínima:** aprovechar las relaciones existentes `InventoryCommand.resolvedCommand`, `resolutionCommand` e `InventoryMovement.sourceMovement`; no duplicar GPS en todas las filas ni modificar payloads para resolver un problema de lectura.

Procedencia de la evidencia:

1. Movimiento de captura/recepción directa: evidencia del comando que lo creó.
2. Movimiento creado por resolución: evidencia del comando original relacionado mediante `resolvedCommand`.
3. Reverso: mostrar por separado el movimiento revertido y su evidencia original; nunca etiquetarla como GPS de la acción de reversión.
4. Referencia rota, histórica sin GPS o tipo administrativo sin captura: estado explícito, no valores sustitutos.

Agregar una proyección tipada de auditoría con `originCommandId`, `originActorUserId`, `originCapturedAtUtc`, `source`, `gpsStatus` y coordenadas/precisión cuando existan. Mantener separado `command.actorUserId`, que sigue identificando al ejecutor de la resolución. Conservar compatibilidad del campo actual `gpsEvidence` durante la transición. Estados como `PRESENT`, `MISSING`, `INVALID` y `NOT_CAPTURED_FOR_ACTION` describen hechos, no un certificado de autenticidad.

La consulta debe tener joins/proyecciones acotados, sin N+1 y sin devolver payloads íntegros. La autorización del movimiento y del acceso a evidencia histórica se comprueba explícitamente. No usar coordenadas del catálogo como fallback.

**Estado efectivo:** preservar el resultado inicial como recibo de la operación; agregar una proyección versionada de estado/resolución para que el móvil pueda distinguir:

| Estado persistido | Estado efectivo para consulta | Efecto esperado |
| --- | --- | --- |
| `APPLIED` | Aplicado | Movimientos del comando original. |
| `NEEDS_REVIEW` | Pendiente de revisión | Sin afirmar aplicación. |
| `RESOLVED_APPLIED` | Aplicado por resolución | ID y movimientos de la resolución, autor y fecha de resolución. |
| `RESOLVED_DISMISSED` | Descartado | Cero movimientos de resolución. |
| `RECEIVED` sin resultado | Incompleto | Sin inventar aprobación o rechazo. |

`/events/status` debe cubrir también comandos de recepción propios: sus resultados individuales no contienen necesariamente `clientEventId`, por lo que el servidor debe proyectarlo desde `clientCommandId`. Respuesta inicial y estado efectivo no pueden contradecirse sin explicar que hubo una resolución posterior. No sobrescribir recibos históricos para simular que la aprobación ocurrió en la captura.

## 6. Máquina de estados móvil y coherencia de existencias

### 6.1 Estados y acciones

| Estado local | Enviar captura | Consultar estado | Reserva/acción UI |
| --- | --- | --- | --- |
| `PENDING` | Sí, cuando corresponde el backoff. | Ante resultado incierto. | Mantener reserva de salidas; impedir duplicar la misma recepción pendiente. |
| `IN_FLIGHT` | Solo propietario del lease; reclamar tras vencimiento. | Ante resultado incierto. | Misma protección que pendiente. |
| `BLOCKED_AUTH` | No, hasta sesión correcta. | No con otro usuario. | Mantener protección y avisar. |
| `NEEDS_REVIEW` | No reenviar como nueva. | Sí, en sincronización/reanudación. | No presentar como aprobado; mantener protección conservadora hasta conocer efecto/resolución. |
| `ACKED` | No. | Solo reconciliación necesaria. | Historial; no bloquear para siempre nuevas recepciones. Mantener protección temporal si el snapshot aún no incorpora el efecto. |
| `REJECTED_CLIENT_ACTION` | No automáticamente. | Sí en recuperación selectiva de fallos históricos. | Mostrar rechazo/conflicto; no etiquetar como pendiente de envío. |
| Resolución descartada / conflicto / recuperación requerida | No automáticamente. | Según su protocolo. | Estados explícitos propuestos; conservar evidencia y acción humana. |

Usar constantes/enums compartidos en las capas Dart; eliminar comparaciones con estados inexistentes como `REJECTED`. Los estados nuevos requieren migración local aditiva y lectura compatible: nunca recrear la base cifrada.

### 6.2 Reglas de ejecución y convergencia

- Procesar cada resultado identificado independientemente; una respuesta inválida, un JSON corrupto o una recepción fallida no debe inutilizar los vecinos sanos.
- Validar el ID y estructura de resultados antes de cambiar estado. IDs duplicados contradictorios, ajenos al lote o respuestas incompletas no generan confirmaciones arbitrarias.
- Persistir resultados válidos de solicitudes independientes antes de enviar la siguiente, o devolver un conjunto de resultados parciales tipados; no descartar un `APPLIED` recibido porque otra llamada terminó en 503.
- Finalización, bloqueo y reintento deben comparar `clientEventId`, dueño, estado y token de lease vigente. Si el token ya no coincide, el worker tardío no escribe.
- Verificar que la sesión usada por sincronización pertenece al dueño de la base/cola. No enviar datos de A con el token de B tras cambio de usuario.
- Una recepción parcial `ACKED` no bloquea una recepción nueva después de confirmar el contexto con pendiente actualizado. Antes de esa reconciliación, mostrar «actualizando pendiente», no permitir contar dos veces sobre cache vieja.
- `REJECTED_CLIENT_ACTION` no equivale a una nueva oportunidad automática: primero explicar el error, comprobar que no hubo efecto y luego, si corresponde, capturar una operación nueva legítima con GPS nuevo.

### 6.3 Reservas y snapshot: no resolverlo solo cambiando una lista de estados

Actualmente confirmar un evento y refrescar contexto son operaciones distintas. Excluir inmediatamente un `ACKED` de reservas con cache vieja puede volver a ofrecer existencia ya entregada; restarlo permanentemente de un snapshot actualizado la descontaría dos veces.

**Diseño recomendado:** refresco de contexto con estados de un conjunto acotado de IDs, balances y versiones obtenidos de una vista consistente del servidor, identificado por `snapshotId`/versión. Aplicar contexto y reconciliación de esos eventos en una única transacción local. `serverTime` de reloj por sí solo no demuestra qué movimientos contiene el saldo.

- Un débito pendiente/desconocido se protege de forma conservadora hasta que el servidor indique si su efecto está incluido.
- Un débito aplicado incluido en el snapshot no se resta otra vez. Un pendiente de revisión sin efecto no se presenta como material nuevamente disponible sin resolución/regularización explícita.
- No acreditar devoluciones o recepciones inciertas como existencia confirmada.
- Si falla el refresco después del ACK, conservar el ACK y la protección temporal; no regresar el evento a captura pendiente ni liberar stock a ciegas.
- Cálculos de UI y comprobación de guardado deben compartir representación decimal exacta y política de reserva. La validación final sigue siendo del servidor.
- Limitar IDs/lotes y paginar sin mezclar snapshots incompatibles. Respuestas fuera de orden no reemplazan una versión de saldo más reciente.

Este diseño es más trabajo que añadir `NEEDS_REVIEW` a un filtro, pero evita tanto exceso de disponibilidad como descuentos duplicados. Es dependencia de la aceptación offline, no una optimización opcional.

## 7. Recuperación de registros ya afectados

No se conoce todavía cuántos registros cumplen cada caso. Preparar un diagnóstico de solo lectura y un simulador/dry-run; ejecutar sobre datos reales solo con autorización separada.

| Caso comprobado | Tratamiento |
| --- | --- |
| Rechazado local `INVALID_EVENT`, servidor ya tiene comando propio aplicado/resuelto | Conciliar mediante estado autenticado; conservar payload y anexar evidencia de recuperación, sin nuevo movimiento. |
| Rechazado local ambiguo, servidor no tiene comando, payload/GPS válidos | Candidato a reenvío del mismo ID tras revisión de reglas actuales y dry-run. No asumir que todos los `INVALID_EVENT` fueron fallos temporales. |
| Servidor no tiene comando y falta GPS | Cuarentena/documentación del incidente; no fabricar GPS ni reenviar como captura nueva válida. |
| Recibo parcial rechazado por pendiente pero comando ya aplicado | Recuperar resultado por identidad/hash correctos; confirmar local y refrescar pendientes. |
| Pendiente histórico sin GPS | Bloquear aprobación; descarte auditado o procedimiento de regularización autorizado por separado. |
| Histórico ya aplicado sin GPS | Conservar efecto/historia; marcar ausencia real. No revertir automáticamente ni «completar» coordenadas actuales. |
| Comando duplicado sin resultado | Inspeccionar comando, ledger, saldo, recibo y relaciones en entorno controlado; no convertir en nuevo. Reparación caso a caso, transaccional e idempotente. |
| Hash/actor/recurso incompatibles | Conflicto de integridad; no reintentar ni reasignar propietario/ID. |

Procedimiento de recuperación:

1. Capturar manifiesto de versiones y respaldo autorizado; verificar restauración aislada antes de escrituras.
2. Clasificar por tipo, dueño, estado local/servidor, hash y existencia de efectos; no registrar GPS/payload completo en logs generales.
3. Producir conteos, IDs afectados y resultado esperado de cada acción en dry-run. Acceso restringido a esa evidencia.
4. Conciliar movimientos contra saldos y acumulados de recibos antes y después. Mantener exactamente el inventario salvo regularización autorizada explícitamente.
5. Procesar lotes pequeños con ID único de recuperación, actor, razón, fecha y resultados auditables; un reintento de recuperación tampoco duplica efectos.
6. Comprobar que una recuperación ejecutada dos veces produce cero cambios adicionales la segunda vez.

Una regularización por conteo actual, si se aprueba, es una operación distinta: evidencia actual, referencia al incidente, cantidades verificadas y control contra duplicidad. No es reescribir la captura histórica ni trasladar su fecha.

## 8. Unidades de implementación y dependencias

Cada unidad incluye comportamiento, regresiones y documentación, con Conventional Commits si se solicita integrar commits. No separar «código» y «tests» en entregas que no se sostienen solas. No activar automáticamente el modo de revisión del usuario.

| Unidad | Trabajo concreto | Dependencias | Criterio de terminación / reversión |
| --- | --- | --- | --- |
| L0 — Base segura ✅ | Inventariar cambios locales; conservar fixtures v1; añadir pruebas reproductoras y barreras del entorno de integración. | Ninguna. | Implementado en `1bca0dd`: la integración aborta antes de escribir si el destino no es `futuragest_test`. Revertible sin tocar datos. |
| L1 — Replay y contratos ✅ | Separar sobre histórico/captura validada; modelar `NOT_FOUND/REPLAY/INCOMPLETE`; checks de actor y hash; mantener canonicalización v1. | L0. | Implementado en `1bca0dd`: replays idénticos no tienen efecto nuevo y los incompletos no pasan como nuevos. Validación de recurso para recepciones/resoluciones queda en L3/L4. |
| L2 — Errores y lotes ✅ | F1, errores tipados, 5xx recuperables, conflictos por evento, respuestas parciales y códigos estables en transportes. | L1. | Implementado en backend `1859731` y Flutter `6af27f2`: conflictos se aíslan, 401 no se confunde con 403 y resultados ambiguos se reintentan. |
| L3 — Recepción atómica ✅ | F2/F5/C2/C4; camino único de replay; pending bajo transacción; retry serializable acotado y separación de funciones. | L1. | Implementado en `9b889e6` y `b5fd9dc`: caso 6/10, replay legado sin GPS y comprobantes cerrados se validan por identidad completa antes de devolver resultados; el helper genérico tampoco reejecuta comandos incompletos. Falta prueba de concurrencia PostgreSQL aislada en L8. |
| L4 — Aprobación segura ✅ | F4/C1; validar GPS original, ubicación efectiva, cantidad/unidad; transición condicional y replay de resolución. | L1. | Implementado en `b2d6a0e`: GPS original válido, ubicación/zona inmutables, activas y en alcance; replays de resolución validan identidad completa. Falta concurrencia PostgreSQL aislada en L8. |
| L5 — Evidencia y estado | F3/C3; joins de procedencia, proyección de resolución, consulta de estado para capturas/recibos, UI de impedimentos y evidencia. | L3–L4. | Captura y aprobador separados; estado converge; sin N+1/payload bruto. Retirar vista no altera ledger. |
| L6 — Cola y snapshot | C5–C7; estados tipados, lease fencing, aislamiento de usuario, reconciliación atómica de contexto/efectos, bloqueo temporal correcto de recibos. | L2–L5. | Respuesta perdida, worker tardío, cache vieja y aprobación remota no pierden ni duplican disponibilidad. Reversión conserva DB cifrada y lectores compatibles. |
| L7 — Recuperación | Diagnóstico/dry-run, mapeo de rechazados, cuarentena sin GPS, conciliación y bitácora de reparación. | L3–L6. | Ensayo repetible en copia aislada; cero efectos duplicados. Detener lotes es el rollback, no borrar historial. |
| L8 — Aceptación y liberación | Integración PostgreSQL, pruebas móviles/web, matriz de versiones, piloto y métricas. Consolidar límites GPS de sección 12. | L0–L7. | Todas las puertas de salida cumplidas; autorización de despliegue separada. |

L3 y L4 pueden desarrollarse después de L1 sin mezclar escritores del repositorio compartido. No liberar parcialmente un backend que aumente los reintentos mientras conserve el fallo de recepción o la aprobación fuera de scope. Si se requiere una mitigación urgente, deshabilitar la operación afectada con comunicación y conservación de pendientes, no debilitar controles.

## 9. Matriz de pruebas obligatorias

Los IDs permiten demostrar cobertura; agregar pruebas de regresión permanentes durante implementación. `U`: unitaria/contrato, `I`: PostgreSQL aislado, `M`: móvil con DB local/widget/dispositivo, `W`: interfaz web.

| ID | Escenario | Resultado exigido | Nivel |
| --- | --- | --- | --- |
| T01 | Repositorio falla por conexión antes de commit | 5xx/retry; no rechazo terminal. | U/I/M |
| T02 | Commit aplicado; respuesta perdida | Replay mismo ID, mismos movimientos, un efecto. | I/M |
| T03 | Lote A aplicado, B falla temporalmente, C pendiente | Recuperar A, reintentar B/C sin duplicar A. | U/I/M |
| T04 | Conflicto de clave entre vecinos válidos | Aislar conflicto; vecinos progresan; no datos ajenos. | U/M |
| T05 | Timeout/429/500/503 y respuesta vacía | Backoff; mismo payload/ID; cola intacta. | U/M |
| T06 | JSON corrupto en una fila o respuesta mal formada | Aislar diagnóstico; vecinos sanos progresan. | M |
| T07 | 401 frente a 403 de negocio | Reautenticación solo cuando corresponde. | U/M |
| T08 | GPS faltante, parcial, null, string, NaN/infinito interno, rangos inválidos | Rechazo de nueva captura antes del efecto; código preciso. | U/M |
| T09 | GPS válido, coordenada cero real y precisión cero | No confundir con datos ausentes. | U/M |
| T10 | Sin red con GPS; GPS apagado/denegado/timeout/simulado | Primero guarda cifrado; los demás no confirman captura operativa. | M/dispositivo |
| T11 | Mismo evento v1 con distinto formato decimal equivalente | Hash conforme a canonicalización v1, sin doble efecto. | U/I |
| T12 | Cambiar GPS/hora/cantidad/tipo/actor/recurso usando ID existente | Conflicto, cero escrituras y cero filtración. | U/I |
| T13 | Replay histórico sin GPS con resultado existente | Devuelve resultado propio; no exige captura actual. Probar ambos endpoints. | U/I/M |
| T14 | Evento antiguo sin GPS sin resultado en servidor | No aplicar; cuarentena/rechazo explícito, sin fecha/GPS inventados. | U/I/M |
| T15 | Duplicado con resultado null | `INCOMPLETE`, sin ejecución como nuevo. | U/I |
| T16 | Dos solicitudes simultáneas con misma clave | Una reserva/efecto y respuesta consistente. | I |
| T17 | Misma clave concurrente con payload diferente | Un ganador y un conflicto; no doble efecto. | I |
| T18 | Recibir 6/10; perder respuesta; reenviar 6 | Resultado original; recibido sigue en 6. | U/I/M |
| T19 | Recibir restante 4/10 con nueva clave | Acumulado 10, estado correcto; historial anterior no bloquea. | I/M |
| T20 | Replay de recibo con envío cerrado/devuelto | Resultado de ese recibo solo si identidad/hash coinciden. | U/I |
| T21 | Reusar ID de otro recibo/envío/actor sobre envío cerrado | Conflicto sin devolver resultado ajeno. | U/I |
| T22 | Dos claves reciben 6 y 6 sobre pendiente 10 | Nunca acumulado 12; una falla tras lectura consistente. | I |
| T23 | Dos claves reciben 6 y 4 sobre pendiente 10 | Resultado final exacto 10, sin saldos negativos. | I |
| T24 | Líneas repetidas, ajenas, negativas, cero total, precisión excedida | Rechazo atómico, sin líneas parcialmente aplicadas. | U/I |
| T25 | Fallo entre saldo, movimiento y recibo | Rollback completo; reintento seguro. | I |
| T26 | Aprobar pendiente sin GPS o GPS corrupto | Bloqueo aun con motivo y rol válido; cero efecto. | U/I/W |
| T27 | Aprobar por otra razón con GPS válido | Efecto autorizado y evidencia original visible. | U/I/W |
| T28 | Coordinador original zona A propone bodega Z | Denegación antes de saldo, aunque original sea visible. | U/I |
| T29 | Destino inactivo/no habilitado/unidad inválida/saldo insuficiente | No aprobación ni efecto parcial. | U/I |
| T30 | Aprobar/aprobar y aprobar/descartar concurrentes | Una resolución; otro intento recibe replay o conflicto correcto. | I |
| T31 | Reenvío idéntico de resolución / nueva clave de otra resolución | Replay propio / conflicto; nunca resultado ajeno silencioso. | U/I |
| T32 | Resolver pendiente y consultar desde móvil | Estado efectivo aplicado/descartado, no pendiente perpetuo. | U/I/M |
| T33 | Auditoría de directo, aprobado, recibido, revertido e histórico sin GPS | Procedencia correcta; no atribuir GPS original al aprobador/reversor. | U/W |
| T34 | Página de 100 movimientos, permisos cruzados y payload con datos extra | Consulta acotada, sin N+1 ni payload completo/ubicaciones ajenas. | U/I/W |
| T35 | Receipt ACKED parcial y contexto confirmado | Habilita siguiente recepción; no dice «pendiente de envío». | M/widget |
| T36 | Receipt REJECTED_CLIENT_ACTION | Muestra rechazo real y acción, no bloqueo por estado inexistente. | M/widget |
| T37 | ACK de salida y refresco falla | No ofrece nuevamente stock consumido por cache vieja. | M |
| T38 | Snapshot ya incorpora salida pero ACK local se perdió | No descontar dos veces; reconciliación atómica. | I/M |
| T39 | NEEDS_REVIEW se aprueba/descarta remotamente | Reserva y saldo convergen sin disponibilidad ficticia. | I/M |
| T40 | Worker A vence, B confirma, A responde tarde | A no revierte ni pisa resultado de B. | M/concurrencia |
| T41 | Cambio de usuario durante background sync | No enviar cola de A con sesión de B; no transferir datos. | M |
| T42 | Reinicio/cierre forzado antes/después de commit local o remoto | Recuperación desde estado durable sin borrado/duplicado. | I/M/dispositivo |
| T43 | Actualizar app con pendientes v1, rechazados y claves cifradas | DB/IDs/payload/hash intactos; recuperación selectiva. | M/dispositivo |
| T44 | Cliente anterior con backend nuevo | Leer/reintentar sin pérdida; limitaciones documentadas, sin ignorar GPS nuevo. | Contrato/M |
| T45 | Dry-run/recuperación aplicada dos veces | Segunda vez cero cambios adicionales; concilia ledger/saldo. | I |
| T46 | Contextos/respuestas fuera de orden y resultados duplicados | No degradar versión ni confirmar resultado arbitrario. | I/M |
| T47 | Base de integración sin `.env.test` o destino no permitido | Aborta antes de limpieza, migración o seed. | U/entorno |
| T48 | Reversos, entradas, conteos e importación usan helper compartido | No introducir regresiones al cambiar `reserveCommand`. | U/I |

### 9.1 Comandos y evidencias

Comandos focalizados existentes, ejecutados desde cada repositorio:

```powershell
# D:/DEV/futuragest/backend — solo unitarias, sin globalSetup de integración
npm.cmd test -- --selectProjects unit --runInBand --testPathPattern=modules/inventario
npm.cmd run typecheck
npm.cmd run build

# D:/DEV/futuragest/frontend_web
npm.cmd test -- --run src/features/inventario
npm.cmd run typecheck
npm.cmd run build

# D:/DEV/futuragest/frontend_flutter
flutter test --no-pub (Get-ChildItem test -Filter 'inventory*_test.dart' | ForEach-Object { $_.FullName })
dart analyze lib/features/inventory test
```

Agregar a estos comandos las nuevas pruebas de contrato, transporte, ubicación y widgets que queden fuera de esos filtros. Ejecutar lint focalizado conforme a cada proyecto. Una prueba omitida por el patrón no cuenta como aprobada.

**Integración:** no ejecutar el comando general actual hasta comprobar `.env.test`, host/base explícitamente permitidos, credenciales restringidas al entorno efímero y ausencia de fallback. Añadir preflight que falle cerrado, antes de `cleanTestFixtures`. No imprimir secretos. Utilizar PostgreSQL aislado con migraciones reales y procesos/conexiones independientes para carreras; mocks no prueban aislamiento SQL.

Por unidad registrar commit/diff, comando, resultado exacto, casos Txx, entorno, limitaciones y rollback. La línea base de 105/24/12 no reemplaza la ejecución de regresiones nuevas.

## 10. Archivos y límites de cambio

| Ruta absoluta | Responsabilidad prevista |
| --- | --- |
| `D:/DEV/futuragest/backend/src/modules/inventario/application/sync-inventory.use-case.ts` | Separar parseo/replay/política; errores y resultados por evento. |
| `D:/DEV/futuragest/backend/src/modules/inventario/domain/inventory-command.ts` | Contratos históricos/validados, lookup discriminado y códigos tipados. |
| `D:/DEV/futuragest/backend/src/modules/inventario/domain/canonical-inventory-event.ts` | Preservar canonicalización v1 y fixtures de compatibilidad. |
| `D:/DEV/futuragest/backend/src/modules/inventario/domain/inventory-operations.ts` | Recepción y resolución con tipos claros, sin hacer opcional la evidencia nueva por accidente. |
| `D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/prisma-inventory-command.repository.ts` | Idempotencia, transacciones, proyección del estado efectivo. |
| `D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/scoped-inventory-operations.repository.ts` | Recepción, aprobación, scope, evidencia y helper compartido. Extraer políticas pequeñas solo donde reduzca duplicación; no reescribir todo el módulo. |
| `D:/DEV/futuragest/backend/src/modules/inventario/infrastructure/prisma-inventory-context.repository.ts` | Snapshot consistente de saldos, estados e inclusión de efectos. |
| `D:/DEV/futuragest/backend/src/modules/inventario/domain/inventory-context.ts` | Contrato aditivo de contexto/reconciliación. |
| `D:/DEV/futuragest/backend/src/modules/inventario/interface/inventory.controller.ts` | HTTP y contrato de sync/estado, sin rechazos falsos. |
| `D:/DEV/futuragest/backend/src/modules/inventario/interface/inventory-operations.controller.ts` | Transporte histórico, nueva política en dominio y errores estables. |
| `D:/DEV/futuragest/backend/prisma/schema.prisma` | Reutilizar relaciones existentes; migraciones nuevas solo para evidencia/metadatos realmente necesarios y aditivos. |
| `D:/DEV/futuragest/backend/src/database/jest-global-setup.ts` | Barrera contra escritura accidental fuera de la DB de pruebas. |
| `D:/DEV/futuragest/frontend_flutter/lib/features/inventory/data/inventory_sync_engine.dart` | Resultados parciales, clasificación de errores y reconciliación. |
| `D:/DEV/futuragest/frontend_flutter/lib/features/inventory/data/inventory_database.dart` | Estados, lease fencing, reservas y aplicación atómica de contexto. |
| `D:/DEV/futuragest/frontend_flutter/lib/features/inventory/data/inventory_context_repository.dart` | Snapshot/estado efectivo y continuación de recepción parcial. |
| `D:/DEV/futuragest/frontend_flutter/lib/features/inventory/application/inventory_background_sync.dart` | Scheduling, owner de sesión, backoff y recuperación segura. |
| `D:/DEV/futuragest/frontend_flutter/lib/features/inventory/application/inventory_session_coordinator.dart` | Reanudar trabajo propio sin ocultar recuperación/conflictos. |
| `D:/DEV/futuragest/frontend_flutter/lib/features/inventory/application/inventory_capture_service.dart` | Mantener validación GPS y commit durable; no recapturar al sincronizar. |
| `D:/DEV/futuragest/frontend_flutter/lib/features/inventory/presentation/inventory_screen_widgets.dart` | Estados de recibos, disponibilidad exacta y acciones de atención. |
| `D:/DEV/futuragest/frontend_flutter/lib/core/location/location_service.dart` | Evidencia del proveedor y timestamp solo si se aprueba/versiona ampliación; evitar regresiones de asistencia. |
| `D:/DEV/futuragest/frontend_web/src/features/inventario/inventory.types.ts` | Proyección tipada de origen, GPS y estado efectivo. |
| `D:/DEV/futuragest/frontend_web/src/features/inventario/InventoryPage.tsx` | Auditoría y aprobación con impedimentos visibles. |
| `D:/DEV/futuragest/frontend_web/src/lib/api/client.ts` | Alinear contrato de recepción: actualmente el tipo de cliente no incluye GPS. |

Las pruebas correspondientes deben acompañar cada archivo/política modificados. No hay autorización para tocar cambios locales ajenos ni para generar archivos derivados manualmente.

## 11. Liberación, observabilidad y rollback

### Orden de despliegue propuesto

1. Ensayo completo en entorno aislado con clientes anteriores y nuevos, colas v1 y datos históricos representativos.
2. Backend compatible que reconozca replay antes de la política nueva, aplique controles en nuevas operaciones y exponga proyecciones aditivas.
3. Web con evidencia/impedimentos; móvil con estados/reconciliación y migración local segura. Publicar submódulos antes de actualizar referencias raíz.
4. Piloto autorizado con una zona/municipio y cuentas de prueba operativa definidas. Verificar respuesta perdida, parcial, aprobación y GPS real.
5. Recuperación autorizada por lotes y ampliación solo después de conciliación.

**No desplegar automáticamente por terminar el código.** No relajar GPS para facilitar el piloto ni usar una versión backend antigua que deje de entender datos ya emitidos por el nuevo móvil.

### Indicadores mínimos

- Conteo de `INVALID_EVENT`/rechazos por código y versión, errores 5xx, conflictos de hash e incompletos.
- Antigüedad y cantidad de pendientes, bloqueados, revisiones y recuperaciones requeridas.
- Replays reconocidos, intentos evitados por lease vencido y tiempos de convergencia de estado/contexto.
- GPS ausente/incorrecto por tipo y estado, distinguiendo histórico de nueva operación.
- Diferencias ledger/balance/acumulados de recepción y existencia de más de una resolución/efecto para la misma operación lógica.

Logs con ID correlacionable, tipo, código y versión; no con coordenadas, payloads completos, credenciales o datos personales innecesarios. Definir responsables de alertas antes del piloto: responsable técnico para fallos de transporte/integridad; responsable de inventarios para pendientes, descartes y regularizaciones.

### Puertas de salida

- [ ] T01–T48 ejecutados en su nivel apropiado, con evidencia; no aceptar mocks como prueba de concurrencia real.
- [ ] Cero efectos duplicados, saldos negativos o diferencias de conciliación en los escenarios de aceptación.
- [ ] Ninguna nueva operación dentro del alcance operativo sin GPS válido; ninguna aprobación fuera de scope.
- [ ] Estado y reservas móviles convergen tras pérdida de red, aprobación remota y cache desactualizada.
- [ ] Replays históricos conservan IDs/hash; faltantes reales de GPS siguen explícitos.
- [ ] Migración de app con cola pendiente y restauración aislada verificadas.
- [ ] Dry-run de recuperación revisado; responsables de operación y despliegue identificados.
- [ ] Alcance administrativo y umbrales GPS documentados sin afirmar garantías que no existen.

**Rollback:** detener nuevas acciones afectadas y/o la ampliación del piloto, conservar endpoints de lectura/replay y datos aditivos. No borrar comandos, outbox, GPS ni movimientos; no restaurar un backup antiguo sobre movimientos posteriores sin un procedimiento de recuperación aprobado. Las correcciones contables posteriores se hacen con eventos auditados, no con edición destructiva del ledger.

## 12. Decisiones de negocio pendientes, sin bloquear los arreglos base

GPS obligatorio para capturas operativas es una instrucción confirmada del usuario. Los siguientes detalles no se deben inventar ni presentar como aprobados:

| Tema | Propuesta concreta | Límite hasta confirmación |
| --- | --- | --- |
| Acciones administrativas | Exigir evidencia propia para nuevos actos que generan/modifican inventario —entradas, despachos, conteos, reversos y aprobaciones—, distinta de la evidencia de captura original. Elaborar matriz por endpoint antes de extenderlos. | Hoy no todos esos contratos capturan GPS. No afirmar cobertura universal al cerrar F1–F5. Su implementación sería una unidad posterior explícita. |
| Precisión | Mantener sin cambios silenciosos el umbral existente de revisión de movimientos `>100 m`; proponer un umbral coherente para nuevas recepciones tras piloto. | Las recepciones no tienen hoy el mismo umbral máximo. Mostrar precisión real y no prometer ubicación puntual. No enviar recepciones a una revisión de movimientos que no admite ese tipo. |
| Antigüedad de la posición | Proponer conservar timestamp del proveedor y política versionada de frescura para nuevas capturas. | El servicio actual descarta ese timestamp. No reconstruirlo desde la hora de sincronización ni imponer un límite retroactivo a replays. |
| Regularización de históricos sin GPS | Resolver el incidente con conteo/evidencia actual y enlace explícito al histórico, solo si Inventarios autoriza el procedimiento. | No aprobar el original sin GPS ni crear automáticamente ajustes/recapturas duplicadas. |
| Excepciones por revisión | Documentar por código qué puede aprobar cada rol y qué evidencia debe aportar; GPS ausente/inválido permanece no aprobable. | No convertir un motivo genérico en permiso para saltar territorio, stock o integridad. |

Estas decisiones se confirman individualmente al iniciar su unidad. No impiden corregir errores temporales, replay, scope, evidencia existente o coherencia del móvil. El siguiente paso técnico es **L0 y L1**, no repetir U1 del plan general, que ya está implementada.
