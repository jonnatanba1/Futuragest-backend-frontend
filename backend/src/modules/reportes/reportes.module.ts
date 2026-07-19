import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { AsistenciaModule } from '../asistencia/asistencia.module';
import { ReportesController } from './interface/reportes.controller';
import { GeneratePslReportUseCase } from './application/generate-psl-report.use-case';

@Module({
  imports: [
    IamModule,
    AsistenciaModule,
  ],
  controllers: [ReportesController],
  providers: [
    GeneratePslReportUseCase,
  ],
})
export class ReportesModule {}
