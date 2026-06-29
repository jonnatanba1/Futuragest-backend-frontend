/**
 * Contracts — GET /auth/me response types.
 *
 * Discriminated union by `role`. Every branch carries explicit null
 * for the fields that don't apply to that role (stable shape for Dart codegen).
 */

export type RoleName =
  | 'SYSTEM_ADMIN'
  | 'GERENCIA'
  | 'TALENTO_HUMANO'
  | 'LIDER_OPERATIVO'
  | 'COORDINADOR'
  | 'SUPERVISOR';

export interface ZoneRef {
  id: string;
  name: string;
}

export interface MunicipioRef {
  id: string;
  name: string;
}

/** Base fields present in every role variant. */
interface MeBase {
  id: string;
  email: string;
  mustChangePassword: boolean;
}

/**
 * COORDINADOR — coordinatedZone is present (null when unassigned).
 * supervisor is always null.
 */
export interface MeCoordinador extends MeBase {
  role: 'COORDINADOR';
  coordinatedZone: ZoneRef | null;
  supervisor: null;
}

/**
 * SUPERVISOR — full supervisor block always present.
 * coordinatedZone is always null.
 */
export interface MeSupervisor extends MeBase {
  role: 'SUPERVISOR';
  coordinatedZone: null;
  supervisor: {
    id: string;
    area: string;
    zone: ZoneRef;
    municipio: MunicipioRef;
  };
}

/**
 * Global roles: SYSTEM_ADMIN | GERENCIA | TALENTO_HUMANO | LIDER_OPERATIVO.
 * Both scoped fields are null.
 */
export interface MeGlobalRole extends MeBase {
  role: Exclude<RoleName, 'COORDINADOR' | 'SUPERVISOR'>;
  coordinatedZone: null;
  supervisor: null;
}

/** Discriminated union — the canonical MeResponse type exported to all consumers. */
export type MeResponse = MeCoordinador | MeSupervisor | MeGlobalRole;
