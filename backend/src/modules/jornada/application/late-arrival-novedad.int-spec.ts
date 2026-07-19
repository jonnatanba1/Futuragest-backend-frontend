/**
 * T3.5 — Integration test for LateArrivalNovedadService.
 *
 * Tests the full flow: seed policy → create attendance → call service → verify novedad.
 * Uses the real database via AppModule (requires PostgreSQL).
 *
 * Scenarios:
 *   INT-01: checkIn outside tolerance → LLEGADA_TARDE novedad created
 *   INT-02: idempotent — calling again on same attendance → no duplicate
 *   INT-03: checkIn within tolerance → no novedad
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../database/prisma.service';
import { LateArrivalNovedadService } from './late-arrival-novedad.service';
import { JornadaPolicy, Attendance } from '@prisma/client';

describe.skip('LateArrivalNovedadService (Integration)', () => {
  let prisma: PrismaService;
  let service: LateArrivalNovedadService;
  let app: TestingModule;

  const TEST_DATE = '2026-07-01';
  const TEST_SUPERVISOR_ID = 'sup-int-late';
  const TEST_ZONE_ID = 'zone-int-late';
  const TEST_OPERARIO_ID = 'op-int-late';

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = app.get(PrismaService);
    service = app.get(LateArrivalNovedadService);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.novedad.deleteMany({
      where: { attendance: { supervisorId: TEST_SUPERVISOR_ID } },
    });
    await prisma.attendance.deleteMany({
      where: { supervisorId: TEST_SUPERVISOR_ID },
    });
    await prisma.jornadaPolicy.deleteMany({
      where: { operarioId: TEST_OPERARIO_ID },
    });
    await app.close();
  });

  // ─── Helper to build UTC Date from Colombia local time ─────────────────
  function colombiaDate(dateStr: string, hour: number, minute: number): Date {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCHours(hour + 5, minute, 0, 0); // Colombia = UTC-5
    return d;
  }

  let policy: JornadaPolicy;
  let attendanceLate: Attendance;
  let attendanceOnTime: Attendance;

  beforeAll(async () => {
    // ── Seed zone-level policy: 06:00 start, 5 min tolerance ─────────
    // Per-operario resolution tested in unit tests (S1-S8).
    // Using zone-level to avoid fake operario FK violations in integration.
    policy = await prisma.jornadaPolicy.create({
      data: {
        operarioId: null,
        zoneId: null,
        horaInicio: '06:00',
        horaFin: '14:00',
        diasLaborales: [1, 2, 3, 4, 5], // Mon-Fri (July 1, 2026 is Wed)
        toleranciaMin: 5,
        horasDiarias: '7.50',
        horasSemanales: '37.50',
        vigenteDesde: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    // ── Create a "late" attendance: checkIn @ 06:06 = 1 min past tolerance ─
    attendanceLate = await prisma.attendance.create({
      data: {
        supervisorId: TEST_SUPERVISOR_ID,
        operarioId: TEST_OPERARIO_ID,
        zoneId: TEST_ZONE_ID,
        date: TEST_DATE,
        checkInCapturedAt: colombiaDate(TEST_DATE, 6, 6),
        checkInReceivedAt: new Date(),
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: `int-late-ref-${Date.now()}-1`,
      },
    });

    // ── Create an "on time" attendance: checkIn @ 06:03 = within tolerance ─
    attendanceOnTime = await prisma.attendance.create({
      data: {
        supervisorId: TEST_SUPERVISOR_ID,
        operarioId: TEST_OPERARIO_ID,
        zoneId: TEST_ZONE_ID,
        date: TEST_DATE,
        checkInCapturedAt: colombiaDate(TEST_DATE, 6, 3),
        checkInReceivedAt: new Date(),
        checkInLat: 7.5,
        checkInLng: -76.5,
        clientRef: `int-late-ref-${Date.now()}-2`,
      },
    });
  });

  // ── INT-01: checkIn outside tolerance → novedad created ──────────────

  it('INT-01: creates LLEGADA_TARDE novedad when checkIn is past tolerance', async () => {
    await service.checkAndCreateLateArrivalNovedad(attendanceLate.id);

    const novedad = await prisma.novedad.findFirst({
      where: { attendanceId: attendanceLate.id },
    });

    expect(novedad).not.toBeNull();
    expect(novedad!.tipoNovedad).toBe('LLEGADA_TARDE');
    expect(novedad!.autoGenerada).toBe(true);
    expect(novedad!.minutosTarde).toBe(6);
    expect(novedad!.status).toBe('PENDING');
    expect(novedad!.supervisorId).toBe(TEST_SUPERVISOR_ID);
    expect(novedad!.zoneId).toBe(TEST_ZONE_ID);
  });

  // ── INT-02: idempotent — calling again → no duplicate ────────────────

  it('INT-02: calling again is idempotent (no duplicate novedad)', async () => {
    // Count before
    const countBefore = await prisma.novedad.count({
      where: { attendanceId: attendanceLate.id },
    });
    expect(countBefore).toBe(1);

    // Call again — should be swallowed by P2002 catch
    await service.checkAndCreateLateArrivalNovedad(attendanceLate.id);

    // Count after — must still be 1
    const countAfter = await prisma.novedad.count({
      where: { attendanceId: attendanceLate.id },
    });
    expect(countAfter).toBe(1);
  });

  // ── INT-03: checkIn within tolerance → no novedad ────────────────────

  it('INT-03: does NOT create novedad when checkIn is within tolerance', async () => {
    // 06:03 is within 5-min tolerance of 06:00
    await service.checkAndCreateLateArrivalNovedad(attendanceOnTime.id);

    const novedad = await prisma.novedad.findFirst({
      where: { attendanceId: attendanceOnTime.id },
    });

    expect(novedad).toBeNull();
  });
});
