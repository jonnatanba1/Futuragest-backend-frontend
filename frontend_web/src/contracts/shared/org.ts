/**
 * Org management contract types.
 *
 * Response DTOs for Zone and Municipio, and request DTOs for org write endpoints.
 * These are plain TypeScript types — no framework decorators — shared between
 * frontend and backend.
 */

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/** Zone returned by GET /org/zones */
export interface ZoneResponseDto {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  /** ISO 8601 timestamp — used as delta cursor for ?since= queries (Change 3) */
  updatedAt: string;
}

/** Municipio returned by GET /org/municipios */
export interface MunicipioResponseDto {
  id: string;
  name: string;
  zoneId: string;
  createdAt: string; // ISO 8601
  /** ISO 8601 timestamp — used as delta cursor for ?since= queries (Change 3) */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/** Body for POST /org/coordinadores/assign */
export interface AssignCoordinadorDto {
  userId: string;
  zoneId: string;
}

/**
 * Body for POST /org/users.
 * role must be one of: GERENCIA | TALENTO_HUMANO | LIDER_OPERATIVO
 * (validated by the use-case; contracts package stays framework-agnostic).
 */
export interface ProvisionUserDto {
  email: string;
  password: string;
  role: string;
  /** Optional human-readable display name. Falls back to email when null. */
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Área (editable-areas-with-schedules)
// ---------------------------------------------------------------------------

/** Área returned by GET /org/areas and PATCH /org/areas/:id */
export interface AreaResponseDto {
  id: string;
  name: string;
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  zoneId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Body for POST /org/areas */
export interface CreateAreaBody {
  name: string;
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  zoneId: string;
}

/** Body for PATCH /org/areas/:id (all fields optional) */
export interface UpdateAreaBody {
  name?: string;
  horaInicio?: string; // HH:MM
  horaFin?: string; // HH:MM
}
