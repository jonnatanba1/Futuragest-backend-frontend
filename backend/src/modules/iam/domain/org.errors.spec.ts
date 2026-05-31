/**
 * T-00 — Unit tests for org domain error classes.
 * Written FIRST (TDD red phase) — all fail before org.errors.ts exists.
 *
 * Verifies:
 * - Each error class is an instance of Error
 * - Each error has the correct name property
 * - Each error carries a descriptive message
 */

import {
  InvalidCoordinadorRoleError,
  UnsupportedProvisionRoleError,
  ZoneNotFoundError,
  UserNotFoundError,
  EmailInUseError,
} from './org.errors';

describe('org domain errors', () => {
  describe('InvalidCoordinadorRoleError', () => {
    it('is an instance of Error', () => {
      const err = new InvalidCoordinadorRoleError('SUPERVISOR');
      expect(err).toBeInstanceOf(Error);
    });

    it('has name InvalidCoordinadorRoleError', () => {
      const err = new InvalidCoordinadorRoleError('SUPERVISOR');
      expect(err.name).toBe('InvalidCoordinadorRoleError');
    });

    it('message contains the offending role', () => {
      const err = new InvalidCoordinadorRoleError('SUPERVISOR');
      expect(err.message).toContain('SUPERVISOR');
    });
  });

  describe('UnsupportedProvisionRoleError', () => {
    it('is an instance of Error', () => {
      const err = new UnsupportedProvisionRoleError('SYSTEM_ADMIN');
      expect(err).toBeInstanceOf(Error);
    });

    it('has name UnsupportedProvisionRoleError', () => {
      const err = new UnsupportedProvisionRoleError('SYSTEM_ADMIN');
      expect(err.name).toBe('UnsupportedProvisionRoleError');
    });

    it('message contains the offending role', () => {
      const err = new UnsupportedProvisionRoleError('SYSTEM_ADMIN');
      expect(err.message).toContain('SYSTEM_ADMIN');
    });
  });

  describe('ZoneNotFoundError', () => {
    it('is an instance of Error', () => {
      const err = new ZoneNotFoundError('zone-uuid-1');
      expect(err).toBeInstanceOf(Error);
    });

    it('has name ZoneNotFoundError', () => {
      const err = new ZoneNotFoundError('zone-uuid-1');
      expect(err.name).toBe('ZoneNotFoundError');
    });

    it('message contains the zoneId', () => {
      const err = new ZoneNotFoundError('zone-uuid-1');
      expect(err.message).toContain('zone-uuid-1');
    });
  });

  describe('UserNotFoundError', () => {
    it('is an instance of Error', () => {
      const err = new UserNotFoundError('user-uuid-1');
      expect(err).toBeInstanceOf(Error);
    });

    it('has name UserNotFoundError', () => {
      const err = new UserNotFoundError('user-uuid-1');
      expect(err.name).toBe('UserNotFoundError');
    });

    it('message contains the userId', () => {
      const err = new UserNotFoundError('user-uuid-1');
      expect(err.message).toContain('user-uuid-1');
    });
  });

  describe('EmailInUseError', () => {
    it('is an instance of Error', () => {
      const err = new EmailInUseError('admin@futuragest.co');
      expect(err).toBeInstanceOf(Error);
    });

    it('has name EmailInUseError', () => {
      const err = new EmailInUseError('admin@futuragest.co');
      expect(err.name).toBe('EmailInUseError');
    });

    it('message contains the email', () => {
      const err = new EmailInUseError('admin@futuragest.co');
      expect(err.message).toContain('admin@futuragest.co');
    });
  });
});
