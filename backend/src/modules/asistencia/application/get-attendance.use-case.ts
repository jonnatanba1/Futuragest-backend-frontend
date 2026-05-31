/**
 * GetAttendanceUseCase — retrieves a single attendance record by id (scoped).
 * Returns null from the scoped repo → throws AttendanceNotFoundError (404).
 */

import type { Attendance } from '@prisma/client';
import type { AttendanceRepositoryPort } from '../domain/ports/attendance-repository.port';
import { AttendanceNotFoundError } from '../domain/attendance.errors';

export class GetAttendanceUseCase {
  constructor(private readonly attendanceRepo: AttendanceRepositoryPort) {}

  async execute(id: string): Promise<Attendance> {
    const attendance = await this.attendanceRepo.findById(id);
    if (!attendance) {
      throw new AttendanceNotFoundError(id);
    }
    return attendance;
  }
}
