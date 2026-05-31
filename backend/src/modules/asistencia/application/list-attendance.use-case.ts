/**
 * ListAttendanceUseCase — returns all attendance records visible to the current principal.
 * Scope filtering is handled by ScopedAttendanceRepository.findManyScoped().
 *
 * Delta mode: pass `since` to return only records with updatedAt >= since.
 * Absent → full scoped list (backward compatible).
 */

import type { Attendance } from '@prisma/client';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';

export class ListAttendanceUseCase {
  constructor(private readonly attendanceRepo: AttendanceRepositoryPort) {}

  execute(since?: Date): Promise<Attendance[]> {
    return this.attendanceRepo.findMany(since);
  }
}
