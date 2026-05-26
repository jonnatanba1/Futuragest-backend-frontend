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
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ScopedSupervisorRepository } from '../infrastructure/scoped-supervisor.repository';
import { ScopedOperarioRepository } from '../infrastructure/scoped-operario.repository';
import { ScopedAssignmentRepository } from '../infrastructure/scoped-assignment.repository';
import { Roles } from './roles.decorator';

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
  async listOperarios() {
    return this.operarioRepo.findMany();
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
