/**
 * OrgRepositoryPort — domain port for organisation management operations.
 *
 * This is a pure domain interface (hexagonal port). The infrastructure
 * layer provides the concrete adapter (PrismaOrgRepository).
 *
 * Naming convention: methods reflect business intent, not Prisma operations.
 */

import type { Zone, Municipio, Area, Role } from '@prisma/client';

/** Parameters for creating a new management user. */
export interface CreateManagementUserParams {
  email: string;
  passwordHash: string;
  role: Role;
  displayName?: string;
}

/** Parameters for assigning a coordinador to a zone. */
export interface AssignCoordinadorParams {
  userId: string;
  zoneId: string;
}

/** User projection for admin listing — NEVER includes passwordHash. */
export interface UserListItem {
  id: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  coordinatedZoneId: string | null;
  displayName: string | null;
  createdAt: Date;
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

  // ─── Zone CRUD ─────────────────────────────────────────────────────────────

  /**
   * Creates a new zone with the given name.
   * Throws ZoneNameInUseError if a zone with that name already exists.
   */
  createZone(params: { name: string }): Promise<{ id: string }>;

  /**
   * Updates a zone's name.
   * Throws ZoneNotFoundError if the zone does not exist.
   * Throws ZoneNameInUseError if the new name is already taken by another zone.
   */
  updateZone(id: string, params: { name: string }): Promise<Zone>;

  /**
   * Deletes a zone.
   * Throws ZoneNotFoundError if the zone does not exist.
   * Throws ZoneHasDependentsError if the zone has any municipios, supervisors, or a coordinador.
   */
  deleteZone(id: string): Promise<void>;

  // ─── Municipio CRUD ────────────────────────────────────────────────────────

  /**
   * Creates a new municipio in the given zone.
   * Throws ZoneNotFoundError if zoneId does not exist.
   * Throws MunicipioNameInUseError if (zoneId, name) already exists.
   */
  createMunicipio(params: { name: string; zoneId: string }): Promise<{ id: string }>;

  /**
   * Updates a municipio's name and/or zone.
   * Throws MunicipioNotFoundError if the municipio does not exist.
   * Throws ZoneNotFoundError if the new zoneId does not exist.
   * Throws MunicipioNameInUseError if the resulting (zoneId, name) pair is already taken.
   */
  updateMunicipio(id: string, params: { name?: string; zoneId?: string }): Promise<Municipio>;

  /**
   * Deletes a municipio.
   * Throws MunicipioNotFoundError if the municipio does not exist.
   * Throws MunicipioHasDependentsError if the municipio has supervisors assigned.
   */
  deleteMunicipio(id: string): Promise<void>;

  // ─── Users (admin) ─────────────────────────────────────────────────────────

  /** Lists all users (admin view). Projection NEVER includes passwordHash. */
  findUsers(): Promise<UserListItem[]>;

  /**
   * Updates a user's displayName and/or role.
   * Throws UserNotFoundError if the user does not exist.
   */
  updateUser(id: string, data: { displayName?: string; role?: Role }): Promise<UserListItem>;

  // ─── Área CRUD ─────────────────────────────────────────────────────────────

  /**
   * Returns all áreas visible to the current principal (scope applied by
   * ScopedAreaRepository, not by this port directly).
   */
  findAreas(): Promise<Area[]>;

  /**
   * Creates a new área in the given zone.
   * Throws ZoneNotFoundError if zoneId does not exist.
   * Throws AreaNameInUseError if (zoneId, name) already exists.
   */
  createArea(params: { name: string; horaInicio: string; horaFin: string; zoneId: string }): Promise<{ id: string }>;

  /**
   * Updates an área's name, schedule, and/or zone.
   * Throws AreaNotFoundError if the área does not exist.
   * Throws ZoneNotFoundError if the new zoneId does not exist.
   * Throws AreaNameInUseError if the resulting (zoneId, name) pair is already taken.
   */
  updateArea(id: string, params: { name?: string; horaInicio?: string; horaFin?: string; zoneId?: string }): Promise<Area>;

  /**
   * Deletes an área.
   * Throws AreaNotFoundError if the área does not exist.
   * Throws AreaHasDependentsError if the área has associated operarios or other dependents.
   */
  deleteArea(id: string): Promise<void>;
}

/** Injection token for OrgRepositoryPort. */
export const ORG_REPOSITORY_PORT = Symbol('OrgRepositoryPort');
