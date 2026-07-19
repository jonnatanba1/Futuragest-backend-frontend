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
      `No se puede asignar al usuario como coordinador de zona: el usuario tiene el rol "${actualRole}" pero se requiere COORDINADOR.`,
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
      `No se puede crear un usuario con el rol "${requestedRole}". ` +
        `Solo GERENCIA, TALENTO_HUMANO y LIDER_OPERATIVO son aprovisionables mediante este endpoint.`,
    );
    this.name = 'UnsupportedProvisionRoleError';
  }
}

/**
 * Thrown when a zone lookup by id returns no record.
 */
export class ZoneNotFoundError extends Error {
  constructor(zoneId: string) {
    super(`Zona no encontrada: "${zoneId}".`);
    this.name = 'ZoneNotFoundError';
  }
}

/**
 * Thrown when a user lookup by id returns no record.
 */
export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`Usuario no encontrado: "${userId}".`);
    this.name = 'UserNotFoundError';
  }
}

/**
 * Thrown when attempting to create a user with an email that is already registered.
 */
export class EmailInUseError extends Error {
  constructor(email: string) {
    super(`El correo ya está en uso: "${email}".`);
    this.name = 'EmailInUseError';
  }
}

/**
 * Thrown when creating or updating a zone with a name that already exists.
 */
export class ZoneNameInUseError extends Error {
  constructor(name: string) {
    super(`Ya existe una zona con el nombre "${name}".`);
    this.name = 'ZoneNameInUseError';
  }
}

/**
 * Thrown when attempting to delete a zone that still has associated municipios,
 * supervisors, or a coordinador assigned — referential integrity guard.
 */
export class ZoneHasDependentsError extends Error {
  constructor(zoneId: string) {
    super(
      `No se puede eliminar la zona "${zoneId}": tiene municipios, supervisores o coordinador asociados.`,
    );
    this.name = 'ZoneHasDependentsError';
  }
}

/**
 * Thrown when a municipio lookup by id returns no record.
 */
export class MunicipioNotFoundError extends Error {
  constructor(municipioId: string) {
    super(`Municipio no encontrado: "${municipioId}".`);
    this.name = 'MunicipioNotFoundError';
  }
}

/**
 * Thrown when creating or updating a municipio with a (zoneId, name) pair that already exists.
 */
export class MunicipioNameInUseError extends Error {
  constructor(name: string, zoneId: string) {
    super(`Ya existe un municipio con el nombre "${name}" en la zona "${zoneId}".`);
    this.name = 'MunicipioNameInUseError';
  }
}

/**
 * Thrown when attempting to delete a municipio that still has supervisors assigned.
 */
export class MunicipioHasDependentsError extends Error {
  constructor(municipioId: string) {
    super(`No se puede eliminar el municipio "${municipioId}": tiene supervisores asignados.`);
    this.name = 'MunicipioHasDependentsError';
  }
}

/**
 * Thrown when the municipioId provided does not belong to the given zoneId.
 * Supervisor creation requires municipio and zone to be consistent.
 */
export class MunicipioNotInZoneError extends Error {
  constructor(municipioId: string, zoneId: string) {
    super(
      `El municipio "${municipioId}" no pertenece a la zona "${zoneId}".`,
    );
    this.name = 'MunicipioNotInZoneError';
  }
}

/**
 * Thrown when a supervisor lookup by id returns no record.
 */
export class SupervisorNotFoundError extends Error {
  constructor(supervisorId: string) {
    super(`Supervisor no encontrado: "${supervisorId}".`);
    this.name = 'SupervisorNotFoundError';
  }
}
