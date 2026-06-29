import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { JornadaPolicy } from '@prisma/client';
import { JornadaPolicyRepositoryPort } from '../domain/ports/jornada-policy-repository.port';

@Injectable()
export class PrismaJornadaPolicyRepository implements JornadaPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findLatest(operarioId: string | null, zoneId: string | null, date: Date): Promise<JornadaPolicy | null> {
    // 1. Try operario-level (highest priority)
    if (operarioId) {
      const operarioPolicy = await this.prisma.jornadaPolicy.findFirst({
        where: {
          operarioId,
          vigenteDesde: { lte: date },
        },
        orderBy: { vigenteDesde: 'desc' },
      });
      if (operarioPolicy) return operarioPolicy;
    }

    // 2. Fallback: zone-level (zoneId specified, operarioId IS NULL)
    if (zoneId) {
      const zonePolicy = await this.prisma.jornadaPolicy.findFirst({
        where: {
          zoneId,
          operarioId: null,
          vigenteDesde: { lte: date },
        },
        orderBy: { vigenteDesde: 'desc' },
      });
      if (zonePolicy) return zonePolicy;
    }

    // 3. Fallback: global (both operarioId and zoneId are NULL)
    return this.prisma.jornadaPolicy.findFirst({
      where: {
        operarioId: null,
        zoneId: null,
        vigenteDesde: { lte: date },
      },
      orderBy: { vigenteDesde: 'desc' },
    });
  }
}
