/**
 * T4.9 — @Roles() decorator.
 *
 * Marks a route (or controller) with the set of roles that may access it.
 * RolesGuard reads this metadata to enforce coarse-grained role membership.
 *
 * Usage:
 *   @Roles('SYSTEM_ADMIN', 'GERENCIA')
 *   @Get('/admin-only')
 *   adminHandler() { ... }
 */

import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../auth/domain/scope-context';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
