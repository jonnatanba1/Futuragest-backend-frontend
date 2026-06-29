import { Controller, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../../iam/interface/roles.decorator';
import { ClassifyAttendanceUseCase } from '../application/classify-attendance.use-case';
import { ATTENDANCE_CLASSIFICATION_PORT } from '../../asistencia/domain/ports/attendance-classification.port';

@Controller('jornada')
export class JornadaController {
  constructor(
    @Inject(ATTENDANCE_CLASSIFICATION_PORT)
    private readonly classifyUseCase: ClassifyAttendanceUseCase,
  ) {}

  /**
   * T2.4 — Auto-complete pending attendances (MVP: on-demand, not cron).
   *
   * Queries recent attendances without completedAt, computes virtual check-out,
   * and auto-completes those whose virtual check-out time has passed.
   */
  @Roles('SUPERVISOR', 'COORDINADOR', 'SYSTEM_ADMIN', 'GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO')
  @Post('auto-complete')
  @ApiOperation({ summary: 'Auto-completar asistencias pendientes con check-out virtual' })
  @ApiOkResponse({ description: 'Resultado del auto-completado' })
  async autoComplete() {
    return this.classifyUseCase.autoCompletePending();
  }
}
