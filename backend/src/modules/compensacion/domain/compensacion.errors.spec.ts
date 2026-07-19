/**
 * A2.1 RED — domain error classes spec.
 * Each error carries httpStatus and code matching the catalog (spec §7).
 */

import {
  NoPolicyForDateError,
  JornadaPolicyOverlapsLiquidatedPeriodError,
  JornadaPolicyDuplicateEffectiveDateError,
  JornadaPolicyInvalidHorasError,
  CompensationPeriodAlreadyClosedError,
  DispositionRequiredError,
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
    it('carries httpStatus 409 and code POLICY_DUPLICATE_DATE (legacy call signature)', () => {
      const err = new JornadaPolicyDuplicateEffectiveDateError('2026-07-01');
      expect(err.httpStatus).toBe(409);
      expect(err.code).toBe('POLICY_DUPLICATE_DATE');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('2026-07-01');
    });

    it('T6a — scope = GLOBAL → message mentions "ámbito global"', () => {
      const err = new JornadaPolicyDuplicateEffectiveDateError({
        vigenteDesde: '2026-07-01',
        operarioId: null,
        zoneId: null,
      });
      expect(err.code).toBe('POLICY_DUPLICATE_DATE');
      expect(err.httpStatus).toBe(409);
      expect(err.message).toContain('2026-07-01');
      expect(err.message).toContain('ámbito global');
    });

    it('T6b — scope = per-zone → message mentions "zona {zoneId}"', () => {
      const err = new JornadaPolicyDuplicateEffectiveDateError({
        vigenteDesde: '2026-08-01',
        operarioId: null,
        zoneId: 'zona-norte',
      });
      expect(err.code).toBe('POLICY_DUPLICATE_DATE');
      expect(err.message).toContain('2026-08-01');
      expect(err.message).toContain('zona zona-norte');
      expect(err.message).not.toContain('ámbito global');
    });

    it('T6c — scope = per-operario → message mentions "operario {operarioId}"', () => {
      const err = new JornadaPolicyDuplicateEffectiveDateError({
        vigenteDesde: '2026-09-01',
        operarioId: 'op-77',
        zoneId: null,
      });
      expect(err.code).toBe('POLICY_DUPLICATE_DATE');
      expect(err.message).toContain('2026-09-01');
      expect(err.message).toContain('operario op-77');
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

  // ── PR-B errors ──────────────────────────────────────────────────────────────

  describe('CompensationPeriodAlreadyClosedError', () => {
    it('carries httpStatus 409 and code PERIOD_ALREADY_CLOSED', () => {
      const err = new CompensationPeriodAlreadyClosedError('O1', '2026-05-Q1');
      expect(err.httpStatus).toBe(409);
      expect(err.code).toBe('PERIOD_ALREADY_CLOSED');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('O1');
      expect(err.message).toContain('2026-05-Q1');
    });
  });

  describe('DispositionRequiredError', () => {
    it('carries httpStatus 422 and code DISPOSITION_REQUIRED', () => {
      const err = new DispositionRequiredError('2026-05-Q1');
      expect(err.httpStatus).toBe(422);
      expect(err.code).toBe('DISPOSITION_REQUIRED');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('2026-05-Q1');
    });
  });
});
