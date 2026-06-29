/**
 * T-13 RED → T-14 GREEN: structural assertion for attendance domain errors.
 * Each error class must exist with the correct name and HTTP hint.
 */

import {
  AttendanceAlreadyExistsError,
  AttendanceNotFoundError,
  ImmutableAttendanceError,
  PhotoRequiredError,
  InvalidGpsError,
  OperarioNotInScopeError,
} from './attendance.errors';

describe('Attendance domain errors', () => {
  it('AttendanceAlreadyExistsError has name and is an Error', () => {
    const stub = { id: 'ATT-1' } as unknown as import('@prisma/client').Attendance;
    const err = new AttendanceAlreadyExistsError('O1', '2026-05-31', stub);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AttendanceAlreadyExistsError');
    expect(err.httpStatus).toBe(409);
    expect(err.message).toContain('O1');
    expect(err.conflicting).toBe(stub);
  });

  it('AttendanceNotFoundError has name and is an Error', () => {
    const err = new AttendanceNotFoundError('A1');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AttendanceNotFoundError');
    expect(err.httpStatus).toBe(404);
  });

  it('ImmutableAttendanceError has name and is an Error', () => {
    const stub = { id: 'ATT-1' } as unknown as import('@prisma/client').Attendance;
    const err = new ImmutableAttendanceError('A1', stub);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ImmutableAttendanceError');
    expect(err.httpStatus).toBe(409);
    expect(err.conflicting).toBe(stub);
  });

  it('PhotoRequiredError has name and is an Error', () => {
    const err = new PhotoRequiredError('A1');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PhotoRequiredError');
    expect(err.httpStatus).toBe(422);
  });

  it('InvalidGpsError has name and is an Error', () => {
    const err = new InvalidGpsError('lat', 999);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('InvalidGpsError');
    expect(err.httpStatus).toBe(400);
    expect(err.message).toContain('lat');
  });

  it('OperarioNotInScopeError has name and is an Error', () => {
    const err = new OperarioNotInScopeError('O1');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OperarioNotInScopeError');
    expect(err.httpStatus).toBe(404);
  });
});
