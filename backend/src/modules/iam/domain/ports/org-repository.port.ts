/**
 * OrgRepositoryPort — domain port for organisation management operations.
 *
 * This is a pure domain interface (hexagonal port). The infrastructure
 * layer provides the concrete adapter (PrismaOrgRepository).
 *
 * Naming convention: methods reflect business intent, not Prisma operations.
 */

import type { Zone, Municipio, Role } from '@prisma/client';

/** Parameters for creating a new management user. */
export interface CreateManagementUserParams {
  email: string;
  passwordHash: string;
  role: Role;
}

/** Parameters for assigning a coordinador to a zone. */
export interface AssignCoordinadorParams {
  userId: string;
  zoneId: string;
}

/**
 * Port: org data operations.
 * Implemented by PrismaOrgRepository (infrastructure slice — WU-6).
 */
export interface OrgRepositoryPort {
  /**
   * Persists a new management-role user.
   * Throws EmailInUseError if the email is already registered.
   */
  createManagementUser(params: CreateManagementUserParams): Promise<{ id: string }>;

  /**
   * Assigns a COORDINADOR to a zone inside a $transaction.
   * Clear-then-set ordering:
   *   1. Clear coordinatedZoneId on any current holder of zoneId.
   *   2. Set coordinatedZoneId = zoneId on the target user.
   * Throws ZoneNotFoundError if zoneId does not exist.
   * Throws UserNotFoundError if userId does not exist.
   * Throws InvalidCoordinadorRoleError if the target user is not a COORDINADOR.
   */
  assignCoordinador(params: AssignCoordinadorParams): Promise<void>;

  /**
   * Returns all zones visible to the current principal (scope applied by
   * ScopedZoneRepository, not by this port directly).
   */
  findZones(): Promise<Zone[]>;

  /**
   * Returns all municipios visible to the current principal (scope applied by
   * ScopedMunicipioRepository, not by this port directly).
   */
  findMunicipios(): Promise<Municipio[]>;
}

/** Injection token for OrgRepositoryPort. */
export const ORG_REPOSITORY_PORT = Symbol('OrgRepositoryPort');
