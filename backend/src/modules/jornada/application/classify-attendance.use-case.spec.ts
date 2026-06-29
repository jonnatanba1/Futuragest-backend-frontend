import { ClassifyAttendanceUseCase } from './classify-attendance.use-case';
import { Decimal } from '@prisma/client/runtime/client';
import { Attendance, JornadaPolicy, Holiday, SurchargeRate, SurchargeCategory } from '@prisma/client';

describe('ClassifyAttendanceUseCase', () => {
  const mockAttendance: Attendance = {
    id: 'ATT-1',
    supervisorId: 'S1',
    operarioId: 'O1',
    zoneId: 'Z1',
    date: '2026-06-29', // Monday
    checkInCapturedAt: new Date('2026-06-29T12:00:00.000Z'), // UTC: 12:00, so local check-in is 7:00 Colombia
    checkInReceivedAt: new Date(),
    checkInLat: 7.5,
    checkInLng: -76.5,
    checkInAccuracy: 10,
    checkOutCapturedAt: new Date('2026-06-29T22:00:00.000Z'), // UTC: 22:00, so local check-out is 17:00 Colombia
    checkOutReceivedAt: new Date(),
    checkOutLat: 7.5,
    checkOutLng: -76.5,
    checkOutAccuracy: 12,
    checkInVerification: null,
    checkOutVerification: null,
    checkInPhotoKey: 'photos/in.png',
    checkOutPhotoKey: 'photos/out.png',
    clientRef: 'REF-A',
    checkOutClientRef: 'REF-B',
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPolicy: JornadaPolicy = {
    id: 'POL-1',
    operarioId: null,
    zoneId: null,
    horaInicio: '07:00',
    horaFin: '17:00',
    diasLaborales: [1, 2, 3, 4, 5],
    almuerzoInicio: null,
    almuerzoFin: null,
    toleranciaMin: 5,
    horasDiarias: new Decimal(8.4),
    horasSemanales: new Decimal(42.0),
    vigenteDesde: new Date('2026-06-01'),
    createdAt: new Date(),
  };

  const mockHolidays: Holiday[] = [
    {
      id: 'HOL-1',
      date: '2026-07-20',
      name: 'Día de la Independencia',
      type: 'FIXED',
      year: 2026,
      isManual: false,
      createdAt: new Date(),
    },
  ];

  const mockRates: SurchargeRate[] = [
    {
      id: '1',
      category: SurchargeCategory.RECARGO_NOCTURNO,
      percentage: new Decimal(35.0),
      vigenteDesde: new Date('2025-07-01'),
      creadoPor: 'admin',
      legalRef: 'Art 168',
      createdAt: new Date(),
    },
  ];

  let attendanceRepo: any;
  let policyRepo: any;
  let holidayRepo: any;
  let surchargeRepo: any;
  let breakdownRepo: any;
  let useCase: ClassifyAttendanceUseCase;

  beforeEach(() => {
    attendanceRepo = {
      findById: jest.fn().mockResolvedValue(mockAttendance),
      create: jest.fn(),
      findMany: jest.fn(),
      findByClientRef: jest.fn(),
      findByCheckOutClientRef: jest.fn(),
      findByOperarioAndDate: jest.fn(),
      update: jest.fn(),
    };

    policyRepo = {
      findLatest: jest.fn().mockResolvedValue(mockPolicy),
    };

    holidayRepo = {
      findByDate: jest.fn(),
      findManyByYear: jest.fn().mockResolvedValue(mockHolidays),
      createMany: jest.fn().mockResolvedValue(undefined),
    };

    surchargeRepo = {
      findAll: jest.fn().mockResolvedValue(mockRates),
    };

    breakdownRepo = {
      upsert: jest.fn().mockResolvedValue({}),
      findByAttendanceId: jest.fn(),
    };

    useCase = new ClassifyAttendanceUseCase(
      attendanceRepo,
      policyRepo,
      holidayRepo,
      surchargeRepo,
      breakdownRepo,
    );
  });

  it('should successfully classify check-out and save breakdown', async () => {
    await useCase.classifyAttendance('ATT-1');

    expect(attendanceRepo.findById).toHaveBeenCalledWith('ATT-1');
    expect(policyRepo.findLatest).toHaveBeenCalledWith('O1', 'Z1', expect.any(Date));
    expect(holidayRepo.findManyByYear).toHaveBeenCalledWith(2026);
    expect(breakdownRepo.upsert).toHaveBeenCalledWith('ATT-1', expect.any(Object));

    const upsertData = breakdownRepo.upsert.mock.calls[0][1];
    // With auto-lunch (midpoint 12:00 ± 30min → 11:30-12:30):
    // 7:00-11:30 = 270 min, 11:30-12:30 lunch skip, 12:30-17:00 = 270 min
    // Total worked: 540 min = 9.0h. Limit: 8.4h.
    // Ordinary: 8.4h, Extra: 0.6h
    expect(upsertData.horasOrdinariasDiurnas.toNumber()).toBe(8.4);
    expect(upsertData.horasExtraDiurnas.toNumber()).toBe(0.6);
    expect(upsertData.totalHoras.toNumber()).toBe(9.0);
    expect(upsertData.esDominical).toBe(false);
    expect(upsertData.esFestivo).toBe(false);
    expect(upsertData.esDiaLaboral).toBe(true);
  });

  it('should auto-seed holidays if findManyByYear returns empty', async () => {
    holidayRepo.findManyByYear.mockResolvedValueOnce([]).mockResolvedValueOnce(mockHolidays);

    await useCase.classifyAttendance('ATT-1');

    expect(holidayRepo.createMany).toHaveBeenCalled();
  });

  describe('Virtual check-out (T2.3)', () => {
    let incompleteAttendance: Attendance;

    beforeEach(() => {
      // Fresh copy each test — Object.assign in the use-case mutates the returned object
      incompleteAttendance = {
        ...mockAttendance,
        completedAt: null,
        checkOutCapturedAt: null,
      };

      const completedAttendance: Attendance = {
        ...incompleteAttendance,
        completedAt: new Date('2026-06-29T17:00:00.000Z'),
        checkOutCapturedAt: new Date('2026-06-29T17:00:00.000Z'),
        checkOutReceivedAt: new Date(),
      };
      attendanceRepo.findById
        .mockResolvedValueOnce(incompleteAttendance)
        .mockResolvedValueOnce(completedAttendance);
      attendanceRepo.update.mockResolvedValue(completedAttendance);
    });

    it('should auto-complete via virtual check-out when enabled', async () => {
      process.env.CHECK_OUT_VIRTUAL_ENABLED = 'true';

      await useCase.classifyAttendance('ATT-1');

      expect(attendanceRepo.update).toHaveBeenCalledWith('ATT-1', expect.objectContaining({
        completedAt: expect.any(Date),
        checkOutCapturedAt: expect.any(Date),
      }));
      expect(breakdownRepo.upsert).toHaveBeenCalled();
    });

    it('should NOT auto-complete when virtual check-out is disabled', async () => {
      process.env.CHECK_OUT_VIRTUAL_ENABLED = 'false';

      await useCase.classifyAttendance('ATT-1');

      expect(attendanceRepo.update).not.toHaveBeenCalled();
      expect(breakdownRepo.upsert).not.toHaveBeenCalled();
    });

    afterEach(() => {
      delete process.env.CHECK_OUT_VIRTUAL_ENABLED;
    });
  });
});
