/**
 * Auth domain — AuthUser projection.
 *
 * Minimal user data needed by the auth module. Keeps auth domain decoupled
 * from the full IAM/org module.
 */
export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  mustChangePassword: boolean;
  coordinatedZoneId?: string | null; // present for COORDINADOR
  supervisorId?: string | null; // present for SUPERVISOR (Supervisor.id, not User.id)
  supervisorZoneId?: string | null; // present for SUPERVISOR (Supervisor.zoneId — needed in JWT scope)
}
