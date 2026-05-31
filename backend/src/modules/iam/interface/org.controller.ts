/**
 * OrgController — interface layer for org management endpoints.
 *
 * Routes:
 *   GET  /org/zones                  → list zones (scope-filtered by role)
 *   GET  /org/municipios             → list municipios (scope-filtered by role)
 *   POST /org/coordinadores/assign   → assign a COORDINADOR to a zone
 *   POST /org/users                  → provision a management-role user
 *
 * Authorization model (TWO layers):
 *   ORG_READ_ROLES : SYSTEM_ADMIN, GERENCIA, TALENTO_HUMANO, LIDER_OPERATIVO, COORDINADOR
 *     → All four GLOBAL_ROLES plus COORDINADOR (scoped to their own zone via ScopedZoneRepository).
 *     → SUPERVISOR intentionally excluded: no org-level read permission.
 *   ORG_WRITE_ROLES: SYSTEM_ADMIN, TALENTO_HUMANO
 *     → Coarse gate for both write endpoints (@Roles decorator).
 *     → For provisioning, a second application-layer check (inside the use-case) enforces
 *       the privilege-escalation guard (TALENTO_HUMANO cannot provision GERENCIA).
 *
 * Domain error → HTTP mapping (interface responsibility):
 *   ZoneNotFoundError            → 404 NotFoundException
 *   UserNotFoundError            → 404 NotFoundException
 *   InvalidCoordinadorRoleError  → 400 BadRequestException
 *   UnsupportedProvisionRoleError→ 400 BadRequestException
 *   EmailInUseError              → 409 ConflictException
 *   ForbiddenException           → 403 (already a NestJS exception — re-thrown as-is)
 *
 * IamController (supervisor/operario routes) is NOT modified — its IAM_READ_ROLES
 * guard (§3.4) remains unchanged (LIDER_OPERATIVO excluded from those routes).
 */

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import type { Role } from '@prisma/client';
import { Roles } from './roles.decorator';
import type { AssignCoordinadorToZoneUseCase } from '../application/assign-coordinador-to-zone.use-case';
import type { ProvisionManagementUserUseCase } from '../application/provision-management-user.use-case';
import type { OrgRepositoryPort } from '../domain/ports/org-repository.port';
import {
  ZoneNotFoundError,
  UserNotFoundError,
  InvalidCoordinadorRoleError,
  UnsupportedProvisionRoleError,
  EmailInUseError,
} from '../domain/org.errors';

// ─── Injection tokens ─────────────────────────────────────────────────────────

export const ORG_REPO = Symbol('OrgRepositoryPort');
export const ASSIGN_COORDINADOR_USE_CASE = Symbol('AssignCoordinadorToZoneUseCase');
export const PROVISION_MANAGEMENT_USER_USE_CASE = Symbol('ProvisionManagementUserUseCase');

// ─── Role constants ───────────────────────────────────────────────────────────

/**
 * Roles permitted to access org READ endpoints.
 * Includes all GLOBAL_ROLES + COORDINADOR (scoped to their own zone).
 * SUPERVISOR intentionally excluded: no zone-level read permission.
 */
export const ORG_READ_ROLES = [
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'LIDER_OPERATIVO',
  'COORDINADOR',
] as const;

/**
 * Roles permitted to access org WRITE endpoints (coarse gate only).
 * A second privilege-escalation check lives inside ProvisionManagementUserUseCase.
 */
export const ORG_WRITE_ROLES = ['SYSTEM_ADMIN', 'TALENTO_HUMANO'] as const;

/**
 * Roles that may be the TARGET of a provisioning request.
 * Mirrors the use-case whitelist; enforced here so an unsupported role is
 * rejected by ValidationPipe with a 400 before reaching the use-case.
 * GERENCIA stays valid here — the privilege-escalation guard (use-case) is what
 * blocks a TALENTO_HUMANO actor from provisioning it (403), not input validation.
 */
export const PROVISIONABLE_ROLES = ['GERENCIA', 'TALENTO_HUMANO', 'LIDER_OPERATIVO'] as const;

// ─── Request DTOs (NestJS-side — minimal, framework-aware) ───────────────────
// @IsString() decorators are required for ValidationPipe whitelist mode:
// without them, all fields are stripped and arrive as undefined.

export class AssignCoordinadorBody {
  @IsString()
  userId!: string;

  @IsString()
  zoneId!: string;
}

export class ProvisionUserBody {
  @IsString()
  email!: string;

  @IsString()
  password!: string;

  @IsIn(PROVISIONABLE_ROLES)
  role!: string;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('org')
export class OrgController {
  constructor(
    @Inject(ORG_REPO) private readonly orgRepo: OrgRepositoryPort,
    @Inject(ASSIGN_COORDINADOR_USE_CASE)
    private readonly assignUseCase: Pick<AssignCoordinadorToZoneUseCase, 'execute'>,
    @Inject(PROVISION_MANAGEMENT_USER_USE_CASE)
    private readonly provisionUseCase: Pick<ProvisionManagementUserUseCase, 'execute'>,
  ) {}

  // ─── Read endpoints ────────────────────────────────────────────────────────

  @Roles(...ORG_READ_ROLES)
  @Get('zones')
  async listZones() {
    return this.orgRepo.findZones();
  }

  @Roles(...ORG_READ_ROLES)
  @Get('municipios')
  async listMunicipios() {
    return this.orgRepo.findMunicipios();
  }

  // ─── Write endpoints ───────────────────────────────────────────────────────

  @Roles(...ORG_WRITE_ROLES)
  @Post('coordinadores/assign')
  @HttpCode(HttpStatus.OK)
  async assignCoordinador(@Body() body: AssignCoordinadorBody): Promise<void> {
    try {
      await this.assignUseCase.execute({ userId: body.userId, zoneId: body.zoneId });
    } catch (err) {
      if (err instanceof ZoneNotFoundError || err instanceof UserNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof InvalidCoordinadorRoleError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Roles(...ORG_WRITE_ROLES)
  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async provisionUser(@Body() body: ProvisionUserBody): Promise<{ id: string }> {
    try {
      return await this.provisionUseCase.execute({
        email: body.email,
        password: body.password,
        role: body.role as Role,
      });
    } catch (err) {
      if (err instanceof UnsupportedProvisionRoleError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof EmailInUseError) {
        throw new ConflictException(err.message);
      }
      // ForbiddenException from privilege-escalation guard — re-throw as-is
      throw err;
    }
  }
}
