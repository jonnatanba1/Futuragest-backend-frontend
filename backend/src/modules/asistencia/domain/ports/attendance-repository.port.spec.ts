/**
 * T-06 RED → T-07 GREEN: structural assertion for AttendanceRepositoryPort.
 * Asserts the port exports the ATTENDANCE_REPOSITORY_PORT symbol and the
 * interface shape expected by use-cases.
 */

import {
  ATTENDANCE_REPOSITORY_PORT,
  type AttendanceRepositoryPort,
  type CreateAttendanceData,
  type UpdateAttendanceData,
} from './attendance-repository.port';

describe('AttendanceRepositoryPort — structural contract', () => {
  it('exports ATTENDANCE_REPOSITORY_PORT as a Symbol', () => {
    expect(typeof ATTENDANCE_REPOSITORY_PORT).toBe('symbol');
    expect(ATTENDANCE_REPOSITORY_PORT.toString()).toContain('AttendanceRepositoryPort');
  });

  it('the port type has the required method signatures (compile-time check)', () => {
    // This is a compile-time-only assertion: if AttendanceRepositoryPort does not
    // have these methods, TypeScript will fail to compile this file.
    type _Methods = {
      create: AttendanceRepositoryPort['create'];
      findById: AttendanceRepositoryPort['findById'];
      findMany: AttendanceRepositoryPort['findMany'];
      findByClientRef: AttendanceRepositoryPort['findByClientRef'];
      update: AttendanceRepositoryPort['update'];
    };
    // Runtime: just confirm the import succeeded
    expect(ATTENDANCE_REPOSITORY_PORT).toBeDefined();
  });

  it('CreateAttendanceData type is importable', () => {
    // Compile-time check: type must be exported
    type _Check = CreateAttendanceData;
    expect(true).toBe(true);
  });

  it('UpdateAttendanceData type is importable', () => {
    type _Check = UpdateAttendanceData;
    expect(true).toBe(true);
  });
});
