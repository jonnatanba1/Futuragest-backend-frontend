/**
 * LateArrivalNovedadService — auto-generates LLEGADA_TARDE novedades.
 *
 * Compares checkInCapturedAt (as Colombia local time) against the resolved
 * JornadaPolicy's horaInicio + toleranciaMin. If late, creates an auto-generated
 * LLEGADA_TARDE novedad. Idempotent via the partial unique index on Novedad
 * (PENDING|APPROVED per attendance — P2002 is caught silently).
 *
 * Uses NovedadRepositoryPort (sanctioned Prisma access) rather than Prisma
 * directly to satisfy the scope-meta-guard scan.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ATTENDANCE_REPOSITORY_PORT, type AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import { JORNADA_POLICY_REPOSITORY_PORT, type JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import { NOVEDAD_REPOSITORY_PORT, type NovedadRepositoryPort } from '../../novedades/domain/ports/novedad-repository.port';
import { NOTIFICATION_PORT, type NotificationPort, type NovedadCreatedPayload } from '../../notifications/domain/notification.port';

@Injectable()
export class LateArrivalNovedadService {
  private readonly logger = new Logger(LateArrivalNovedadService.name);

  constructor(
    @Inject(ATTENDANCE_REPOSITORY_PORT)
    private readonly attendanceRepo: AttendanceRepositoryPort,
    @Inject(JORNADA_POLICY_REPOSITORY_PORT)
    private readonly policyRepo: JornadaPolicyRepositoryPort,
    @Inject(NOVEDAD_REPOSITORY_PORT)
    private readonly novedadRepo: NovedadRepositoryPort,
    /**
     * Optional: when bound (JornadaModule imports NotificationsModule), a
     * LLEGADA_TARDE push is fired to LIDER_OPERATIVO on genuine creation.
     * Omitting preserves backward compat with existing unit tests, mirroring
     * the CreateNovedadUseCase optional-notificationPort pattern.
     */
    @Optional()
    @Inject(NOTIFICATION_PORT) private readonly notificationPort?: NotificationPort,
  ) {}

  /**
   * Checks check-in time against the resolved JornadaPolicy and creates
   * a LLEGADA_TARDE novedad if the operario arrived after horaInicio + toleranciaMin.
   *
   * Idempotent: if a P2002 unique constraint fires (partial active index),
   * the duplicate is swallowed silently — a novedad already exists.
   */
  async checkAndCreateLateArrivalNovedad(attendanceId: string): Promise<void> {
    // 1. Load attendance
    const attendance = await this.attendanceRepo.findById(attendanceId);
    if (!attendance) {
      this.logger.warn(`LateArrivalNovedadService: attendance not found ${attendanceId}`);
      return;
    }

    // 2. Resolve JornadaPolicy (3-level: operario → zone → global)
    const policy = await this.policyRepo.findLatest(
      attendance.operarioId,
      attendance.zoneId,
      new Date(attendance.date),
    );
    if (!policy) {
      this.logger.warn(
        `LateArrivalNovedadService: no policy for attendance ${attendanceId} ` +
          `(operario=${attendance.operarioId}, zone=${attendance.zoneId}, date=${attendance.date})`,
      );
      return;
    }

    // 3. Convert checkInCapturedAt to Colombia local time (UTC-5).
    //    The system stores UTC epochs; shifting by -5h makes getUTCHours() return Colombia hour.
    const checkInLocal = new Date(attendance.checkInCapturedAt.getTime() - 5 * 60 * 60 * 1000);
    const checkInMinutes = checkInLocal.getUTCHours() * 60 + checkInLocal.getUTCMinutes();

    // 4. Parse policy.horaInicio to minutes from midnight
    const [hInicio, mInicio] = policy.horaInicio.split(':').map(Number);
    const policyStartMinutes = hInicio * 60 + mInicio;
    const policyStartWithTolerance = policyStartMinutes + policy.toleranciaMin;

    // 5. Compare: checkIn <= horaInicio + tolerance → not late
    if (checkInMinutes <= policyStartWithTolerance) {
      return;
    }

    // 6. Calculate minutesTarde: difference from horaInicio (without tolerance)
    const minutesTarde = checkInMinutes - policyStartMinutes;

    // 7. Create LLEGADA_TARDE novedad — idempotent (P2002 = already exists)
    try {
      const record = await this.novedadRepo.create({
        attendanceId,
        supervisorId: attendance.supervisorId,
        zoneId: attendance.zoneId,
        horasExtra: 0,
        tipoNovedad: 'LLEGADA_TARDE',
        autoGenerada: true,
        minutosTarde: minutesTarde,
      });
      this.logger.log(
        `LLEGADA_TARDE novedad creada: attendance=${attendanceId}, ` +
          `minutosTarde=${minutesTarde}`,
      );
      // Fire-and-forget push to LIDER_OPERATIVO. Only on the genuine-create path —
      // the P2002 "already exists" early-return below deliberately does NOT dispatch.
      // Mirrors CreateNovedadUseCase.dispatchNovedadCreatedNotification: try/catch +
      // chained .catch so no failure in the dispatch path can escape the service.
      this.dispatchLateArrivalNotification(record, minutesTarde);
    } catch (err) {
      // P2002 = unique constraint violation (partial unique index on active novedades)
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        this.logger.log(
          `LLEGADA_TARDE novedad ya existe para attendance ${attendanceId} (idempotent)`,
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Fire-and-forget notification dispatch. This method can NEVER throw:
   * - synchronous throws from the port (or a non-thenable return) are caught here;
   * - asynchronous rejections are caught via the chained .catch.
   * Both paths only log — the persisted novedad is unaffected.
   *
   * supervisorId/zoneId come from the freshly-created novedad record (authoritative).
   * horasExtra is "0" (LLEGADA_TARDE carries no overtime) so the HORAS_EXTRA copy path
   * in the adapters is never hit for this payload. minutosTarde is passed from the
   * service-level computation so the FCM body can read "X minutos".
   */
  private dispatchLateArrivalNotification(
    record: { id: string; supervisorId: string; zoneId: string },
    minutosTarde: number,
  ): void {
    if (!this.notificationPort) return;
    const payload: NovedadCreatedPayload = {
      novedadId: record.id,
      tipoNovedad: 'LLEGADA_TARDE',
      horasExtra: '0',
      minutosTarde,
      supervisorId: record.supervisorId,
      zoneId: record.zoneId,
    };
    try {
      const result = this.notificationPort.notifyNovedadCreated(payload);
      // Promise.resolve guards against ports returning a non-thenable value.
      void Promise.resolve(result).catch((err: unknown) => {
        this.logDispatchFailure(record.id, err);
      });
    } catch (err) {
      this.logDispatchFailure(record.id, err);
    }
  }

  /**
   * Last-resort guard: even a throwing Logger must not escape the fire-and-forget path.
   */
  private logDispatchFailure(novedadId: string, err: unknown): void {
    try {
      this.logger.error(
        `notifyNovedadCreated (LLEGADA_TARDE) failed for novedad ${novedadId} (non-blocking)`,
        err as Error,
      );
    } catch {
      // Swallow — logging failure is strictly less important than the service call.
    }
  }
}
