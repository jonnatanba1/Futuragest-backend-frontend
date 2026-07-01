import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AttendanceClassificationPort } from '../../asistencia/domain/ports/attendance-classification.port';
import { ATTENDANCE_REPOSITORY_PORT, AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import { JORNADA_POLICY_REPOSITORY_PORT, JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';
import { HOLIDAY_REPOSITORY_PORT, HolidayRepositoryPort } from '../domain/ports/holiday-repository.port';
import { SURCHARGE_RATE_REPOSITORY_PORT, SurchargeRateRepositoryPort } from '../domain/ports/surcharge-rate-repository.port';
import { ATTENDANCE_BREAKDOWN_REPOSITORY_PORT, AttendanceBreakdownRepositoryPort } from '../domain/ports/attendance-breakdown-repository.port';
import { COMPENSATORY_REST_PORT, type CompensatoryRestPort } from '../../asistencia/domain/ports/compensatory-rest.port';
import { HolidayCalculator } from '../domain/holiday-calculator';
import { TimeClassificationEngine } from '../domain/time-classification-engine';
import { NoPolicyForDateError } from '../domain/jornada.errors';

@Injectable()
export class ClassifyAttendanceUseCase implements AttendanceClassificationPort {
  private readonly logger = new Logger(ClassifyAttendanceUseCase.name);

  constructor(
    @Inject(ATTENDANCE_REPOSITORY_PORT)
    private readonly attendanceRepo: AttendanceRepositoryPort,
    @Inject(JORNADA_POLICY_REPOSITORY_PORT)
    private readonly policyRepo: JornadaPolicyRepositoryPort,
    @Inject(HOLIDAY_REPOSITORY_PORT)
    private readonly holidayRepo: HolidayRepositoryPort,
    @Inject(SURCHARGE_RATE_REPOSITORY_PORT)
    private readonly surchargeRepo: SurchargeRateRepositoryPort,
    @Inject(ATTENDANCE_BREAKDOWN_REPOSITORY_PORT)
    private readonly breakdownRepo: AttendanceBreakdownRepositoryPort,
    @Optional()
    @Inject(COMPENSATORY_REST_PORT)
    private readonly compensatoryRestPort?: CompensatoryRestPort | null,
  ) {}

  async classifyAttendance(attendanceId: string): Promise<void> {
    this.logger.log(`Iniciando clasificación para asistencia: ${attendanceId}`);

    const attendance = await this.attendanceRepo.findById(attendanceId);
    if (!attendance) {
      this.logger.error(`Asistencia no encontrada: ${attendanceId}`);
      return;
    }

    const dateStr = attendance.date; // YYYY-MM-DD
    const year = parseInt(dateStr.slice(0, 4), 10);

    // 1. Resolver política de jornada (3-level: operario → zone → global)
    const policy = await this.policyRepo.findLatest(attendance.operarioId, attendance.zoneId, new Date(dateStr));
    if (!policy) {
      throw new NoPolicyForDateError(attendance.operarioId, attendance.zoneId, dateStr);
    }

    // 2. Virtual check-out: if enabled, auto-complete attendances that lack a manual check-out
    const virtualCheckOutEnabled = process.env.CHECK_OUT_VIRTUAL_ENABLED === 'true';
    if (virtualCheckOutEnabled && !attendance.completedAt) {
      // compute virtual checkout from policy.horaFin (overtime pre-auth in PR 4)
      const checkoutVirtual = this.buildCheckoutVirtual(attendance.date, policy.horaFin);
      await this.attendanceRepo.update(attendanceId, {
        completedAt: checkoutVirtual,
        checkOutCapturedAt: checkoutVirtual,
        checkOutReceivedAt: new Date(),
      });
      this.logger.log(`Check-out virtual aplicado: ${attendanceId} → ${checkoutVirtual.toISOString()}`);
      // Reload attendance to get updated fields
      const reloaded = await this.attendanceRepo.findById(attendanceId);
      if (!reloaded || !reloaded.completedAt || !reloaded.checkOutCapturedAt) {
        this.logger.warn(`Asistencia no está completada para clasificar: ${attendanceId}`);
        return;
      }
      // Use reloaded attendance for the rest of the method
      Object.assign(attendance, reloaded);
    }

    if (!attendance.completedAt || !attendance.checkOutCapturedAt) {
      this.logger.warn(`Asistencia no está completada para clasificar: ${attendanceId}`);
      return;
    }

    // 3. Resolver festivos del año (auto-seed si no existen)
    let holidays = await this.holidayRepo.findManyByYear(year);
    if (holidays.length === 0) {
      this.logger.log(`Generando y sembrando festivos para el año ${year}`);
      const generated = HolidayCalculator.generateYear(year);
      await this.holidayRepo.createMany(generated);
      holidays = await this.holidayRepo.findManyByYear(year);
    }

    const holidayDates = new Set(holidays.map((h) => h.date));
    const isHoliday = holidayDates.has(dateStr);
    
    let weekday = new Date(dateStr).getUTCDay();
    const isSunday = weekday === 0;
    if (weekday === 0) weekday = 7; // ISO Sunday is 7

    // 4. Resolve almuerzo & desayuno: if null → auto-compute
    const almuerzoInicio = policy.almuerzoInicio ?? computeAutoLunchStart(policy.horaInicio, policy.horaFin);
    const almuerzoFin = policy.almuerzoFin ?? computeAutoLunchEnd(policy.horaInicio, policy.horaFin);

    const desayunoInicio = policy.desayunoInicio ?? computeAutoBreakfastStart(policy.horaInicio);
    const desayunoFin = policy.desayunoFin ?? computeAutoBreakfastEnd(policy.horaInicio);

    // 5. Clasificar el turno (v2 — minute-by-minute with schedule + lunch)
    // Ajustar a hora Colombia (UTC-5) restando 5 horas para que getUTCHours() devuelva la hora local
    const checkInLocal = new Date(attendance.checkInCapturedAt.getTime() - 5 * 60 * 60 * 1000);
    const checkOutLocal = new Date(attendance.checkOutCapturedAt.getTime() - 5 * 60 * 60 * 1000);

    const classification = TimeClassificationEngine.classify({
      checkIn: checkInLocal,
      checkOut: checkOutLocal,
      isSunday,
      isHoliday,
      jornadaHorasDiarias: policy.horasDiarias,
      horaInicio: policy.horaInicio,
      horaFin: policy.horaFin,
      diasLaborales: policy.diasLaborales,
      almuerzoInicio,
      almuerzoFin,
      desayunoInicio,
      desayunoFin,
      isoWeekday: weekday,
    });

    // 6. Persistir el desglose
    await this.breakdownRepo.upsert(attendanceId, {
      attendanceId,
      horasOrdinariasDiurnas: classification.horasOrdinariasDiurnas,
      horasOrdinariasNocturnas: classification.horasOrdinariasNocturnas,
      horasExtraDiurnas: classification.horasExtraDiurnas,
      horasExtraNocturnas: classification.horasExtraNocturnas,
      totalHoras: classification.totalHoras,
      esDominical: isSunday,
      esFestivo: isHoliday,
      esDiaLaboral: classification.esDiaLaboral,
      jornadaPolicyId: policy.id,
      horaInicioAplicada: policy.horaInicio,
      horaFinAplicada: policy.horaFin,
      horasDiariasAplicada: policy.horasDiarias,
    });

    // 7. Fire-and-forget: generate CompensatoryRest if Sunday or holiday (REQ-006)
    if (this.compensatoryRestPort && (isSunday || isHoliday)) {
      this.compensatoryRestPort.generateIfApplicable(attendanceId).catch((err) => {
        this.logger.error(
          `Error en fire-and-forget de descanso compensatorio para asistencia ${attendanceId}`,
          (err as Error)?.stack ?? err,
        );
      });
    }

    this.logger.log(`Clasificación exitosa para asistencia: ${attendanceId}`);
  }

  /**
   * T2.4 — Auto-complete pending attendances (MVP: on-demand, not cron).
   *
   * Queries recent attendances (last 7 days) without completedAt,
   * computes virtual check-out for each, and auto-completes those
   * whose virtual check-out time has already passed.
   *
   * Returns the count of auto-completed records.
   */
  async autoCompletePending(): Promise<{ autoCompleted: number; skipped: number }> {
    this.logger.log('Iniciando auto-completado pendiente');

    const virtualCheckOutEnabled = process.env.CHECK_OUT_VIRTUAL_ENABLED === 'true';
    if (!virtualCheckOutEnabled) {
      this.logger.log('CHECK_OUT_VIRTUAL_ENABLED=false — omitiendo auto-completado');
      return { autoCompleted: 0, skipped: 0 };
    }

    // Query recent attendances (last 7 days) — MVP scope
    const recent = await this.attendanceRepo.findMany(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    const pending = recent.filter((a) => !a.completedAt);
    this.logger.log(`${pending.length} asistencias pendientes encontradas`);

    let autoCompleted = 0;
    let skipped = 0;
    const now = new Date();

    for (const att of pending) {
      try {
        // Resolve policy to get horaFin
        const policy = await this.policyRepo.findLatest(
          att.operarioId,
          att.zoneId,
          new Date(att.date),
        );
        if (!policy) {
          skipped++;
          continue;
        }

        const checkoutVirtual = this.buildCheckoutVirtual(att.date, policy.horaFin);
        if (now > checkoutVirtual) {
          await this.classifyAttendance(att.id);
          autoCompleted++;
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }

    this.logger.log(`Auto-completado: ${autoCompleted} procesadas, ${skipped} omitidas`);
    return { autoCompleted, skipped };
  }

  /**
   * Builds a Date for the virtual check-out.
   * Uses attendance.date + policy.horaFin (HH:MM) as Colombia local time.
   *
   * Overtime pre-auth (PR 4) will extend this: policy.horaFin + Σ approved Novedad horasExtra.
   */
  private buildCheckoutVirtual(dateStr: string, horaFin: string): Date {
    const [h, m] = horaFin.split(':').map(Number);
    // Construct as UTC but representing Colombia local time (UTC-5)
    // The dates in the system are stored as UTC but represent Colombia time.
    // We construct a Date that, when read with getUTCHours(), gives the local hour.
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCHours(h, m, 0, 0);
    return d;
  }
}

// ─── Auto-lunch helpers ──────────────────────────────────────────────────────

/**
 * Parses "HH:MM" → total minutes from midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Formats total minutes from midnight → "HH:MM".
 */
function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Auto-compute lunch start: midpoint of the shift minus 30 minutes.
 */
function computeAutoLunchStart(horaInicio: string, horaFin: string): string {
  const start = parseTimeToMinutes(horaInicio);
  const end = parseTimeToMinutes(horaFin);
  // Handle midnight wrap: if end < start, add 24h to end
  const adjustedEnd = end <= start ? end + 24 * 60 : end;
  const midpoint = Math.floor((start + adjustedEnd) / 2);
  const lunchStart = midpoint - 30;
  // Normalize: wrap to [0, 1440)
  const normalized = ((lunchStart % (24 * 60)) + 24 * 60) % (24 * 60);
  return formatMinutesToTime(normalized);
}

/**
 * Auto-compute lunch end: midpoint of the shift plus 30 minutes.
 */
function computeAutoLunchEnd(horaInicio: string, horaFin: string): string {
  const start = parseTimeToMinutes(horaInicio);
  const end = parseTimeToMinutes(horaFin);
  const adjustedEnd = end <= start ? end + 24 * 60 : end;
  const midpoint = Math.floor((start + adjustedEnd) / 2);
  const lunchEnd = midpoint + 30;
  const normalized = ((lunchEnd % (24 * 60)) + 24 * 60) % (24 * 60);
  return formatMinutesToTime(normalized);
}

/**
 * Auto-compute breakfast start: shift start + 2 hours.
 */
function computeAutoBreakfastStart(horaInicio: string): string {
  const start = parseTimeToMinutes(horaInicio);
  const breakfastStart = start + 120; // + 2 hours
  const normalized = ((breakfastStart % (24 * 60)) + 24 * 60) % (24 * 60);
  return formatMinutesToTime(normalized);
}

/**
 * Auto-compute breakfast end: shift start + 2.5 hours (30 mins duration).
 */
function computeAutoBreakfastEnd(horaInicio: string): string {
  const start = parseTimeToMinutes(horaInicio);
  const breakfastEnd = start + 150; // + 2.5 hours
  const normalized = ((breakfastEnd % (24 * 60)) + 24 * 60) % (24 * 60);
  return formatMinutesToTime(normalized);
}
