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
  /** Decimal string as stored in the DB (e.g. "2.50"). */
  horasExtra: string;
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
