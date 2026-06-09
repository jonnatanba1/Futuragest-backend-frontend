import { describe, expect, it } from 'vitest';
import { hasAnyRole, OPERARIO_WRITE_ROLES } from './roles';

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
