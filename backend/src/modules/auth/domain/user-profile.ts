/**
 * Auth domain — UserProfile projection.
 *
 * Flat, nullable struct returned by findUserWithScope.
 * Never exposes passwordHash — structural no-leak guarantee.
 * Repo returns flat; use-case shapes the discriminated MeResponse.
 */
export interface UserProfile {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;

  // COORDINADOR scope — null when role != COORDINADOR or zone unassigned
  coordinatedZoneId: string | null;
  coordinatedZoneName: string | null;

  // SUPERVISOR scope — null when role != SUPERVISOR
  supervisorId: string | null;       // Supervisor table PK (NOT User.id)
  supervisorArea: string | null;
  supervisorZoneId: string | null;
  supervisorZoneName: string | null;
  supervisorMunicipioId: string | null;
  supervisorMunicipioName: string | null;
}
