-- CreateEnum
CREATE TYPE "NovedadStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Novedad" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "horasExtra" DECIMAL(5,2) NOT NULL,
    "motivo" TEXT,
    "status" "NovedadStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Novedad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Novedad_supervisorId_idx" ON "Novedad"("supervisorId");

-- CreateIndex
CREATE INDEX "Novedad_zoneId_idx" ON "Novedad"("zoneId");

-- CreateIndex
CREATE INDEX "Novedad_status_idx" ON "Novedad"("status");

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: at most one ACTIVE (PENDING or APPROVED) novedad per attendance.
-- REJECTED rows do not count toward the limit (partial unique excludes them).
-- Mirror pattern: "Assignment_operarioId_active_key" ON "Assignment"("operarioId") WHERE "endDate" IS NULL
CREATE UNIQUE INDEX "Novedad_attendanceId_active_key" ON "Novedad"("attendanceId") WHERE status IN ('PENDING', 'APPROVED');
