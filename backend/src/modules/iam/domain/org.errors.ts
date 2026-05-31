/**
 * Org domain error classes.
 *
 * These are pure domain errors — no framework dependencies.
 * The interface layer maps them to HTTP status codes.
 */

/**
 * Thrown when attempting to assign a user who does not have the COORDINADOR role
 * to a zone coordinator position.
 */
export class InvalidCoordinadorRoleError extends Error {
  constructor(actualRole: string) {
    super(
      `[org] Cannot assign user as zone coordinator: user has role "${actualRole}" but COORDINADOR is required.`,
    );
    this.name = 'InvalidCoordinadorRoleError';
  }
}

/**
 * Thrown when attempting to provision a user with a role that is not in the
 * management provisioning whitelist (GERENCIA, TALENTO_HUMANO, LIDER_OPERATIVO).
 * SYSTEM_ADMIN, SUPERVISOR, and COORDINADOR cannot be created via this endpoint.
 */
export class UnsupportedProvisionRoleError extends Error {
  constructor(requestedRole: string) {
    super(
      `[org] Cannot provision user with role "${requestedRole}". ` +
        `Only GERENCIA, TALENTO_HUMANO, and LIDER_OPERATIVO are provisionable via this endpoint.`,
    );
    this.name = 'UnsupportedProvisionRoleError';
  }
}

/**
 * Thrown when a zone lookup by id returns no record.
 */
export class ZoneNotFoundError extends Error {
  constructor(zoneId: string) {
    super(`[org] Zone not found: "${zoneId}".`);
    this.name = 'ZoneNotFoundError';
  }
}

/**
 * Thrown when a user lookup by id returns no record.
 */
export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`[org] User not found: "${userId}".`);
    this.name = 'UserNotFoundError';
  }
}

/**
 * Thrown when attempting to create a user with an email that is already registered.
 */
export class EmailInUseError extends Error {
  constructor(email: string) {
    super(`[org] Email already in use: "${email}".`);
    this.name = 'EmailInUseError';
  }
}
