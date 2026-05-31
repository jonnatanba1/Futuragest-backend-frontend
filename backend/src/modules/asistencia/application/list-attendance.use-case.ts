/**
 * ListAttendanceUseCase — returns all attendance records visible to the current principal.
 * Scope filtering is handled by ScopedAttendanceRepository.findManyScoped().
 */

import type { Attendance } from '@prisma/client';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';

export class ListAttendanceUseCase {
  constructor(private readonly attendanceRepo: AttendanceRepositoryPort) {}

  execute(): Promise<Attendance[]> {
    return this.attendanceRepo.findMany();
  }
}
