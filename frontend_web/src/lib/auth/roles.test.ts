import { describe, expect, it } from 'vitest';
import { hasAnyRole, OPERARIO_WRITE_ROLES, COMPENSACION_WRITE_ROLES } from './roles';

describe('hasAnyRole', () => {
  it('is true when the role is in the allowed list', () => {
    expect(hasAnyRole('TALENTO_HUMANO', OPERARIO_WRITE_ROLES)).toBe(true);
    expect(hasAnyRole('SYSTEM_ADMIN', OPERARIO_WRITE_ROLES)).toBe(true);
  });

  it('is false for roles outside the list', () => {
    expect(hasAnyRole('SUPERVISOR', OPERARIO_WRITE_ROLES)).toBe(false);
    expect(hasAnyRole('COORDINADOR', OPERARIO_WRITE_ROLES)).toBe(false);
  });

  it('is false for null/undefined', () => {
    expect(hasAnyRole(null, OPERARIO_WRITE_ROLES)).toBe(false);
    expect(hasAnyRole(undefined, OPERARIO_WRITE_ROLES)).toBe(false);
  });
});

describe('COMPENSACION_WRITE_ROLES', () => {
  it('includes SYSTEM_ADMIN and TALENTO_HUMANO', () => {
    expect(COMPENSACION_WRITE_ROLES).toContain('SYSTEM_ADMIN');
    expect(COMPENSACION_WRITE_ROLES).toContain('TALENTO_HUMANO');
  });

  it('does not include read-only office roles', () => {
    expect(COMPENSACION_WRITE_ROLES).not.toContain('COORDINADOR');
    expect(COMPENSACION_WRITE_ROLES).not.toContain('GERENCIA');
    expect(COMPENSACION_WRITE_ROLES).not.toContain('LIDER_OPERATIVO');
  });

  it('hasAnyRole returns true for TALENTO_HUMANO', () => {
    expect(hasAnyRole('TALENTO_HUMANO', COMPENSACION_WRITE_ROLES)).toBe(true);
  });

  it('hasAnyRole returns false for COORDINADOR', () => {
    expect(hasAnyRole('COORDINADOR', COMPENSACION_WRITE_ROLES)).toBe(false);
  });
});
