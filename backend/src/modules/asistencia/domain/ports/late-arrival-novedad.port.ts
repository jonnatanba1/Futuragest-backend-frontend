/**
 * LateArrivalNovedadPort — port for auto-generating LLEGADA_TARDE novedades.
 *
 * Defined in the asistencia module (consumer side) following the same pattern
 * as AttendanceClassificationPort. The implementation lives in jornada module.
 */

export const LATE_ARRIVAL_NOVEDAD_PORT = Symbol('LateArrivalNovedadPort');

export interface LateArrivalNovedadPort {
  checkAndCreateLateArrivalNovedad(attendanceId: string): Promise<void>;
}
