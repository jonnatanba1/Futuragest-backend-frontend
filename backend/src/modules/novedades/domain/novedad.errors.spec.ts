/**
 * T-09 — Unit tests for novedad.errors.ts
 *
 * TDD RED phase: these tests fail until novedad.errors.ts is created.
 * Each error class must:
 * - be an instance of Error
 * - have a non-empty message
 * - have the correct name property
 * - have the correct httpStatus hint
 */

import {
  NovedadNotFoundError,
  NovedadAlreadyExistsError,
  AttendanceNotCompletedError,
  ImmutableNovedadError,
  InvalidHorasExtraError,
  AttendanceNotFoundError,
} from './novedad.errors';

describe('NovedadNotFoundError', () => {
  it('is an instance of Error', () => {
    const err = new NovedadNotFoundError('some-id');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a non-empty message', () => {
    const err = new NovedadNotFoundError('some-id');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('has name = NovedadNotFoundError', () => {
    const err = new NovedadNotFoundError('some-id');
    expect(err.name).toBe('NovedadNotFoundError');
  });

  it('has httpStatus = 404', () => {
    const err = new NovedadNotFoundError('some-id');
    expect(err.httpStatus).toBe(404);
  });
});

describe('AttendanceNotFoundError', () => {
  it('is an instance of Error', () => {
    const err = new AttendanceNotFoundError('some-id');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a non-empty message', () => {
    const err = new AttendanceNotFoundError('some-id');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('has name = AttendanceNotFoundError', () => {
    const err = new AttendanceNotFoundError('some-id');
    expect(err.name).toBe('AttendanceNotFoundError');
  });

  it('has httpStatus = 404', () => {
    const err = new AttendanceNotFoundError('some-id');
    expect(err.httpStatus).toBe(404);
  });
});

describe('NovedadAlreadyExistsError', () => {
  it('is an instance of Error', () => {
    const err = new NovedadAlreadyExistsError('attendance-id');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a non-empty message', () => {
    const err = new NovedadAlreadyExistsError('attendance-id');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('has name = NovedadAlreadyExistsError', () => {
    const err = new NovedadAlreadyExistsError('attendance-id');
    expect(err.name).toBe('NovedadAlreadyExistsError');
  });

  it('has httpStatus = 409', () => {
    const err = new NovedadAlreadyExistsError('attendance-id');
    expect(err.httpStatus).toBe(409);
  });
});

describe('AttendanceNotCompletedError', () => {
  it('is an instance of Error', () => {
    const err = new AttendanceNotCompletedError('attendance-id');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a non-empty message', () => {
    const err = new AttendanceNotCompletedError('attendance-id');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('has name = AttendanceNotCompletedError', () => {
    const err = new AttendanceNotCompletedError('attendance-id');
    expect(err.name).toBe('AttendanceNotCompletedError');
  });

  it('has httpStatus = 409', () => {
    const err = new AttendanceNotCompletedError('attendance-id');
    expect(err.httpStatus).toBe(409);
  });
});

describe('ImmutableNovedadError', () => {
  it('is an instance of Error', () => {
    const err = new ImmutableNovedadError('novedad-id');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a non-empty message', () => {
    const err = new ImmutableNovedadError('novedad-id');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('has name = ImmutableNovedadError', () => {
    const err = new ImmutableNovedadError('novedad-id');
    expect(err.name).toBe('ImmutableNovedadError');
  });

  it('has httpStatus = 409', () => {
    const err = new ImmutableNovedadError('novedad-id');
    expect(err.httpStatus).toBe(409);
  });
});

describe('InvalidHorasExtraError', () => {
  it('is an instance of Error', () => {
    const err = new InvalidHorasExtraError('0');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a non-empty message', () => {
    const err = new InvalidHorasExtraError('0');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('has name = InvalidHorasExtraError', () => {
    const err = new InvalidHorasExtraError('0');
    expect(err.name).toBe('InvalidHorasExtraError');
  });

  it('has httpStatus = 400', () => {
    const err = new InvalidHorasExtraError('0');
    expect(err.httpStatus).toBe(400);
  });
});
