/**
 * A2.1 RED — domain error classes spec.
 * Each error carries httpStatus and code matching the catalog (spec §7).
 */

import {
  NoPolicyForDateError,
  JornadaPolicyOverlapsLiquidatedPeriodError,
  JornadaPolicyDuplicateEffectiveDateError,
  JornadaPolicyInvalidHorasError,
} from './compensacion.errors';

describe('compensacion domain errors', () => {
  describe('NoPolicyForDateError', () => {
    it('carries httpStatus 422 and code NO_POLICY_FOR_DATE', () => {
      const err = new NoPolicyForDateError('2025-12-31');
      expect(err.httpStatus).toBe(422);
      expect(err.code).toBe('NO_POLICY_FOR_DATE');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('2025-12-31');
    });
  });

  describe('JornadaPolicyOverlapsLiquidatedPeriodError', () => {
    it('carries httpStatus 409 and code POLICY_OVERLAPS_LIQUIDATED', () => {
      const err = new JornadaPolicyOverlapsLiquidatedPeriodError('2026-05-10');
      expect(err.httpStatus).toBe(409);
      expect(err.code).toBe('POLICY_OVERLAPS_LIQUIDATED');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('2026-05-10');
    });
  });

  describe('JornadaPolicyDuplicateEffectiveDateError', () => {
    it('carries httpStatus 409 and code POLICY_DUPLICATE_DATE', () => {
      const err = new JornadaPolicyDuplicateEffectiveDateError('2026-07-01');
      expect(err.httpStatus).toBe(409);
      expect(err.code).toBe('POLICY_DUPLICATE_DATE');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('2026-07-01');
    });
  });

  describe('JornadaPolicyInvalidHorasError', () => {
    it('carries httpStatus 400 and code POLICY_INVALID_HORAS', () => {
      const err = new JornadaPolicyInvalidHorasError(0);
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('POLICY_INVALID_HORAS');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('0');
    });

    it('includes the invalid value in the message for value 24.01', () => {
      const err = new JornadaPolicyInvalidHorasError(24.01);
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('POLICY_INVALID_HORAS');
      expect(err.message).toContain('24.01');
    });
  });
});
