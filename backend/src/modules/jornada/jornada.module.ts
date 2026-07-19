import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AsistenciaModule } from '../asistencia/asistencia.module';
import { NovedadesModule } from '../novedades/novedades.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ATTENDANCE_CLASSIFICATION_PORT } from '../asistencia/domain/ports/attendance-classification.port';
import { LATE_ARRIVAL_NOVEDAD_PORT } from '../asistencia/domain/ports/late-arrival-novedad.port';
import { COMPENSATORY_REST_PORT } from '../asistencia/domain/ports/compensatory-rest.port';
import { ClassifyAttendanceUseCase } from './application/classify-attendance.use-case';
import { LateArrivalNovedadService } from './application/late-arrival-novedad.service';
import { CompensatoryRestService } from './application/compensatory-rest.service';
import { JornadaController } from './interface/jornada.controller';
import { CompensatorioController } from './interface/compensatorio.controller';
import { HolidaysController } from './interface/holidays.controller';
import { SurchargeRatesController } from './interface/surcharge-rates.controller';
import { JORNADA_POLICY_REPOSITORY_PORT } from './domain/ports/jornada-policy-repository.port';
import { PrismaJornadaPolicyRepository } from './infrastructure/prisma-jornada-policy.repository';
import { HOLIDAY_REPOSITORY_PORT } from './domain/ports/holiday-repository.port';
import { PrismaHolidayRepository } from './infrastructure/prisma-holiday.repository';
import { SURCHARGE_RATE_REPOSITORY_PORT } from './domain/ports/surcharge-rate-repository.port';
import { PrismaSurchargeRateRepository } from './infrastructure/prisma-surcharge-rate.repository';
import { ATTENDANCE_BREAKDOWN_REPOSITORY_PORT } from './domain/ports/attendance-breakdown-repository.port';
import { PrismaAttendanceBreakdownRepository } from './infrastructure/prisma-attendance-breakdown.repository';
import { COMPENSATORY_REST_REPOSITORY_PORT } from './domain/ports/compensatory-rest-repository.port';
import type { CompensatoryRestRepositoryPort } from './domain/ports/compensatory-rest-repository.port';
import type { AttendanceBreakdownRepositoryPort } from './domain/ports/attendance-breakdown-repository.port';
import { PrismaCompensatoryRestRepository } from './infrastructure/prisma-compensatory-rest.repository';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AsistenciaModule),
    forwardRef(() => NovedadesModule),
    NotificationsModule,
  ],
  controllers: [JornadaController, CompensatorioController, HolidaysController, SurchargeRatesController],
  providers: [
    {
      provide: ATTENDANCE_CLASSIFICATION_PORT,
      useClass: ClassifyAttendanceUseCase,
    },
    {
      provide: JORNADA_POLICY_REPOSITORY_PORT,
      useClass: PrismaJornadaPolicyRepository,
    },
    {
      provide: HOLIDAY_REPOSITORY_PORT,
      useClass: PrismaHolidayRepository,
    },
    {
      provide: SURCHARGE_RATE_REPOSITORY_PORT,
      useClass: PrismaSurchargeRateRepository,
    },
    {
      provide: ATTENDANCE_BREAKDOWN_REPOSITORY_PORT,
      useClass: PrismaAttendanceBreakdownRepository,
    },
    {
      provide: LATE_ARRIVAL_NOVEDAD_PORT,
      useClass: LateArrivalNovedadService,
    },
    {
      provide: COMPENSATORY_REST_REPOSITORY_PORT,
      useClass: PrismaCompensatoryRestRepository,
    },
    {
      provide: COMPENSATORY_REST_PORT,
      useClass: CompensatoryRestService,
    },
  ],
  exports: [
    ATTENDANCE_CLASSIFICATION_PORT,
    LATE_ARRIVAL_NOVEDAD_PORT,
    COMPENSATORY_REST_PORT,
    JORNADA_POLICY_REPOSITORY_PORT,
    HOLIDAY_REPOSITORY_PORT,
    SURCHARGE_RATE_REPOSITORY_PORT,
    ATTENDANCE_BREAKDOWN_REPOSITORY_PORT,
  ],
})
export class JornadaModule {}
