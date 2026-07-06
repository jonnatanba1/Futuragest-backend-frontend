import { GeneratePslReportUseCase } from './generate-psl-report.use-case';
import { Decimal } from '@prisma/client/runtime/client';
import { Attendance, AttendanceBreakdown, Operario } from '@prisma/client';
import { derivePslPeriodNumber, dateToExcelSerial, decimalHoursToHMM } from '../domain/psl-utils';

describe('PslUtils', () => {
  it('should calculate correct quincena periods (derivePslPeriodNumber)', () => {
    // January
    expect(derivePslPeriodNumber('2026-01-01')).toBe(1);
    expect(derivePslPeriodNumber('2026-01-15')).toBe(1);
    expect(derivePslPeriodNumber('2026-01-16')).toBe(2);
    expect(derivePslPeriodNumber('2026-01-31')).toBe(2);
    // July
    expect(derivePslPeriodNumber('2026-07-06')).toBe(13); // 1Q July
    expect(derivePslPeriodNumber('2026-07-20')).toBe(14); // 2Q July
  });

  it('should calculate correct Excel date serial numbers (dateToExcelSerial)', () => {
    expect(dateToExcelSerial('2026-07-01')).toBe(46204);
    expect(dateToExcelSerial('2026-07-02')).toBe(46205);
  });

  it('should convert decimal hours to H.MM base 60 (decimalHoursToHMM)', () => {
    expect(decimalHoursToHMM(new Decimal(5.50))).toBe('5.30');
    expect(decimalHoursToHMM(new Decimal(2.50))).toBe('2.30');
    expect(decimalHoursToHMM(new Decimal(3.833))).toBe('3.50');
    expect(decimalHoursToHMM(new Decimal(1.00))).toBe('1.00');
  });
});

describe('GeneratePslReportUseCase', () => {
  let attendanceRepo: any;
  let operarioRepo: any;
  let useCase: GeneratePslReportUseCase;

  const mockOperario: Operario = {
    id: 'O1',
    fullName: 'Juan Perez',
    documento: '1040364416',
    supervisorId: 'S1',
    cargo: 'Barrido',
    deactivatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    attendanceRepo = {
      findManyWithBreakdown: jest.fn(),
    };
    operarioRepo = {
      findMany: jest.fn().mockResolvedValue([mockOperario]),
    };
    useCase = new GeneratePslReportUseCase(attendanceRepo, operarioRepo);
  });

  it('should generate report rows for normal day', async () => {
    const mockBreakdown: AttendanceBreakdown = {
      id: 'B1',
      attendanceId: 'A1',
      horasOrdinariasDiurnas: new Decimal(8.0),
      horasOrdinariasNocturnas: new Decimal(1.0),
      horasExtraDiurnas: new Decimal(2.0),
      horasExtraNocturnas: new Decimal(0.5),
      totalHoras: new Decimal(11.5),
      esDominical: false,
      esFestivo: false,
      esDiaLaboral: true,
      jornadaPolicyId: 'P1',
      horaInicioAplicada: '07:00',
      horaFinAplicada: '17:00',
      horasDiariasAplicada: new Decimal(8.4),
      tramoInicioOrdDiurna: '07:00',
      tramoFinOrdDiurna: '15:00',
      tramoInicioOrdNocturno: '19:00',
      tramoFinOrdNocturno: '20:00',
      tramoInicioExtraDiurna: '15:00',
      tramoFinExtraDiurna: '17:00',
      tramoInicioExtraNocturna: '20:00',
      tramoFinExtraNocturna: '20:30',
      classifiedAt: new Date(),
      recalculatedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAttendance: any = {
      id: 'A1',
      operarioId: 'O1',
      date: '2026-07-01',
      completedAt: new Date(),
      breakdown: mockBreakdown,
    };

    attendanceRepo.findManyWithBreakdown.mockResolvedValue([mockAttendance]);

    const result = await useCase.execute({ desde: '2026-07-01', hasta: '2026-07-15' });

    // Should report:
    // Concept 010 (Recargo Nocturno): 1.00h (1.00) from 19:00 to 20:00
    // Concept 015 (Extra Diurna): 2.00h (2.00) from 15:00 to 17:00
    // Concept 016 (Extra Nocturna): 0.50h (0.30) from 20:00 to 20:30
    // Ordinary diurna is not reported on normal days (no surcharge/extra).
    expect(result).toHaveLength(3);

    expect(result).toContainEqual(expect.objectContaining({
      concepto: '010',
      horasOrdinaria: '1.00',
      horaInicio: '19:00',
      horaFinal: '20:00',
    }));

    expect(result).toContainEqual(expect.objectContaining({
      concepto: '015',
      horasOrdinaria: '2.00',
      horaInicio: '15:00',
      horaFinal: '17:00',
    }));

    expect(result).toContainEqual(expect.objectContaining({
      concepto: '016',
      horasOrdinaria: '0.30', // 0.5 decimal hours -> 30 mins -> 0.30
      horaInicio: '20:00',
      horaFinal: '20:30',
    }));
  });

  it('should generate report rows for Sunday/holiday (esDominical)', async () => {
    const mockBreakdown: AttendanceBreakdown = {
      id: 'B1',
      attendanceId: 'A1',
      horasOrdinariasDiurnas: new Decimal(6.0),
      horasOrdinariasNocturnas: new Decimal(2.0),
      horasExtraDiurnas: new Decimal(1.5),
      horasExtraNocturnas: new Decimal(0.0),
      totalHoras: new Decimal(9.5),
      esDominical: true,
      esFestivo: false,
      esDiaLaboral: false,
      jornadaPolicyId: 'P1',
      horaInicioAplicada: '07:00',
      horaFinAplicada: '17:00',
      horasDiariasAplicada: new Decimal(8.4),
      tramoInicioOrdDiurna: '07:00',
      tramoFinOrdDiurna: '13:00',
      tramoInicioOrdNocturno: '19:00',
      tramoFinOrdNocturno: '21:00',
      tramoInicioExtraDiurna: '13:00',
      tramoFinExtraDiurna: '14:30',
      tramoInicioExtraNocturna: null,
      tramoFinExtraNocturna: null,
      classifiedAt: new Date(),
      recalculatedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAttendance: any = {
      id: 'A1',
      operarioId: 'O1',
      date: '2026-07-05', // Sunday
      completedAt: new Date(),
      breakdown: mockBreakdown,
    };

    attendanceRepo.findManyWithBreakdown.mockResolvedValue([mockAttendance]);

    const result = await useCase.execute({ desde: '2026-07-01', hasta: '2026-07-15' });

    // Should report:
    // Concept 014 (Recargo Dominical/Festivo): 6.00h (6.00) from 07:00 to 13:00 (ordinary diurna on Sunday)
    // Concept 009 (Recargo Festivo Nocturno): 2.00h (2.00) from 19:00 to 21:00 (ordinary nocturna on Sunday)
    // Concept 011 (Hora Extra Festiva Diurna): 1.5h (1.30) from 13:00 to 14:30 (extra diurna on Sunday)
    expect(result).toHaveLength(3);

    expect(result).toContainEqual(expect.objectContaining({
      concepto: '014',
      horasOrdinaria: '6.00',
      horaInicio: '07:00',
      horaFinal: '13:00',
    }));

    expect(result).toContainEqual(expect.objectContaining({
      concepto: '009',
      horasOrdinaria: '2.00',
      horaInicio: '19:00',
      horaFinal: '21:00',
    }));

    expect(result).toContainEqual(expect.objectContaining({
      concepto: '011',
      horasOrdinaria: '1.30', // 1.5h -> 1h 30m -> 1.30
      horaInicio: '13:00',
      horaFinal: '14:30',
    }));
  });

  it('should split cross-midnight category tramos proportionally', async () => {
    const mockBreakdown: AttendanceBreakdown = {
      id: 'B1',
      attendanceId: 'A1',
      horasOrdinariasDiurnas: new Decimal(0.0),
      horasOrdinariasNocturnas: new Decimal(5.0), // 22:00 to 03:00 next day
      horasExtraDiurnas: new Decimal(0.0),
      horasExtraNocturnas: new Decimal(0.0),
      totalHoras: new Decimal(5.0),
      esDominical: false,
      esFestivo: false,
      esDiaLaboral: true,
      jornadaPolicyId: 'P1',
      horaInicioAplicada: '22:00',
      horaFinAplicada: '06:00',
      horasDiariasAplicada: new Decimal(8.0),
      tramoInicioOrdDiurna: null,
      tramoFinOrdDiurna: null,
      tramoInicioOrdNocturno: '22:00',
      tramoFinOrdNocturno: '03:00',
      tramoInicioExtraDiurna: null,
      tramoFinExtraDiurna: null,
      tramoInicioExtraNocturna: null,
      tramoFinExtraNocturna: null,
      classifiedAt: new Date(),
      recalculatedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAttendance: any = {
      id: 'A1',
      operarioId: 'O1',
      date: '2026-07-01',
      completedAt: new Date(),
      breakdown: mockBreakdown,
    };

    attendanceRepo.findManyWithBreakdown.mockResolvedValue([mockAttendance]);

    const result = await useCase.execute({ desde: '2026-07-01', hasta: '2026-07-15' });

    // Should split Concept 010 (Recargo Nocturno) into:
    // Row 1: Day 2026-07-01 (serial 46206) from 22:00 to 23:59. Hours: 2.0h (decimal) -> "2.00"
    // Row 2: Day 2026-07-02 (serial 46207) from 00:00 to 03:00. Hours: 3.0h (decimal) -> "3.00"
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual(expect.objectContaining({
      concepto: '010',
      diaLaborado: 46204, // July 1st
      horasOrdinaria: '2.00',
      horaInicio: '22:00',
      horaFinal: '23:59',
    }));

    expect(result[1]).toEqual(expect.objectContaining({
      concepto: '010',
      diaLaborado: 46205, // July 2nd
      horasOrdinaria: '3.00',
      horaInicio: '00:00',
      horaFinal: '03:00',
    }));
  });
});
