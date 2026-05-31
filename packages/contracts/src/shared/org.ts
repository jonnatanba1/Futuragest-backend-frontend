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
}

/** Municipio returned by GET /org/municipios */
export interface MunicipioResponseDto {
  id: string;
  name: string;
  zoneId: string;
  createdAt: string; // ISO 8601
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
}
