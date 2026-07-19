import { AttendanceBreakdown, Prisma } from '@prisma/client';

export const ATTENDANCE_BREAKDOWN_REPOSITORY_PORT = Symbol('AttendanceBreakdownRepositoryPort');

export interface AttendanceBreakdownRepositoryPort {
  /**
   * Persists or updates the attendance breakdown.
   */
  upsert(
    attendanceId: string,
    data: Prisma.AttendanceBreakdownUncheckedCreateInput,
  ): Promise<AttendanceBreakdown>;

  /**
   * Finds the breakdown for a specific attendance.
   */
  findByAttendanceId(attendanceId: string): Promise<AttendanceBreakdown | null>;
}
