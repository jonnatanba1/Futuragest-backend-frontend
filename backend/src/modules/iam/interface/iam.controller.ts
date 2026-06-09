/**
 * T4.8 — IAM Controller.
 *
 * Surfaces scoped reads for the scope-isolation integration suite.
 * All reads go through ScopedRepository subclasses — never raw Prisma.
 *
 * Routes:
 *   GET /iam/supervisors           → list supervisors (scoped by role)
 *   GET /iam/supervisors/:id       → get one supervisor (404 if out of scope)
 *   GET /iam/operarios             → list operarios (scoped by role)
 *   GET /iam/operarios/:id         → get one operario (404 if out of scope)
 *   GET /iam/assignments           → list assignments (scoped by role)
 *   GET /iam/assignments/:id       → get one assignment (404 if out of scope)
 *
 * C2 fix (design §3.4): @Roles() guards added to enforce the COARSE role layer.
 * Permitted roles: SYSTEM_ADMIN, GERENCIA, TALENTO_HUMANO, COORDINADOR, SUPERVISOR.
 * LIDER_OPERATIVO is excluded — no operational need for IAM list endpoints.
 * The scope filter still applies per-row within permitted roles.
 *
 * Two-layer defense:
 *   Layer 1 (RolesGuard + @Roles): coarse — is this role allowed to hit this route?
 *   Layer 2 (applyScopeFilter):    fine  — which rows may THIS principal see?
 *
 * No write endpoints in this PR — writes are a future change.
 */

import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { SupervisorDto } from '@futuragest/contracts';
import { ApiOkResponse } from '@nestjs/swagger';
import { SupervisorResponseDto, OperarioResponseDto } from './response-dtos';
import {
  ScopedSupervisorRepository,
  type SupervisorWithUser,
} from '../infrastructure/scoped-supervisor.repository';
import { ScopedOperarioRepository } from '../infrastructure/scoped-operario.repository';
import { ScopedAssignmentRepository } from '../infrastructure/scoped-assignment.repository';
import { Roles } from './roles.decorator';

/** Map an enriched supervisor row to the public SupervisorDto (email flattened). */
function toSupervisorDto(s: SupervisorWithUser): SupervisorDto {
  return {
    id: s.id,
    userId: s.userId,
    municipioId: s.municipioId,
    zoneId: s.zoneId,
    area: s.area,
    email: s.user.email,
    createdAt: s.createdAt.toISOString(),
  };
}

// ─── Query DTOs ──────────────────────────────────────────────────────────────

class ListOperariosQuery {
  @IsOptional()
  @IsISO8601({}, { message: 'since debe ser una fecha ISO 8601 válida' })
  since?: string;

  @IsOptional()
  includeInactive?: string;
}

/**
 * Roles permitted to access IAM read endpoints.
 * Design §3.4: both layers required — coarse gate (here) + row filter (ScopedRepository).
 * LIDER_OPERATIVO is included so it can resolve operario/supervisor names when
 * reviewing attendance/novedades (it approves novedades and must see who they
 * belong to). All roles read IAM at their scope (globals see all; COORDINADOR and
 * SUPERVISOR are row-filtered by ScopedRepository).
 */
const IAM_READ_ROLES = [
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'LIDER_OPERATIVO',
  'COORDINADOR',
  'SUPERVISOR',
] as const;

@Controller('iam')
export class IamController {
  constructor(
    private readonly supervisorRepo: ScopedSupervisorRepository,
    private readonly operarioRepo: ScopedOperarioRepository,
    private readonly assignmentRepo: ScopedAssignmentRepository,
  ) {}

  // ─── Supervisors ─────────────────────────────────────────────────────────

  @Roles(...IAM_READ_ROLES)
  @Get('supervisors')
  @ApiOkResponse({ type: SupervisorResponseDto, isArray: true })
  async listSupervisors(): Promise<SupervisorDto[]> {
    const supervisors = await this.supervisorRepo.findManyWithUser();
    return supervisors.map(toSupervisorDto);
  }

  @Roles(...IAM_READ_ROLES)
  @Get('supervisors/:id')
  @ApiOkResponse({ type: SupervisorResponseDto })
  async getSupervisor(@Param('id') id: string): Promise<SupervisorDto> {
    const supervisor = await this.supervisorRepo.findByIdWithUser(id);
    if (!supervisor) {
      throw new NotFoundException('Supervisor no encontrado');
    }
    return toSupervisorDto(supervisor);
  }

  // ─── Operarios ───────────────────────────────────────────────────────────

  @Roles(...IAM_READ_ROLES)
  @Get('operarios')
  @ApiOkResponse({ type: OperarioResponseDto, isArray: true })
  async listOperarios(@Query() rawQuery: Record<string, string>) {
    // Validate query params manually (global ValidationPipe only handles @Body — @Query
    // with a DTO class needs explicit class-transformer + class-validator round-trip)
    const query = plainToInstance(ListOperariosQuery, rawQuery);
    const errors = validateSync(query);
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages);
    }

    // Delta mode: when ?since= present, bypass deactivatedAt:null filter so
    // tombstones (deactivated operarios) are included — client learns of deactivations.
    // Non-delta mode: honour ?includeInactive=true (or exclude inactive by default).
    if (query.since) {
      const since = new Date(query.since);
      return this.operarioRepo.findMany({ updatedAt: { gte: since } });
    }

    // REQ-08: exclude inactive by default; ?includeInactive=true includes all
    const where = query.includeInactive === 'true' ? {} : { deactivatedAt: null };
    return this.operarioRepo.findMany(where);
  }

  @Roles(...IAM_READ_ROLES)
  @Get('operarios/:id')
  @ApiOkResponse({ type: OperarioResponseDto })
  async getOperario(@Param('id') id: string) {
    const operario = await this.operarioRepo.findById(id);
    if (!operario) {
      throw new NotFoundException('Operario no encontrado');
    }
    return operario;
  }

  // ─── Assignments ─────────────────────────────────────────────────────────

  @Roles(...IAM_READ_ROLES)
  @Get('assignments')
  async listAssignments() {
    return this.assignmentRepo.findMany();
  }

  @Roles(...IAM_READ_ROLES)
  @Get('assignments/:id')
  async getAssignment(@Param('id') id: string) {
    const assignment = await this.assignmentRepo.findById(id);
    if (!assignment) {
      throw new NotFoundException('Asignación no encontrada');
    }
    return assignment;
  }
}
