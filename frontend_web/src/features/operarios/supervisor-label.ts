import type { MunicipioResponseDto, ZoneResponseDto } from '@futuragest/contracts';
import type { SupervisorDto } from '../../lib/api/client';

/** Title-case a supervisor area enum (e.g. RECOLECCION -> Recolección-ish). */
function formatArea(area: string): string {
  const pretty = area.charAt(0) + area.slice(1).toLowerCase();
  return pretty.replace(/_/g, ' ');
}

/**
 * Build a human label for each supervisor. Email is the identifying handle;
 * municipio/zone add context:
 *   "sup-a1@futuragest.co · Apartadó · Zona Urabá"
 * Falls back to area when email is absent, and drops any join target that
 * cannot be resolved (e.g. when /org/* is forbidden for the caller's role).
 */
export function buildSupervisorLabelMap(
  supervisors: SupervisorDto[],
  zones: ZoneResponseDto[],
  municipios: MunicipioResponseDto[],
): Map<string, string> {
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const muniName = new Map(municipios.map((m) => [m.id, m.name]));
  const map = new Map<string, string>();
  for (const s of supervisors) {
    const primary = s.email || formatArea(s.area);
    const context = [muniName.get(s.municipioId), zoneName.get(s.zoneId)].filter(
      (p): p is string => Boolean(p),
    );
    map.set(s.id, [primary, ...context].join(' · '));
  }
  return map;
}
