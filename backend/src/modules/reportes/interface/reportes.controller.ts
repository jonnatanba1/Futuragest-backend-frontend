import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Roles } from '../../iam/interface/roles.decorator';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { GeneratePslReportUseCase } from '../application/generate-psl-report.use-case';
import { PslReportRowDto } from '../../../contracts/shared/reportes';

export class PslReportQuery {
  @ApiProperty({ description: 'YYYY-MM-DD Colombia local', example: '2026-07-01' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe estar en formato YYYY-MM-DD' })
  desde!: string;

  @ApiProperty({ description: 'YYYY-MM-DD Colombia local', example: '2026-07-15' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe estar en formato YYYY-MM-DD' })
  hasta!: string;

  @ApiProperty({ required: false, description: 'Filtro por zona' })
  @IsOptional()
  @IsString()
  zoneId?: string;
}

@Controller('reportes')
export class ReportesController {
  constructor(private readonly useCase: GeneratePslReportUseCase) {}

  @Roles('TALENTO_HUMANO', 'SYSTEM_ADMIN')
  @Get('psl')
  async getPslReport(
    @Query() query: PslReportQuery,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!query.desde || !dateRegex.test(query.desde) || !query.hasta || !dateRegex.test(query.hasta)) {
      throw new BadRequestException('Los parámetros "desde" y "hasta" son requeridos en formato YYYY-MM-DD');
    }
    if (query.desde > query.hasta) {
      throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
    }

    const rows = await this.useCase.execute(query);

    const accept = req.headers['accept'] || '';
    if (accept.includes('text/csv')) {
      const csv = convertToCsv(rows);
      const bom = '\uFEFF';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="plano-psl-${query.desde}-a-${query.hasta}.csv"`);
      res.status(HttpStatus.OK).send(bom + csv);
      return;
    }

    res.status(HttpStatus.OK).json(rows);
  }
}

function convertToCsv(rows: PslReportRowDto[]): string {
  const header = 'COMPAÑÍA,CEDULA,CONCEPTO,AÑO,PERIODO,NUMERO DE HORAS ORDINARIA,TIPO DE HORA,DIA LABORADO,TIPO MVTO,HORA INICIO,HORA FINAL';
  const csvRows = rows.map((r) =>
    `${r.compania},${r.cedula},${r.concepto},${r.anio},${r.periodo},${r.horasOrdinaria},${r.tipoHora},${r.diaLaborado},${r.tipoMvto},${r.horaInicio},${r.horaFinal}`
  );
  return [header, ...csvRows].join('\r\n');
}
