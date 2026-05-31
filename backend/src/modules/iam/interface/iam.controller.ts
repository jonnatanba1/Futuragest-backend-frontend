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
import { ScopedSupervisorRepository } from '../infrastructure/scoped-supervisor.repository';
import { ScopedOperarioRepository } from '../infrastructure/scoped-operario.repository';
import { ScopedAssignmentRepository } from '../infrastructure/scoped-assignment.repository';
import { Roles } from './roles.decorator';

// ─── Query DTOs ──────────────────────────────────────────────────────────────

class ListOperariosQuery {
  @IsOptional()
  @IsISO8601({}, { message: 'since must be a valid ISO 8601 date string' })
  since?: string;

  @IsOptional()
  includeInactive?: string;
}

/**
 * Roles permitted to access IAM read endpoints.
 * Design §3.4: both layers required — coarse gate (here) + row filter (ScopedRepository).
 * LIDER_OPERATIVO intentionally excluded: global-scope but no IAM list operational need.
 */
const IAM_READ_ROLES = [
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
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
  async listSupervisors() {
    return this.supervisorRepo.findMany();
  }

  @Roles(...IAM_READ_ROLES)
  @Get('supervisors/:id')
  async getSupervisor(@Param('id') id: string) {
    const supervisor = await this.supervisorRepo.findById(id);
    if (!supervisor) {
      throw new NotFoundException('Supervisor not found');
    }
    return supervisor;
  }

  // ─── Operarios ───────────────────────────────────────────────────────────

  @Roles(...IAM_READ_ROLES)
  @Get('operarios')
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
  async getOperario(@Param('id') id: string) {
    const operario = await this.operarioRepo.findById(id);
    if (!operario) {
      throw new NotFoundException('Operario not found');
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
      throw new NotFoundException('Assignment not found');
    }
    return assignment;
  }
}
