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
    // Compile-time-only: if AttendanceRepositoryPort is missing a method,
    // TypeScript fails to compile. The satisfies check forces type resolution.
    const _methods: {
      create: AttendanceRepositoryPort['create'];
      findById: AttendanceRepositoryPort['findById'];
      findMany: AttendanceRepositoryPort['findMany'];
      findByClientRef: AttendanceRepositoryPort['findByClientRef'];
      update: AttendanceRepositoryPort['update'];
    } = null as never;
    void _methods;
    // Runtime: just confirm the import succeeded
    expect(ATTENDANCE_REPOSITORY_PORT).toBeDefined();
  });

  it('CreateAttendanceData type is importable', () => {
    // Compile-time check: type must be exported and resolvable
    const _check: CreateAttendanceData = null as never;
    void _check;
    expect(true).toBe(true);
  });

  it('UpdateAttendanceData type is importable', () => {
    const _check: UpdateAttendanceData = null as never;
    void _check;
    expect(true).toBe(true);
  });
});
