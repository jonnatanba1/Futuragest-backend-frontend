/**
 * Notifications domain — NotificationPort interface.
 *
 * Intent-named port for the novedad-created push notification.
 * Implementations: NoOpNotificationAdapter (default), FcmNotificationAdapter (config-gated).
 *
 * CONTRACT: implementations MUST NOT throw. Errors are caught-and-logged at the call site
 * (fire-and-forget in CreateNovedadUseCase). The port returning void is the success case.
 */

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

/** Payload emitted after a genuine novedad creation. */
export interface NovedadCreatedPayload {
  novedadId: string;
  /** Type of novedad — drives the notification copy + the Flutter deep-link target. */
  tipoNovedad: 'LLEGADA_TARDE' | 'HORAS_EXTRA';
  /** Decimal string as stored in the DB (e.g. "2.50"). "0" for LLEGADA_TARDE. */
  horasExtra: string;
  /** Minutes late from horaInicio. Only set when tipoNovedad === 'LLEGADA_TARDE'. */
  minutosTarde?: number;
  supervisorId: string;
  zoneId: string;
}

export interface NotificationPort {
  /**
   * Notify eligible approvers (LIDER_OPERATIVO by default) that a new novedad was created.
   *
   * Fire-and-forget invariant: implementations SHOULD NOT throw. If they do, the caller
   * (CreateNovedadUseCase) catches and logs the error — the novedad is already persisted.
   */
  notifyNovedadCreated(payload: NovedadCreatedPayload): Promise<void>;
}
