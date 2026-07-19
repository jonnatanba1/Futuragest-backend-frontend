-- DropForeignKey
ALTER TABLE "AttendanceBreakdown" DROP CONSTRAINT "AttendanceBreakdown_attendanceId_fkey";

-- DropForeignKey
ALTER TABLE "CompensatoryRest" DROP CONSTRAINT "CompensatoryRest_attendanceId_fkey";

-- AddForeignKey
ALTER TABLE "AttendanceBreakdown" ADD CONSTRAINT "AttendanceBreakdown_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensatoryRest" ADD CONSTRAINT "CompensatoryRest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
