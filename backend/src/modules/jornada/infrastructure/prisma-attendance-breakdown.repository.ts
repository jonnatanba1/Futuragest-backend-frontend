import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AttendanceBreakdown, Prisma } from '@prisma/client';
import { AttendanceBreakdownRepositoryPort } from '../domain/ports/attendance-breakdown-repository.port';

@Injectable()
export class PrismaAttendanceBreakdownRepository implements AttendanceBreakdownRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    attendanceId: string,
    data: Prisma.AttendanceBreakdownUncheckedCreateInput,
  ): Promise<AttendanceBreakdown> {
    return this.prisma.attendanceBreakdown.upsert({
      where: { attendanceId },
      create: data,
      update: {
        horasOrdinariasDiurnas: data.horasOrdinariasDiurnas,
        horasOrdinariasNocturnas: data.horasOrdinariasNocturnas,
        horasExtraDiurnas: data.horasExtraDiurnas,
        horasExtraNocturnas: data.horasExtraNocturnas,
        totalHoras: data.totalHoras,
        esDominical: data.esDominical,
        esFestivo: data.esFestivo,
        esDiaLaboral: data.esDiaLaboral,
        jornadaPolicyId: data.jornadaPolicyId,
        horaInicioAplicada: data.horaInicioAplicada,
        horaFinAplicada: data.horaFinAplicada,
        horasDiariasAplicada: data.horasDiariasAplicada,
        tramoInicioOrdNocturno: data.tramoInicioOrdNocturno,
        tramoFinOrdNocturno: data.tramoFinOrdNocturno,
        tramoInicioExtraDiurna: data.tramoInicioExtraDiurna,
        tramoFinExtraDiurna: data.tramoFinExtraDiurna,
        tramoInicioExtraNocturna: data.tramoInicioExtraNocturna,
        tramoFinExtraNocturna: data.tramoFinExtraNocturna,
        tramoInicioOrdDiurna: data.tramoInicioOrdDiurna,
        tramoFinOrdDiurna: data.tramoFinOrdDiurna,
        version: { increment: 1 },
        recalculatedAt: data.recalculatedAt || new Date(),
      },
    });
  }

  async findByAttendanceId(attendanceId: string): Promise<AttendanceBreakdown | null> {
    return this.prisma.attendanceBreakdown.findUnique({
      where: { attendanceId },
    });
  }
}
