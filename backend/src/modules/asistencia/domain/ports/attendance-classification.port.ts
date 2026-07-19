export const ATTENDANCE_CLASSIFICATION_PORT = Symbol('AttendanceClassificationPort');

export interface AttendanceClassificationPort {
  classifyAttendance(attendanceId: string): Promise<void>;
}
