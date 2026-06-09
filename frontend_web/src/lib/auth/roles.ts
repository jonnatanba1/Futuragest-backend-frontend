import type { RoleName } from '@futuragest/contracts';

/** Office (back-office) roles — the audience for the web admin panel. */
export const OFFICE_ROLES: RoleName[] = [
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'LIDER_OPERATIVO',
  'COORDINADOR',
];

/**
 * Office roles allowed to READ operarios. This is the backend IAM_READ_ROLES
 * minus SUPERVISOR (not an office role). Note LIDER_OPERATIVO is intentionally
 * absent — the backend's IAM_READ_ROLES does not grant it IAM read access.
 */
export const OPERARIO_READ_ROLES: RoleName[] = [
  'SYSTEM_ADMIN',
  'GERENCIA',
  'TALENTO_HUMANO',
  'COORDINADOR',
];

/** Roles allowed to create/deactivate/reactivate operarios (backend OPERARIO_WRITE_ROLES). */
export const OPERARIO_WRITE_ROLES: RoleName[] = ['SYSTEM_ADMIN', 'TALENTO_HUMANO'];

/** Roles allowed to approve/reject novedades (backend APPROVE_REJECT_ROLES). */
export const NOVEDAD_APPROVE_ROLES: RoleName[] = ['LIDER_OPERATIVO', 'SYSTEM_ADMIN'];

/** Roles allowed to close fortnights, view payout, and manage jornada policies. */
export const COMPENSACION_WRITE_ROLES: RoleName[] = ['SYSTEM_ADMIN', 'TALENTO_HUMANO'];

/** Roles allowed into the master-data administration section. Admin-only for now. */
export const ADMIN_ROLES: RoleName[] = ['SYSTEM_ADMIN'];

export function hasAnyRole(
  role: RoleName | undefined | null,
  allowed: readonly RoleName[],
): boolean {
  return role != null && allowed.includes(role);
}
