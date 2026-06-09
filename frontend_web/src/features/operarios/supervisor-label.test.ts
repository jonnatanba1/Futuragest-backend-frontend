import { describe, expect, it } from 'vitest';
import type { SupervisorDto } from '../../lib/api/client';
import { buildSupervisorLabelMap } from './supervisor-label';

const supervisors: SupervisorDto[] = [
  {
    id: 'sup-1',
    userId: 'u-1',
    municipioId: 'm-1',
    zoneId: 'z-1',
    area: 'BARRIDO',
    email: 'sup-a1@futuragest.co',
    createdAt: '2026-01-01T00:00:00Z',
  },
];
const zones = [{ id: 'z-1', name: 'Zona Urabá', createdAt: '', updatedAt: '' }];
const municipios = [{ id: 'm-1', name: 'Apartadó', zoneId: 'z-1', createdAt: '', updatedAt: '' }];

describe('buildSupervisorLabelMap', () => {
  it('leads with the email and appends municipio and zone', () => {
    const map = buildSupervisorLabelMap(supervisors, zones, municipios);
    expect(map.get('sup-1')).toBe('sup-a1@futuragest.co · Apartadó · Zona Urabá');
  });

  it('omits context parts that cannot be resolved', () => {
    const map = buildSupervisorLabelMap(supervisors, [], []);
    expect(map.get('sup-1')).toBe('sup-a1@futuragest.co');
  });

  it('falls back to area when email is absent', () => {
    const noEmail = [{ ...supervisors[0], email: '' }];
    const map = buildSupervisorLabelMap(noEmail, [], []);
    expect(map.get('sup-1')).toBe('Barrido');
  });
});
