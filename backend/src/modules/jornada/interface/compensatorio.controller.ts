import { Controller, Get, Patch, Param, Body, Query, Inject, NotFoundException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../iam/interface/roles.decorator';
import { COMPENSATORY_REST_REPOSITORY_PORT, type CompensatoryRestRepositoryPort, type CompensatoryRestRecord } from '../domain/ports/compensatory-rest-repository.port';

export class ScheduleCompensatoryBody {
  scheduledDate!: string;
  notes?: string | null;
}

@ApiTags('compensatorios')
@Controller('compensatorio')
export class CompensatorioController {
  constructor(
    @Inject(COMPENSATORY_REST_REPOSITORY_PORT)
    private readonly restRepo: CompensatoryRestRepositoryPort,
  ) {}

  @Roles('SUPERVISOR', 'COORDINADOR', 'SYSTEM_ADMIN', 'GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO')
  @Get()
  @ApiOkResponse({ description: 'Lista de descansos compensatorios' })
  async list(@Query('operarioId') operarioId?: string, @Query('month') month?: string): Promise<CompensatoryRestRecord[]> {
    return this.restRepo.findMany({ operarioId, month });
  }

  @Roles('TALENTO_HUMANO', 'SYSTEM_ADMIN')
  @Patch(':id/schedule')
  @ApiOkResponse({ description: 'Programa la fecha de un descanso compensatorio' })
  async schedule(@Param('id') id: string, @Body() body: ScheduleCompensatoryBody): Promise<CompensatoryRestRecord> {
    const updated = await this.restRepo.update(id, {
      status: 'SCHEDULED',
      scheduledDate: body.scheduledDate,
      notes: body.notes,
    });
    if (!updated) {
      throw new NotFoundException('Descanso compensatorio no encontrado');
    }
    return updated;
  }
}
