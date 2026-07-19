/**
 * Área domain error classes.
 *
 * These are pure domain errors — no framework dependencies.
 * The interface layer maps them to HTTP status codes.
 */

/**
 * Thrown when an área lookup by id returns no record.
 */
export class AreaNotFoundError extends Error {
  constructor(areaId: string) {
    super(`Área no encontrada: "${areaId}".`);
    this.name = 'AreaNotFoundError';
  }
}

/**
 * Thrown when creating or updating an área with a (zoneId, name) pair that already exists.
 */
export class AreaNameInUseError extends Error {
  constructor(name: string, zoneId: string) {
    super(`Ya existe un área con el nombre "${name}" en la zona "${zoneId}".`);
    this.name = 'AreaNameInUseError';
  }
}

/**
 * Thrown when attempting to delete an área that still has associated operarios
 * or other dependents — referential integrity guard.
 */
export class AreaHasDependentsError extends Error {
  constructor(areaId: string) {
    super(
      `No se puede eliminar el área "${areaId}": tiene dependientes asociados.`,
    );
    this.name = 'AreaHasDependentsError';
  }
}
