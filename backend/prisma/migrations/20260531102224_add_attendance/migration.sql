-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "operarioId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkInCapturedAt" TIMESTAMP(3) NOT NULL,
    "checkInReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkInLat" DOUBLE PRECISION NOT NULL,
    "checkInLng" DOUBLE PRECISION NOT NULL,
    "checkInAccuracy" DOUBLE PRECISION,
    "checkOutCapturedAt" TIMESTAMP(3),
    "checkOutReceivedAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutAccuracy" DOUBLE PRECISION,
    "signatureKey" TEXT,
    "clientRef" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_clientRef_key" ON "Attendance"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_operarioId_date_key" ON "Attendance"("operarioId", "date");

-- CreateIndex
CREATE INDEX "Attendance_supervisorId_idx" ON "Attendance"("supervisorId");

-- CreateIndex
CREATE INDEX "Attendance_operarioId_idx" ON "Attendance"("operarioId");

-- CreateIndex
CREATE INDEX "Attendance_zoneId_idx" ON "Attendance"("zoneId");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_operarioId_fkey" FOREIGN KEY ("operarioId") REFERENCES "Operario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
