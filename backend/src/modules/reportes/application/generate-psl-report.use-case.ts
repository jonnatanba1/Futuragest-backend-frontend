import { Injectable, Logger, Inject } from '@nestjs/common';
import { ATTENDANCE_REPOSITORY_PORT, type AttendanceRepositoryPort } from '../../asistencia/domain/ports/attendance-repository.port';
import { ScopedOperarioRepository } from '../../iam/infrastructure/scoped-operario.repository';
import { PslReportRowDto } from '../../../contracts/shared/reportes';
import { derivePslPeriodNumber, dateToExcelSerial, decimalHoursToHMM } from '../domain/psl-utils';
import { mapCategory, PslMappedRow } from '../domain/psl-concept-mapper';

export interface GeneratePslReportInput {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  zoneId?: string;
}

@Injectable()
export class GeneratePslReportUseCase {
  private readonly logger = new Logger(GeneratePslReportUseCase.name);

  constructor(
    @Inject(ATTENDANCE_REPOSITORY_PORT)
    private readonly attendanceRepo: AttendanceRepositoryPort,
    private readonly operarioRepo: ScopedOperarioRepository,
  ) {}

  async execute(input: GeneratePslReportInput): Promise<PslReportRowDto[]> {
    this.logger.log(`Generando reporte PSL para rango ${input.desde} - ${input.hasta} (zona: ${input.zoneId ?? 'todas'})`);

    if (!this.attendanceRepo.findManyWithBreakdown) {
      throw new Error('El repositorio de asistencia no implementa findManyWithBreakdown');
    }

    // 1. Fetch completed attendances with breakdowns
    const attendances = await this.attendanceRepo.findManyWithBreakdown(
      input.desde,
      input.hasta,
      input.zoneId,
    );

    if (attendances.length === 0) {
      return [];
    }

    // 2. Fetch operarios to get documentos
    const operarioIds = Array.from(new Set(attendances.map((a) => a.operarioId)));
    const operarios = await this.operarioRepo.findMany({
      id: { in: operarioIds },
    });
    const operarioMap = new Map(operarios.map((o) => [o.id, o]));

    const reportRows: PslReportRowDto[] = [];

    // 3. Process each attendance record
    for (const att of attendances) {
      const operario = operarioMap.get(att.operarioId);
      if (!operario) {
        this.logger.warn(`No se encontró el operario ${att.operarioId} para la asistencia ${att.id}`);
        continue;
      }

      const bd = att.breakdown;
      if (!bd) {
        this.logger.warn(`La asistencia ${att.id} del operario ${operario.fullName} no tiene desglose calculado.`);
        continue;
      }

      const isSundayOrHoliday = bd.esDominical || bd.esFestivo;

      // Define categories to process and map to PSL concepts
      const categories = [
        // 1. Ordinarias Nocturnas
        {
          horas: bd.horasOrdinariasNocturnas,
          concepto: isSundayOrHoliday ? '009' : '010', // 009: Recargo Festivo Nocturno, 010: Recargo Nocturno
          inicio: bd.tramoInicioOrdNocturno,
          fin: bd.tramoFinOrdNocturno,
        },
        // 2. Extra Diurnas
        {
          horas: bd.horasExtraDiurnas,
          concepto: isSundayOrHoliday ? '011' : '015', // 011: Extra Festiva Diurna, 015: Extra Diurna
          inicio: bd.tramoInicioExtraDiurna,
          fin: bd.tramoFinExtraDiurna,
        },
        // 3. Extra Nocturnas
        {
          horas: bd.horasExtraNocturnas,
          concepto: isSundayOrHoliday ? '012' : '016', // 012: Extra Festiva Nocturna, 016: Extra Nocturna
          inicio: bd.tramoInicioExtraNocturna,
          fin: bd.tramoFinExtraNocturna,
        },
        // 4. Ordinarias Diurnas (Only reported on Sunday/Holiday as Recargo Dominical)
        {
          horas: bd.horasOrdinariasDiurnas,
          concepto: isSundayOrHoliday ? '014' : '', // 014: Recargo Dominical/Festivo Laborado
          inicio: bd.tramoInicioOrdDiurna,
          fin: bd.tramoFinOrdDiurna,
        },
      ];

      for (const cat of categories) {
        if (!cat.concepto || cat.horas.isZero()) {
          continue;
        }

        // Map and potentially split cross-midnight category tramos
        const mappedSlices = mapCategory(
          att.date,
          cat.concepto,
          cat.horas,
          cat.inicio,
          cat.fin,
        );

        for (const slice of mappedSlices) {
          reportRows.push({
            compania: '40', // FUTURASEO SAS ESP
            cedula: operario.documento,
            concepto: slice.concepto,
            anio: parseInt(slice.dateStr.slice(0, 4), 10),
            periodo: derivePslPeriodNumber(slice.dateStr),
            horasOrdinaria: decimalHoursToHMM(slice.horas),
            tipoHora: 'D',
            diaLaborado: dateToExcelSerial(slice.dateStr),
            tipoMvto: 'NORMA',
            horaInicio: slice.horaInicio,
            horaFinal: slice.horaFinal,
          });
        }
      }
    }

    // 4. Sort rows by cedula asc, diaLaborado asc, concepto asc
    return reportRows.sort((a, b) => {
      const cmpCedula = a.cedula.localeCompare(b.cedula);
      if (cmpCedula !== 0) return cmpCedula;

      const cmpDia = a.diaLaborado - b.diaLaborado;
      if (cmpDia !== 0) return cmpDia;

      return a.concepto.localeCompare(b.concepto);
    });
  }
}
