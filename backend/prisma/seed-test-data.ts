import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { createPrismaClient } from '../src/database/prisma-client';
import { Decimal } from '@prisma/client/runtime/client';
import { SurchargeCategory, CompensatoryType, CompensatoryStatus } from '@prisma/client';

const prisma = createPrismaClient();

async function main() {
  console.log('Seeding rich transactional test data for July 1-15, 2026...');

  // 1. Get a supervisor and 3 operarios
  const supervisor = await prisma.supervisor.findFirst({
    include: { user: true, zone: true }
  });
  if (!supervisor) {
    throw new Error('No supervisor found. Please run the main seed first.');
  }

  const operarios = await prisma.operario.findMany({
    where: { supervisorId: supervisor.id },
    take: 3
  });
  if (operarios.length < 3) {
    throw new Error('Not enough operarios. Please run pnpm exec tsx prisma/seed-operarios.ts first.');
  }

  const zoneId = supervisor.zoneId;
  const policy = await prisma.jornadaPolicy.findFirst({
    where: { zoneId: null, operarioId: null } // Global policy
  });
  if (!policy) {
    throw new Error('No global policy found.');
  }

  // Clear existing transactions for these specific operarios to avoid duplicates
  const operarioIds = operarios.map(o => o.id);
  await prisma.novedad.deleteMany({
    where: { attendance: { operarioId: { in: operarioIds } } }
  });
  await prisma.compensatoryRest.deleteMany({
    where: { operarioId: { in: operarioIds } }
  });
  await prisma.attendanceBreakdown.deleteMany({
    where: { attendance: { operarioId: { in: operarioIds } } }
  });
  await prisma.attendance.deleteMany({
    where: { operarioId: { in: operarioIds } }
  });
  await prisma.compensationPeriod.deleteMany({
    where: { operarioId: { in: operarioIds } }
  });
  await prisma.jornadaPolicy.deleteMany({
    where: { operarioId: { in: operarioIds } }
  });

  const [op1, op2, op3] = operarios;

  const admin = await prisma.user.findFirst({
    where: { role: 'SYSTEM_ADMIN' }
  });
  if (!admin) {
    throw new Error('No admin user found. Run the main seed first.');
  }

  console.log(`Using supervisor: ${supervisor.user?.email || supervisor.id}`);
  console.log(`Using operario 1: ${op1.fullName} (${op1.documento})`);
  console.log(`Using operario 2: ${op2.fullName} (${op2.documento})`);
  console.log(`Using operario 3: ${op3.fullName} (${op3.documento})`);

  // --- Operario 1: Normal shifts + Overtime ---
  // Wed July 1, 2026: 06:00 to 14:00 (Normal 7.00h ord diurna)
  const att1 = await prisma.attendance.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-01',
      checkInCapturedAt: new Date('2026-07-01T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-01T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-01T14:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-01T14:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-1-${op1.documento}`,
      completedAt: new Date('2026-07-01T14:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(7.00),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(0.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(7.00),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:00',
          tramoFinOrdDiurna: '14:00'
        }
      }
    }
  });

  // Thu July 2, 2026: 06:15 to 14:00 (Late arrival 15m, 6.75h ord diurna)
  const att2 = await prisma.attendance.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-02',
      checkInCapturedAt: new Date('2026-07-02T06:15:00Z'),
      checkInReceivedAt: new Date('2026-07-02T06:15:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-02T14:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-02T14:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-2-${op1.documento}`,
      completedAt: new Date('2026-07-02T14:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(6.75),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(0.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(6.75),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:15',
          tramoFinOrdDiurna: '14:00'
        }
      }
    }
  });
  // Auto late-arrival novelty
  await prisma.novedad.create({
    data: {
      attendanceId: att2.id,
      supervisorId: supervisor.id,
      zoneId,
      tipoNovedad: 'LLEGADA_TARDE',
      autoGenerada: true,
      minutosTarde: 15,
      horasExtra: new Decimal(0.00),
      motivo: 'Llegada tarde detectada automáticamente (tolerancia 5 min)',
      status: 'PENDING'
    }
  });

  // Fri July 3, 2026: 06:00 to 16:30 (2h extra diurna approved)
  const att3 = await prisma.attendance.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-03',
      checkInCapturedAt: new Date('2026-07-03T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-03T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-03T16:30:00Z'),
      checkOutReceivedAt: new Date('2026-07-03T16:30:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-3-${op1.documento}`,
      completedAt: new Date('2026-07-03T16:30:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(7.00),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(2.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(9.00),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:00',
          tramoFinOrdDiurna: '14:00',
          tramoInicioExtraDiurna: '14:30',
          tramoFinExtraDiurna: '16:30'
        }
      }
    }
  });
  await prisma.novedad.create({
    data: {
      attendanceId: att3.id,
      supervisorId: supervisor.id,
      zoneId,
      tipoNovedad: 'HORAS_EXTRA',
      autoGenerada: false,
      horasExtra: new Decimal(2.00),
      motivo: 'Apoyo en descargue de residuos',
      status: 'APPROVED',
      decisionVerification: 'BIOMETRIC',
      decidedAt: new Date('2026-07-03T17:00:00Z')
    }
  });

  // --- Operario 1: Closed Fortnight (June 16-30, 2026) with Carry-over ---
  await prisma.compensationPeriod.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      periodKey: '2026-06-Q2',
      desde: '2026-06-16',
      hasta: '2026-06-30',
      creditos: new Decimal(2.00),
      debitos: new Decimal(6.50),
      carryIn: new Decimal(0.00),
      saldo: new Decimal(-4.50),
      disposition: 'CARRY_OVER',
      approvedByUserId: admin.id,
      decidedAt: new Date('2026-06-30T17:00:00Z'),
      closedAt: new Date('2026-06-30T17:00:00Z'),
      clientRef: `ref-june-q2-close-${op1.documento}`
    }
  });

  // --- Operario 1: Additional Attendance for July 6, 2026 ---
  await prisma.attendance.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-06',
      checkInCapturedAt: new Date('2026-07-06T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-06T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-06T15:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-06T15:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-6-${op1.documento}`,
      completedAt: new Date('2026-07-06T15:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(7.00),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(1.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(8.00),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:00',
          tramoFinOrdDiurna: '14:00',
          tramoInicioExtraDiurna: '14:00',
          tramoFinExtraDiurna: '15:00'
        }
      }
    }
  });

  // --- Operario 1: Closed Fortnight (July 1-15, 2026) with Payroll Deduction ---
  await prisma.compensationPeriod.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      periodKey: '2026-07-Q1',
      desde: '2026-07-01',
      hasta: '2026-07-15',
      creditos: new Decimal(3.00),
      debitos: new Decimal(0.25),
      carryIn: new Decimal(-4.50), // negative carryIn from 2026-06-Q2
      saldo: new Decimal(-1.75), // -4.50 + 3.00 - 0.25
      disposition: 'PAYROLL_DEDUCTION',
      approvedByUserId: admin.id,
      decidedAt: new Date('2026-07-15T17:00:00Z'),
      closedAt: new Date('2026-07-15T17:00:00Z'),
      clientRef: `ref-july-q1-close-${op1.documento}`
    }
  });

  // --- Operario 1: Open Fortnight (July 16-31, 2026) for Balance and Close Testing ---
  // July 16, 2026: 06:00 to 14:00 (Normal 7.00h shift)
  await prisma.attendance.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-16',
      checkInCapturedAt: new Date('2026-07-16T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-16T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-16T14:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-16T14:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-16-${op1.documento}`,
      completedAt: new Date('2026-07-16T14:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(7.00),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(0.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(7.00),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:00',
          tramoFinOrdDiurna: '14:00'
        }
      }
    }
  });

  // July 17, 2026: 06:00 to 12:00 (6.00h real shift, delta = -1.00h)
  await prisma.attendance.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-17',
      checkInCapturedAt: new Date('2026-07-17T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-17T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-17T12:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-17T12:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-17-${op1.documento}`,
      completedAt: new Date('2026-07-17T12:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(6.00),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(0.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(6.00),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:00',
          tramoFinOrdDiurna: '12:00'
        }
      }
    }
  });

  // July 18, 2026: 06:00 to 12:00 (6.00h real shift, delta = -1.00h)
  await prisma.attendance.create({
    data: {
      operarioId: op1.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-18',
      checkInCapturedAt: new Date('2026-07-18T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-18T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-18T12:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-18T12:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-18-${op1.documento}`,
      completedAt: new Date('2026-07-18T12:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(6.00),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(0.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(6.00),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:00',
          tramoFinOrdDiurna: '12:00'
        }
      }
    }
  });

  // --- Operario 2: Sunday + Holidays ---
  // Sun July 5, 2026: 06:00 to 14:00 (Sunday shift, 7h dominical ordinaria)
  const att4 = await prisma.attendance.create({
    data: {
      operarioId: op2.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-05',
      checkInCapturedAt: new Date('2026-07-05T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-05T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-05T14:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-05T14:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-5-${op2.documento}`,
      completedAt: new Date('2026-07-05T14:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(7.00),
          horasOrdinariasNocturnas: new Decimal(0.00),
          horasExtraDiurnas: new Decimal(0.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(7.00),
          esDiaLaboral: false,
          esDominical: true,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '06:00',
          horaFinAplicada: '14:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdDiurna: '06:00',
          tramoFinOrdDiurna: '14:00'
        }
      }
    }
  });
  // Occasional Sunday compensatory rest
  await prisma.compensatoryRest.create({
    data: {
      operarioId: op2.id,
      attendanceId: att4.id,
      month: '2026-07',
      type: 'OCCASIONAL',
      status: 'PENDING'
    }
  });

  // --- Operario 3: Midnight Crossing ---
  // Shift: Tue July 7, 2026 22:00 to Wed July 8, 2026 06:00
  const att5 = await prisma.attendance.create({
    data: {
      operarioId: op3.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-07',
      checkInCapturedAt: new Date('2026-07-07T22:00:00Z'),
      checkInReceivedAt: new Date('2026-07-07T22:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      checkOutCapturedAt: new Date('2026-07-08T06:00:00Z'),
      checkOutReceivedAt: new Date('2026-07-08T06:00:00Z'),
      checkOutLat: 8.6382,
      checkOutLng: -75.2648,
      clientRef: `ref-july-7-${op3.documento}`,
      completedAt: new Date('2026-07-08T06:00:00Z'),
      breakdown: {
        create: {
          horasOrdinariasDiurnas: new Decimal(0.00),
          horasOrdinariasNocturnas: new Decimal(7.00),
          horasExtraDiurnas: new Decimal(0.00),
          horasExtraNocturnas: new Decimal(0.00),
          totalHoras: new Decimal(7.00),
          esDiaLaboral: true,
          esDominical: false,
          esFestivo: false,
          jornadaPolicyId: policy.id,
          horaInicioAplicada: '22:00',
          horaFinAplicada: '06:00',
          horasDiariasAplicada: new Decimal(7.00),
          tramoInicioOrdNocturno: '22:00',
          tramoFinOrdNocturno: '06:00'
        }
      }
    }
  });

  // Overtime request that is PENDING for Op 3 to allow testing approve/reject flow
  const att6 = await prisma.attendance.create({
    data: {
      operarioId: op3.id,
      zoneId,
      supervisorId: supervisor.id,
      date: '2026-07-08',
      checkInCapturedAt: new Date('2026-07-08T06:00:00Z'),
      checkInReceivedAt: new Date('2026-07-08T06:00:00Z'),
      checkInLat: 8.6382,
      checkInLng: -75.2648,
      clientRef: `ref-july-8-${op3.documento}`
    }
  });
  await prisma.novedad.create({
    data: {
      attendanceId: att6.id,
      supervisorId: supervisor.id,
      zoneId,
      tipoNovedad: 'HORAS_EXTRA',
      autoGenerada: false,
      horasExtra: new Decimal(2.00),
      motivo: 'Recolección adicional en centro comercial',
      status: 'PENDING'
    }
  });

  console.log('\nSeed successful!');
  console.log('Created:');
  console.log('  - 10 Attendance records');
  console.log('  - 9 AttendanceBreakdown records');
  console.log('  - 3 Novedad records');
  console.log('  - 1 CompensatoryRest record');
  console.log('  - 2 CompensationPeriod records');
}

main().catch(console.error).finally(() => prisma.$disconnect());
