/**
 * T-06 — Unit tests for operario domain errors (RED phase).
 *
 * Asserts each error class exists, has correct name and httpStatus.
 */

import {
  DuplicateDocumentoError,
  OperarioSupervisorNotFoundError,
  AlreadyInactiveError,
  AlreadyActiveError,
  OperarioNotFoundError,
} from './operario.errors';

describe('operario domain errors', () => {
  describe('DuplicateDocumentoError', () => {
    it('has httpStatus 409', () => {
      const err = new DuplicateDocumentoError('12345678');
      expect(err.httpStatus).toBe(409);
      expect(err.name).toBe('DuplicateDocumentoError');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('OperarioSupervisorNotFoundError', () => {
    it('has httpStatus 400', () => {
      const err = new OperarioSupervisorNotFoundError('sup@example.com');
      expect(err.httpStatus).toBe(400);
      expect(err.name).toBe('OperarioSupervisorNotFoundError');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('AlreadyInactiveError', () => {
    it('has httpStatus 409', () => {
      const err = new AlreadyInactiveError('operario-id-1');
      expect(err.httpStatus).toBe(409);
      expect(err.name).toBe('AlreadyInactiveError');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('AlreadyActiveError', () => {
    it('has httpStatus 409', () => {
      const err = new AlreadyActiveError('operario-id-2');
      expect(err.httpStatus).toBe(409);
      expect(err.name).toBe('AlreadyActiveError');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('OperarioNotFoundError', () => {
    it('has httpStatus 404', () => {
      const err = new OperarioNotFoundError('operario-id-3');
      expect(err.httpStatus).toBe(404);
      expect(err.name).toBe('OperarioNotFoundError');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
